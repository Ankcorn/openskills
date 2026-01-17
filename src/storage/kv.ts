import type { StorageBackend } from "./interface.js";

/**
 * Cloudflare KV storage backend for production deployments.
 */
export class KVStorage implements StorageBackend {
	private kv: KVNamespace;

	constructor(kv: KVNamespace) {
		this.kv = kv;
	}

	async get(key: string): Promise<string | null> {
		return await this.kv.get(key, "text");
	}

	async put(key: string, value: string): Promise<void> {
		await this.kv.put(key, value);
	}

	async delete(key: string): Promise<boolean> {
		// KV doesn't return whether the key existed
		// We need to check first
		const existing = await this.kv.get(key);
		if (existing === null) {
			return false;
		}
		await this.kv.delete(key);
		return true;
	}

	async list(prefix: string): Promise<string[]> {
		const keys: string[] = [];
		let cursor: string | undefined;

		do {
			const result = await this.kv.list({ prefix, cursor });
			for (const key of result.keys) {
				keys.push(key.name);
			}
			cursor = result.list_complete ? undefined : result.cursor;
		} while (cursor);

		return keys;
	}

	async putIfNotExists(key: string, value: string): Promise<boolean> {
		// KV doesn't have native atomic putIfNotExists
		// We check and put, accepting the small race window
		// For true atomicity, consider using Durable Objects
		const existing = await this.kv.get(key);
		if (existing !== null) {
			return false;
		}
		await this.kv.put(key, value);
		return true;
	}
}
