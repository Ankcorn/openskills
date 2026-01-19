/**
 * Search functionality with in-memory caching.
 *
 * The search index is loaded from KV and cached in a module-level variable
 * with a 30-second TTL. After TTL expires, the next search will fetch fresh
 * data from KV.
 */

import { load, search } from "@orama/orama";
import { Logger } from "hatchlet";
import type { Core } from "../core/core.js";
import type { StorageBackend } from "../storage/interface.js";
import { rebuildSearchIndex, SEARCH_INDEX_KEY } from "./index-builder.js";
import { createSearchIndex, type SearchIndex } from "./schema.js";

const log = new Logger({ dev: process.env.NODE_ENV !== "production" });

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000;

/**
 * Search result item.
 */
export interface SearchResult {
	namespace: string;
	name: string;
	description: string;
	score: number;
}

/**
 * Search service interface.
 */
export interface Search {
	/**
	 * Search for skills matching the given term.
	 * Returns results sorted by relevance score.
	 */
	search(term: string, limit?: number): Promise<SearchResult[]>;
}

// Module-level cache for the search index
let cachedIndex: SearchIndex | null = null;
let cacheTimestamp: number = 0;

// Track if we've already attempted to rebuild (to avoid repeated rebuilds)
let rebuildAttempted = false;

/**
 * Check if the cache is still valid (within TTL).
 */
function isCacheValid(): boolean {
	return cachedIndex !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Load the search index from KV with in-memory caching.
 * If the index doesn't exist and core is provided, rebuilds it.
 */
async function getSearchIndex(
	storage: StorageBackend,
	core?: Core,
): Promise<SearchIndex | null> {
	if (isCacheValid()) {
		log.debug`[SEARCH] Loading search index from ${{ source: "memory" }}`;
		return cachedIndex;
	}

	let indexJson = await storage.get(SEARCH_INDEX_KEY);

	// If no index exists and we have core, rebuild it
	if (indexJson === null && core && !rebuildAttempted) {
		rebuildAttempted = true;
		log.info`[SEARCH] No index found, building initial index`;
		await rebuildSearchIndex(storage, core);
		indexJson = await storage.get(SEARCH_INDEX_KEY);
	}

	if (indexJson === null) {
		log.warn`[SEARCH] No search index found in KV`;
		return null;
	}

	log.info`[SEARCH] Loading search index from ${{ source: "kv" }}`;

	// Create a fresh index and load the persisted data into it
	const index = createSearchIndex();
	await load(index, JSON.parse(indexJson));
	cachedIndex = index;
	cacheTimestamp = Date.now();
	return cachedIndex;
}

/**
 * Create a search service instance.
 *
 * @param storage - Storage backend for reading the index
 * @param core - Optional core instance for rebuilding the index if it doesn't exist
 */
export function makeSearch(storage: StorageBackend, core?: Core): Search {
	return {
		async search(term: string, limit = 20): Promise<SearchResult[]> {
			const index = await getSearchIndex(storage, core);
			if (index === null) {
				return [];
			}

			const results = await search(index, {
				term,
				limit,
			});

			return results.hits.map((hit) => ({
				namespace: hit.document.namespace,
				name: hit.document.name,
				description: hit.document.description,
				score: hit.score,
			}));
		},
	};
}

/**
 * No-op search implementation for testing.
 */
export function makeNoOpSearch(): Search {
	return {
		async search(): Promise<SearchResult[]> {
			return [];
		},
	};
}

/**
 * Clear the search index cache.
 * Used for testing to ensure fresh index loads between tests.
 */
export function clearSearchCache(): void {
	cachedIndex = null;
	cacheTimestamp = 0;
	rebuildAttempted = false;
}
