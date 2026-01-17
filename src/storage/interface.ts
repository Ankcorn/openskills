/**
 * Storage backend interface for the skills registry.
 *
 * All keys are stored under `skills/` prefix:
 * - skills/{namespace}/user.json
 * - skills/{namespace}/{skill-name}/metadata.json
 * - skills/{namespace}/{skill-name}/versions/{version}.md
 */
export interface StorageBackend {
	/**
	 * Get a value by key.
	 * @returns The value as a string, or null if not found.
	 */
	get(key: string): Promise<string | null>;

	/**
	 * Store a value at a key.
	 * Overwrites any existing value.
	 */
	put(key: string, value: string): Promise<void>;

	/**
	 * Delete a key.
	 * @returns true if the key existed and was deleted, false if not found.
	 */
	delete(key: string): Promise<boolean>;

	/**
	 * List all keys matching a prefix.
	 * @returns Array of matching keys (not values).
	 */
	list(prefix: string): Promise<string[]>;

	/**
	 * Atomically store a value only if the key doesn't exist.
	 * Used for immutable version publishing.
	 * @returns true if stored (key was absent), false if key already exists.
	 */
	putIfNotExists(key: string, value: string): Promise<boolean>;
}
