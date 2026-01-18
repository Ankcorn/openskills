/**
 * Analytics service for tracking skill downloads using Workers Analytics Engine.
 *
 * Event Shape:
 * - Dataset: configured per deployment via ANALYTICS binding
 * - index1: "{namespaceId}/{skillId}@{version}" (max 96 bytes, uses nanoids)
 * - blob1: namespace_id (nanoid, for prefix queries by namespace)
 * - blob2: skill_id (nanoid)
 * - blob3: version
 * - blob4: route (e.g., "versions", "latest")
 * - blob5: request_id (optional)
 * - blob6: namespace (human-readable, for display)
 * - blob7: skill_name (human-readable, for display)
 * - double1: bytes
 */

import { Logger } from "hatchlet";

const log = new Logger({ dev: process.env.NODE_ENV !== "production" });

/**
 * Download event data
 */
export interface DownloadEvent {
	/** Nanoid for the namespace (from user profile) */
	namespaceId: string;
	/** Nanoid for the skill (from skill metadata) */
	skillId: string;
	/** Human-readable namespace */
	namespace: string;
	/** Human-readable skill name */
	skillName: string;
	/** Version string */
	version: string;
	/** Route type: API routes (versions, latest) or UI routes (ui-latest, ui-versions) */
	route: "versions" | "latest" | "ui-latest" | "ui-versions";
	/** Content size in bytes */
	bytes: number;
	/** Optional request ID (e.g., cf-ray) */
	requestId?: string;
}

/**
 * Analytics Engine dataset interface (subset of AnalyticsEngineDataset)
 */
export interface AnalyticsDataset {
	writeDataPoint(event: {
		indexes?: Array<string | null>;
		blobs?: Array<string | ArrayBuffer | null>;
		doubles?: number[];
	}): void;
}

/**
 * Top skill result from analytics query.
 */
export interface TopSkill {
	namespace: string;
	skillName: string;
	skillId: string;
	downloads: number;
}

/**
 * Analytics service for tracking skill downloads.
 */
export interface Analytics {
	/**
	 * Track a skill download event.
	 */
	trackDownload(event: DownloadEvent): void;

	/**
	 * Get top downloaded skills.
	 * Returns empty array if analytics querying is not configured.
	 */
	getTopSkills(days?: number, limit?: number): Promise<TopSkill[]>;

	/**
	 * Get download count for a specific skill.
	 * Returns 0 if analytics querying is not configured.
	 */
	getSkillDownloads(skillId: string, days?: number): Promise<number>;
}

/**
 * Configuration for analytics querying.
 */
export interface AnalyticsQueryConfig {
	/** Cloudflare account ID */
	accountId: string;
	/** API token with Analytics Engine read permissions */
	apiToken: string;
}

/**
 * Create an analytics service instance.
 *
 * @param dataset - Analytics Engine dataset for writing events (null to disable writes)
 * @param queryConfig - Configuration for querying analytics (null to disable queries)
 */
