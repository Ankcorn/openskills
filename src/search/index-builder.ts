/**
 * Search index builder.
 *
 * Rebuilds the search index by fetching all skills, parsing frontmatter,
 * and persisting to KV.
 */

import { insert, save } from "@orama/orama";
import { Logger } from "hatchlet";
import type { Core } from "../core/core.js";
import { parseFrontmatter } from "../core/frontmatter.js";
import type { StorageBackend } from "../storage/interface.js";
import { createSearchIndex } from "./schema.js";

const log = new Logger({ dev: process.env.NODE_ENV !== "production" });

/** Storage key for the search index */
export const SEARCH_INDEX_KEY = "search:index";

/**
 * Rebuild the search index from all skills.
 *
 * This fetches all skills, parses their frontmatter for descriptions,
 * and persists the index to KV.
 *
 * Call this via `ctx.waitUntil(rebuildSearchIndex(...))` after publish
 * to rebuild in the background.
 */
export async function rebuildSearchIndex(
	storage: StorageBackend,
	core: Core,
): Promise<void> {
	log.info`[SEARCH] Rebuilding search index`;

	const skillsResult = await core.listSkills();
	if (skillsResult.isErr()) {
		log.error`[SEARCH] Failed to list skills: ${skillsResult.error.message}`;
		return;
	}

	const skills = skillsResult.value;
	const index = createSearchIndex();

	let indexed = 0;
	for (const skill of skills) {
		const latestResult = await core.getSkillLatest({
			namespace: skill.namespace,
			name: skill.name,
		});

		if (latestResult.isErr()) {
			log.warn`[SEARCH] Failed to get latest for @${skill.namespace}/${skill.name}: ${latestResult.error.message}`;
			continue;
		}

		const { content, skillId } = latestResult.value;
		const parsed = parseFrontmatter(content);

		if (parsed.isErr()) {
			log.warn`[SEARCH] Failed to parse frontmatter for @${skill.namespace}/${skill.name}: ${parsed.error.message}`;
			continue;
		}

		const { frontmatter } = parsed.value;

		insert(index, {
			namespace: skill.namespace,
			name: skill.name,
			description: frontmatter.description,
			skillId,
		});

		indexed++;
	}

	// Persist to KV using Orama's built-in save (returns JSON-serializable object)
	const exported = await save(index);
	const serialized = JSON.stringify(exported);
	const sizeBytes = new TextEncoder().encode(serialized).length;
	const sizeKiB = (sizeBytes / 1024).toFixed(1);

	await storage.put(SEARCH_INDEX_KEY, serialized);

	// Log size to monitor growth - KV has a 25 MiB limit per value
	log.info`[SEARCH] Index rebuilt with ${{ count: indexed, sizeKiB: `${sizeKiB} KiB` }} skills`;
}
