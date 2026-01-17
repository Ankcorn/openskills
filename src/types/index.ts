import { z } from "zod";

// =============================================================================
// Namespace & Skill Name Validation
// =============================================================================

/**
 * Namespace: 1-40 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen
 * Pattern: ^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$
 * Single char namespaces must match ^[a-z0-9]$
 */
export const namespaceSchema = z
	.string()
	.min(1)
	.max(40)
	.regex(
		/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/,
		"Namespace must be 1-40 lowercase alphanumeric characters or hyphens, no leading/trailing hyphen",
	);

/**
 * Skill name: 1-64 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen
 * Pattern: ^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$
 * Single char names must match ^[a-z0-9]$
 */
export const skillNameSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/,
		"Skill name must be 1-64 lowercase alphanumeric characters or hyphens, no leading/trailing hyphen",
	);

// =============================================================================
// Semver Version
// =============================================================================

/**
 * Semver version with optional pre-release
 * Examples: 1.0.0, 2.1.3, 1.0.0-alpha.1, 2.0.0-beta.2
 */
export const semverSchema = z
	.string()
	.regex(
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/,
		"Version must be valid semver (e.g., 1.0.0, 2.1.3-beta.1)",
	);

// =============================================================================
// Version Info (stored per version)
// =============================================================================

export const versionInfoSchema = z.object({
	published: z.string().datetime(),
	size: z.number().int().nonnegative(),
	checksum: z.string(), // sha256:abc123...
});

export type VersionInfo = z.infer<typeof versionInfoSchema>;

// =============================================================================
// Nanoid for analytics indexing
// =============================================================================

/**
 * Nanoid format (21 chars, URL-safe alphabet: A-Za-z0-9_-)
 * Used for namespace and skill IDs in analytics to stay under 96 byte index limit.
 */
export const nanoidSchema = z
	.string()
	.length(21)
	.regex(/^[A-Za-z0-9_-]{21}$/, "Must be a valid nanoid (21 chars)");

// =============================================================================
// Skill Metadata (stored at skills/{namespace}/{name}/metadata.json)
// =============================================================================

export const skillMetadataSchema = z.object({
	/** Unique identifier for the skill (nanoid), used for analytics indexing */
	id: nanoidSchema,
	/** Unique identifier for the namespace (nanoid), copied from user profile on first publish */
	namespaceId: nanoidSchema,
	namespace: namespaceSchema,
	name: skillNameSchema,
	created: z.string().datetime(),
	updated: z.string().datetime(),
	versions: z.record(semverSchema, versionInfoSchema),
	latest: semverSchema.nullable(),
});

export type SkillMetadata = z.infer<typeof skillMetadataSchema>;

// =============================================================================
// User Profile (stored at skills/{namespace}/user.json)
// =============================================================================

export const userProfileSchema = z.object({
	/** Unique identifier for the namespace (nanoid), used for analytics indexing */
	id: nanoidSchema,
	namespace: namespaceSchema,
	displayName: z.string().max(100).optional(),
	bio: z.string().max(500).optional(),
	website: z.string().url().optional(),
	created: z.string().datetime(),
	updated: z.string().datetime(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

// =============================================================================
// Identity (from Cloudflare Access JWT)
// =============================================================================

export const identitySchema = z.object({
	namespace: namespaceSchema,
	email: z.string().email().optional(),
});

export type Identity = z.infer<typeof identitySchema>;

// =============================================================================
// Skill Content Frontmatter (OpenCode-compatible)
// =============================================================================

/**
 * Skill name for frontmatter: 1-64 chars, lowercase alphanumeric with single hyphen separators.
 * Pattern: ^[a-z0-9]+(-[a-z0-9]+)*$
 * No leading/trailing hyphen, no consecutive hyphens.
 */
export const frontmatterNameSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(
		/^[a-z0-9]+(-[a-z0-9]+)*$/,
		"Name must be 1-64 lowercase alphanumeric characters with single hyphen separators",
	);

/**
 * Frontmatter description: 1-1024 characters
 */
export const frontmatterDescriptionSchema = z
	.string()
	.min(1, "Description is required")
	.max(1024, "Description must be 1024 characters or less");

/**
 * Skill frontmatter schema (OpenCode-compatible YAML header)
 */
export const skillFrontmatterSchema = z.object({
	/** Skill name (must match URL path) */
	name: frontmatterNameSchema,
	/** Description for discovery (1-1024 chars) */
	description: frontmatterDescriptionSchema,
	/** License identifier (optional) */
	license: z.string().max(100).optional(),
	/** Tool compatibility hint (optional) */
	compatibility: z.string().max(100).optional(),
	/** Arbitrary key-value metadata (optional) */
	metadata: z.record(z.string(), z.string()).optional(),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

// =============================================================================
// Export all schemas as a namespace for convenience
// =============================================================================

export const schemas = {
	namespace: namespaceSchema,
	skillName: skillNameSchema,
	semver: semverSchema,
	nanoid: nanoidSchema,
	versionInfo: versionInfoSchema,
	skillMetadata: skillMetadataSchema,
	userProfile: userProfileSchema,
	identity: identitySchema,
	frontmatterName: frontmatterNameSchema,
	frontmatterDescription: frontmatterDescriptionSchema,
	skillFrontmatter: skillFrontmatterSchema,
} as const;