export function makeAnalytics(
	dataset: AnalyticsDataset | null,
	queryConfig?: AnalyticsQueryConfig | null,
): Analytics {
	return {
		trackDownload(event: DownloadEvent): void {
			if (!dataset) {
				return;
			}

			// Index format: {namespaceId}/{skillId}@{version}
			// Max 96 bytes: 21 + 1 + 21 + 1 + ~30 = ~74 bytes (safe margin)
			const index1 = `${event.namespaceId}/${event.skillId}@${event.version}`;

			dataset.writeDataPoint({
				indexes: [index1],
				blobs: [
					event.namespaceId,
					event.skillId,
					event.version,
					event.route,
					event.requestId ?? "",
					event.namespace,
					event.skillName,
				],
				doubles: [event.bytes],
			});
		},

		async getTopSkills(days = 7, limit = 10): Promise<TopSkill[]> {
			if (!queryConfig) {
				return [];
			}

			const query = `
SELECT
  blob6 AS namespace,
  blob7 AS skill_name,
  blob2 AS skill_id,
  SUM(_sample_interval) AS downloads
FROM openskills_downloads
WHERE timestamp > NOW() - INTERVAL '${days}' DAY
GROUP BY namespace, skill_name, skill_id
ORDER BY downloads DESC
LIMIT ${limit}
FORMAT JSON
`.trim();

			try {
				const response = await fetch(
					`https://api.cloudflare.com/client/v4/accounts/${queryConfig.accountId}/analytics_engine/sql`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${queryConfig.apiToken}`,
							"Content-Type": "text/plain",
						},
						body: query,
					},
				);

				if (!response.ok) {
					const text = await response.text();
					log.warn`[ANALYTICS] getTopSkills failed: status=${response.status}, body=${text}`;
					return [];
				}

				const result = (await response.json()) as {
					data?: Array<{
						namespace: string;
						skill_name: string;
						skill_id: string;
						downloads: number;
					}>;
				};

				return (result.data ?? []).map((row) => ({
					namespace: row.namespace,
					skillName: row.skill_name,
					skillId: row.skill_id,
					downloads: row.downloads,
				}));
			} catch (err) {
				log.error`[ANALYTICS] getTopSkills error: ${err instanceof Error ? err.message : String(err)}`;
				return [];
			}
		},

		async getSkillDownloads(skillId: string, days = 30): Promise<number> {
			if (!queryConfig) {
				return 0;
			}

			const query = `
SELECT
  SUM(_sample_interval) AS downloads
FROM openskills_downloads
WHERE timestamp > NOW() - INTERVAL '${days}' DAY
  AND blob2 = '${skillId}'
FORMAT JSON
`.trim();

			try {
				const response = await fetch(
					`https://api.cloudflare.com/client/v4/accounts/${queryConfig.accountId}/analytics_engine/sql`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${queryConfig.apiToken}`,
							"Content-Type": "text/plain",
						},
						body: query,
					},
				);

				if (!response.ok) {
					const text = await response.text();
					log.warn`[ANALYTICS] getSkillDownloads failed: skillId=${skillId}, status=${response.status}, body=${text}`;
					return 0;
				}

				const result = (await response.json()) as {
					data?: Array<{ downloads: number }>;
				};

				return result.data?.[0]?.downloads ?? 0;
			} catch (err) {
				log.error`[ANALYTICS] getSkillDownloads error: skillId=${skillId}, error=${err instanceof Error ? err.message : String(err)}`;
				return 0;
			}
		},
	};
}

/**
 * No-op analytics implementation for testing.
 */
export function makeNoOpAnalytics(): Analytics {
	return {
		trackDownload(): void {
			// No-op
		},
		async getTopSkills(): Promise<TopSkill[]> {
			return [];
		},
		async getSkillDownloads(): Promise<number> {
			return 0;
		},
	};
}

/**
 * SQL query helper for analytics API.
 *
 * Blob mapping:
 * - blob1: namespace_id
 * - blob2: skill_id
 * - blob3: version
 * - blob4: route
 * - blob5: request_id
 * - blob6: namespace (human-readable)
 * - blob7: skill_name (human-readable)
 */
export const AnalyticsQueries = {
	/**
	 * Get top downloaded skills in the last N days.
	 */
	topSkills(days: number = 7): string {
		return `
SELECT
  blob6 AS namespace,
  blob7 AS skill_name,
  blob2 AS skill_id,
  SUM(_sample_interval) AS downloads
FROM openskills_downloads
WHERE timestamp > NOW() - INTERVAL '${days}' DAY
GROUP BY namespace, skill_name, skill_id
ORDER BY downloads DESC
LIMIT 100
FORMAT JSON
`.trim();
	},

	/**
	 * Get download counts for a specific skill by skill_id.
	 */
	skillDownloads(skillId: string, days: number = 30): string {
		return `
SELECT
  blob3 AS version,
  SUM(_sample_interval) AS downloads
FROM openskills_downloads
WHERE
  timestamp > NOW() - INTERVAL '${days}' DAY
  AND blob2 = '${skillId}'
GROUP BY version
ORDER BY downloads DESC
FORMAT JSON
`.trim();
	},

	/**
	 * Get download counts by namespace using namespace_id.
	 */
	namespaceDownloads(namespaceId: string, days: number = 30): string {
		return `
SELECT
  blob7 AS skill_name,
  blob2 AS skill_id,
  SUM(_sample_interval) AS downloads
FROM openskills_downloads
WHERE
  timestamp > NOW() - INTERVAL '${days}' DAY
  AND blob1 = '${namespaceId}'
GROUP BY skill_name, skill_id
ORDER BY downloads DESC
FORMAT JSON
`.trim();
	},

	/**
	 * Get total downloads in the last N days.
	 */
	totalDownloads(days: number = 7): string {
		return `
SELECT
  SUM(_sample_interval) AS total_downloads
FROM openskills_downloads
WHERE timestamp > NOW() - INTERVAL '${days}' DAY
FORMAT JSON
`.trim();
	},
} as const;
