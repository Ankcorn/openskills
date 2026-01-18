/**
 * Search module for full-text skill search using Orama.
 *
 * The search index is stored in KV at key `search:index` and cached in memory
 * to reduce KV lookups (~4-5x reduction due to Worker isolate reuse).
 */

export { rebuildSearchIndex } from "./index-builder.js";
export type { Search, SearchResult } from "./search.js";
export { clearSearchCache, makeNoOpSearch, makeSearch } from "./search.js";
