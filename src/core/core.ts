import { Result } from "better-result";
import { nanoid } from "nanoid";
import type { StorageBackend } from "../storage/interface.js";
import type {
	Identity,
	SkillFrontmatter,
	SkillMetadata,
	UserProfile,
} from "../types/index.js";
import { skillMetadataSchema, userProfileSchema } from "../types/index.js";
import { type DomainError, Errors } from "./errors.js";
import { parseFrontmatter } from "./frontmatter.js";

/**
 * Storage key helpers
 */
const Keys = {
	metadata(namespace: string, name: string): string {
		return `skills/${namespace}/${name}/metadata.json`;
	},
	version(namespace: string, name: string, version: string): string {
		return `skills/${namespace}/${name}/versions/${version}.md`;
	},
	userProfile(namespace: string): string {
		return `skills/${namespace}/user.json`;
	},
	skillPrefix(namespace: string): string {
		return `skills/${namespace}/`;
	},
	allSkillsPrefix(): string {
		return "skills/";
	},
} as const;

/**
 * Core configuration
 */
export interface CoreConfig {
	storage: StorageBackend;
	maxSkillBytes?: number;
	getNow?: () => Date;
}

/**
 * Publish skill input
 */
export interface PublishSkillInput {
	namespace: string;
	name: string;
	version: string;
	content: string;
	identity: Identity;
}

/**
 * Publish skill result
 */
export interface PublishSkillResult {
	namespace: string;
	name: string;
	version: string;
	size: number;
	checksum: string;
	/** Parsed frontmatter from the skill content */
	frontmatter: SkillFrontmatter;
}

/**
 * Get skill content input
 */
export interface GetSkillContentInput {
	namespace: string;
	name: string;
	version: string;
}

/**
 * Get skill metadata input
 */
export interface GetSkillMetadataInput {
	namespace: string;
	name: string;
}

/**
 * Get skill latest input
 */
export interface GetSkillLatestInput {
	namespace: string;
	name: string;
}

/**
 * Get skill content result (includes IDs for analytics)
 */
export interface GetSkillContentResult {
	content: string;
	/** Skill ID (nanoid) for analytics */
	skillId: string;
	/** Namespace ID (nanoid) for analytics */
	namespaceId: string;
}

/**
 * Get skill latest result
 */
export interface GetSkillLatestResult {
	version: string;
	content: string;
	/** Skill ID (nanoid) for analytics */
	skillId: string;
	/** Namespace ID (nanoid) for analytics */
	namespaceId: string;
}

/**
 * Update profile input
 */
export interface UpdateProfileInput {
	namespace: string;
	profile: {
		displayName?: string;
		bio?: string;
		website?: string;
	};
	identity: Identity;
}

/**
 * Core skills registry service.
 */
export interface Core {
	publishSkill(
		input: PublishSkillInput,
	): Promise<Result<PublishSkillResult, DomainError>>;

	getSkillContent(
		input: GetSkillContentInput,
	): Promise<Result<GetSkillContentResult, DomainError>>;

	getSkillMetadata(
		input: GetSkillMetadataInput,
	): Promise<Result<SkillMetadata, DomainError>>;

	getSkillLatest(
		input: GetSkillLatestInput,
	): Promise<Result<GetSkillLatestResult, DomainError>>;

	listVersions(
		input: GetSkillMetadataInput,
	): Promise<Result<string[], DomainError>>;

	listSkillsInNamespace(
		namespace: string,
	): Promise<Result<string[], DomainError>>;

	listSkills(): Promise<
		Result<Array<{ namespace: string; name: string }>, DomainError>
	>;

	getProfile(namespace: string): Promise<Result<UserProfile, DomainError>>;

	updateProfile(
		input: UpdateProfileInput,
	): Promise<Result<UserProfile, DomainError>>;
}

/**
 * Create a Core instance with the given configuration.
 */
