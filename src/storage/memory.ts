import type { StorageBackend } from "./interface.js";

/**
 * In-memory storage backend for testing.
 * Data is lost when the process exits.
 */
export class MemoryStorage implements StorageBackend {
	private data = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.data.get(key) ?? null;
	}

	async put(key: string, value: string): Promise<void> {
		this.data.set(key, value);
	}

	async delete(key: string): Promise<boolean> {
		return this.data.delete(key);
	}

	async list(prefix: string): Promise<string[]> {
		const keys: string[] = [];
		for (const key of this.data.keys()) {
			if (key.startsWith(prefix)) {
				keys.push(key);
			}
		}
		return keys;
	}

	async putIfNotExists(key: string, value: string): Promise<boolean> {
		if (this.data.has(key)) {
			return false;
		}
		this.data.set(key, value);
		return true;
	}

	/**
	 * Clear all data. Useful for test cleanup.
	 */
	clear(): void {
		this.data.clear();
	}
}
