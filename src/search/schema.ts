/**
 * Orama search index schema for skills.
 *
 * Fields indexed:
 * - namespace: The skill's namespace (e.g., "ankcorn")
 * - name: The skill name (e.g., "docker-compose")
 * - description: From frontmatter
 * - skillId: Internal ID for lookups (not searched, used for result mapping)
 */

import { create, type Orama } from "@orama/orama";

/**
 * Schema for the search index.
 */
export const searchSchema = {
	namespace: "string" as const,
	name: "string" as const,
	description: "string" as const,
};

/**
 * Document type for search index entries.
 */
export interface SearchDocument {
	namespace: string;
	name: string;
	description: string;
}

/**
 * Type for the Orama search index.
 */
export type SearchIndex = Orama<typeof searchSchema>;

/**
 * Create a new empty search index.
 */
export function createSearchIndex(): SearchIndex {
	return create({
		schema: searchSchema,
	});
}