export function makeCore(config: CoreConfig): Core {
	const { storage, maxSkillBytes = 262144, getNow = () => new Date() } = config;

	/**
	 * Compute SHA-256 checksum of content
	 */
	async function computeChecksum(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		return `sha256:${hashHex}`;
	}

	/**
	 * Parse and validate metadata from storage
	 */
	async function loadMetadata(
		namespace: string,
		name: string,
	): Promise<Result<SkillMetadata | null, DomainError>> {
		const key = Keys.metadata(namespace, name);
		const raw = await storage.get(key);

		if (raw === null) {
			return Result.ok(null);
		}

		const parseResult = Result.try(() => JSON.parse(raw) as unknown);
		if (parseResult.isErr()) {
			return Result.err(Errors.corruptStorageData(key, "invalid JSON"));
		}

		const validated = skillMetadataSchema.safeParse(parseResult.value);
		if (!validated.success) {
			return Result.err(
				Errors.corruptStorageData(key, validated.error.message),
			);
		}

		return Result.ok(validated.data);
	}

	/**
	 * Save metadata to storage
	 */
	async function saveMetadata(metadata: SkillMetadata): Promise<void> {
		const key = Keys.metadata(metadata.namespace, metadata.name);
		await storage.put(key, JSON.stringify(metadata));
	}

	/**
	 * Get or create the namespace ID for analytics.
	 * If a user profile exists, use its ID. Otherwise, create one.
	 */
	async function getOrCreateNamespaceId(namespace: string): Promise<string> {
		const key = Keys.userProfile(namespace);
		const raw = await storage.get(key);

		if (raw !== null) {
			const parseResult = Result.try(() => JSON.parse(raw) as unknown);
			if (parseResult.isOk()) {
				const validated = userProfileSchema.safeParse(parseResult.value);
				if (validated.success) {
					return validated.data.id;
				}
			}
		}

		// No profile exists, create one with a new ID
		const now = new Date().toISOString();
		const id = nanoid();
		const profile: UserProfile = {
			id,
			namespace,
			created: now,
			updated: now,
		};
		await storage.put(key, JSON.stringify(profile));
		return id;
	}

	/**
	 * Find the highest stable semver version, excluding pre-releases.
	 * If no stable versions exist, return the highest pre-release.
	 */
	function resolveLatestVersion(versions: string[]): string | null {
		if (versions.length === 0) return null;

		const stableVersions = versions.filter((v) => !v.includes("-"));
		const targetVersions =
			stableVersions.length > 0 ? stableVersions : versions;

		// Sort by semver (descending)
		const sorted = [...targetVersions].sort((a, b) => {
			const aParts = a.split("-")[0]?.split(".").map(Number) ?? [];
			const bParts = b.split("-")[0]?.split(".").map(Number) ?? [];

			const aMajor = aParts[0] ?? 0;
			const aMinor = aParts[1] ?? 0;
			const aPatch = aParts[2] ?? 0;
			const bMajor = bParts[0] ?? 0;
			const bMinor = bParts[1] ?? 0;
			const bPatch = bParts[2] ?? 0;

			if (aMajor !== bMajor) return bMajor - aMajor;
			if (aMinor !== bMinor) return bMinor - aMinor;
			return bPatch - aPatch;
		});

		return sorted[0] ?? null;
	}

	return {
		async publishSkill(input) {
			const { namespace, name, version, content, identity } = input;

			// Check authorization
			if (identity.namespace !== namespace) {
				return Result.err(
					Errors.forbidden(`Cannot publish to namespace @${namespace}`),
				);
			}

			// Check content size
			const contentBytes = new TextEncoder().encode(content).length;
			if (contentBytes > maxSkillBytes) {
				return Result.err(
					Errors.invalidInput(
						"content",
						`Exceeds max size of ${maxSkillBytes} bytes`,
					),
				);
			}

			// Parse and validate frontmatter
			const frontmatterResult = parseFrontmatter(content);
			if (frontmatterResult.isErr()) {
				const error = frontmatterResult.error;
				return Result.err(
					Errors.invalidInput(
						"content",
						error.details
							? `${error.message}: ${error.details}`
							: error.message,
					),
				);
			}

			const { frontmatter } = frontmatterResult.value;

			// Verify frontmatter name matches URL path parameter
			if (frontmatter.name !== name) {
				return Result.err(
					Errors.invalidInput(
						"content",
						`Frontmatter name "${frontmatter.name}" does not match URL path "${name}"`,
					),
				);
			}

			// Try to store content atomically (immutability check)
			const versionKey = Keys.version(namespace, name, version);
			const stored = await storage.putIfNotExists(versionKey, content);

			if (!stored) {
				return Result.err(
					Errors.versionAlreadyExists(namespace, name, version),
				);
			}

			// Load or create metadata
			const metadataResult = await loadMetadata(namespace, name);
			if (metadataResult.isErr()) {
				return Result.err(metadataResult.error);
			}

			const now = getNow().toISOString();
			const checksum = await computeChecksum(content);

			let metadata: SkillMetadata;
			if (metadataResult.value === null) {
				// Create new metadata with generated nanoid
				// Get or create namespace ID for analytics
				const namespaceId = await getOrCreateNamespaceId(namespace);
				metadata = {
					id: nanoid(),
					namespaceId,
					namespace,
					name,
					created: now,
					updated: now,
					versions: {
						[version]: {
							published: now,
							size: contentBytes,
							checksum,
						},
					},
					latest: version,
				};
			} else {
				// Update existing metadata
				metadata = {
					...metadataResult.value,
					updated: now,
					versions: {
						...metadataResult.value.versions,
						[version]: {
							published: now,
							size: contentBytes,
							checksum,
						},
					},
					latest: resolveLatestVersion([
						...Object.keys(metadataResult.value.versions),
						version,
					]),
				};
			}

			await saveMetadata(metadata);

			return Result.ok({
				namespace,
				name,
				version,
				size: contentBytes,
				checksum,
				frontmatter,
			});
		},

		async getSkillContent(input) {
			const { namespace, name, version } = input;

			// Load metadata to get IDs for analytics
			const metadataResult = await loadMetadata(namespace, name);
			if (metadataResult.isErr()) {
				return Result.err(metadataResult.error);
			}
			if (metadataResult.value === null) {
				return Result.err(Errors.notFound(`@${namespace}/${name}@${version}`));
			}

			const key = Keys.version(namespace, name, version);
			const content = await storage.get(key);

			if (content === null) {
				return Result.err(Errors.notFound(`@${namespace}/${name}@${version}`));
			}

			return Result.ok({
				content,
				skillId: metadataResult.value.id,
				namespaceId: metadataResult.value.namespaceId,
			});
		},

		async getSkillMetadata(input) {
			const { namespace, name } = input;
			const result = await loadMetadata(namespace, name);

			if (result.isErr()) {
				return result;
			}

			if (result.value === null) {
				return Result.err(Errors.notFound(`@${namespace}/${name}`));
			}

			return Result.ok(result.value);
		},

		async getSkillLatest(input) {
			const { namespace, name } = input;
			const metadataResult = await loadMetadata(namespace, name);

			if (metadataResult.isErr()) {
				return Result.err(metadataResult.error);
			}

			if (metadataResult.value === null) {
				return Result.err(Errors.notFound(`@${namespace}/${name}`));
			}

			const latest = metadataResult.value.latest;
			if (latest === null) {
				return Result.err(
					Errors.notFound(`@${namespace}/${name} has no versions`),
				);
			}

			const key = Keys.version(namespace, name, latest);
			const content = await storage.get(key);

			if (content === null) {
				return Result.err(
					Errors.corruptStorageData(
						Keys.metadata(namespace, name),
						`Latest version ${latest} not found in storage`,
					),
				);
			}

			return Result.ok({
				version: latest,
				content,
				skillId: metadataResult.value.id,
				namespaceId: metadataResult.value.namespaceId,
			});
		},

		async listVersions(input) {
			const { namespace, name } = input;
			const metadataResult = await loadMetadata(namespace, name);

			if (metadataResult.isErr()) {
				return Result.err(metadataResult.error);
			}

			if (metadataResult.value === null) {
				return Result.ok([]);
			}

			return Result.ok(Object.keys(metadataResult.value.versions));
		},

		async listSkillsInNamespace(namespace) {
			const prefix = Keys.skillPrefix(namespace);
			const keys = await storage.list(prefix);

			// Extract unique skill names from metadata.json keys
			const skillNames = new Set<string>();
			for (const key of keys) {
				// Pattern: skills/{namespace}/{name}/metadata.json
				const match = key.match(/^skills\/[^/]+\/([^/]+)\/metadata\.json$/);
				if (match?.[1]) {
					skillNames.add(match[1]);
				}
			}

			return Result.ok([...skillNames]);
		},

		async listSkills() {
			const prefix = Keys.allSkillsPrefix();
			const keys = await storage.list(prefix);

			// Extract unique namespace/name pairs from metadata.json keys
			const skills = new Map<string, { namespace: string; name: string }>();
			for (const key of keys) {
				// Pattern: skills/{namespace}/{name}/metadata.json
				const match = key.match(/^skills\/([^/]+)\/([^/]+)\/metadata\.json$/);
				if (match?.[1] && match[2]) {
					const id = `${match[1]}/${match[2]}`;
					skills.set(id, { namespace: match[1], name: match[2] });
				}
			}

			return Result.ok([...skills.values()]);
		},

		async getProfile(namespace) {
			const key = Keys.userProfile(namespace);
			const raw = await storage.get(key);

			if (raw === null) {
				return Result.err(Errors.notFound(`Profile @${namespace}`));
			}

			const parseResult = Result.try(() => JSON.parse(raw) as unknown);
			if (parseResult.isErr()) {
				return Result.err(Errors.corruptStorageData(key, "invalid JSON"));
			}

			const validated = userProfileSchema.safeParse(parseResult.value);
			if (!validated.success) {
				return Result.err(
					Errors.corruptStorageData(key, validated.error.message),
				);
			}

			return Result.ok(validated.data);
		},

		async updateProfile(input) {
			const { namespace, profile, identity } = input;

			// Check authorization
			if (identity.namespace !== namespace) {
				return Result.err(
					Errors.forbidden(`Cannot update profile for @${namespace}`),
				);
			}

			const key = Keys.userProfile(namespace);
			const now = getNow().toISOString();

			// Load existing profile or create new
			const existingRaw = await storage.get(key);
			let existing: UserProfile | null = null;

			if (existingRaw !== null) {
				const parseResult = Result.try(
					() => JSON.parse(existingRaw) as unknown,
				);
				if (parseResult.isOk()) {
					const validated = userProfileSchema.safeParse(parseResult.value);
					if (validated.success) {
						existing = validated.data;
					}
				}
			}

			const updated: UserProfile = {
				id: existing?.id ?? nanoid(),
				namespace,
				displayName: profile.displayName ?? existing?.displayName,
				bio: profile.bio ?? existing?.bio,
				website: profile.website ?? existing?.website,
				created: existing?.created ?? now,
				updated: now,
			};

			await storage.put(key, JSON.stringify(updated));

			return Result.ok(updated);
		},
	};
}
