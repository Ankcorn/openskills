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
	/** Route type */
	route: "versions" | "latest";
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
 * Analytics service for tracking skill downloads.
 */
export interface Analytics {
	/**
	 * Track a skill download event.
	 */
	trackDownload(event: DownloadEvent): void;
}

/**
 * Create an analytics service instance.
 *
 * If dataset is null, events are silently dropped (useful for testing).
 */
export function makeAnalytics(dataset: AnalyticsDataset | null): Analytics {
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
