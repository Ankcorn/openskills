import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { StorageBackend } from "./interface.js";

/**
 * File system storage backend for local development and self-hosted deployments.
 * Stores each key as a file on disk.
 */
export class FileSystemStorage implements StorageBackend {
	private basePath: string;

	constructor(basePath: string) {
		this.basePath = basePath;
	}

	private keyToPath(key: string): string {
		return path.join(this.basePath, key);
	}

	async get(key: string): Promise<string | null> {
		try {
			const content = await fs.readFile(this.keyToPath(key), "utf-8");
			return content;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				return null;
			}
			throw err;
		}
	}

	async put(key: string, value: string): Promise<void> {
		const filePath = this.keyToPath(key);
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(filePath, value, "utf-8");
	}

	async delete(key: string): Promise<boolean> {
		try {
			await fs.unlink(this.keyToPath(key));
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				return false;
			}
			throw err;
		}
	}

	async list(prefix: string): Promise<string[]> {
		const results: string[] = [];
		const prefixPath = this.keyToPath(prefix);

		// Find the deepest existing directory in the prefix path
		let searchDir = prefixPath;
		let prefixRemainder = "";

		while (searchDir !== this.basePath) {
			try {
				const stat = await fs.stat(searchDir);
				if (stat.isDirectory()) {
					break;
				}
			} catch {
				// Directory doesn't exist, go up one level
				prefixRemainder = `${path.basename(searchDir)}/${prefixRemainder}`;
				searchDir = path.dirname(searchDir);
			}
		}

		try {
			await this.listRecursive(searchDir, prefix, results);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			throw err;
		}

		return results;
	}

	private async listRecursive(
		dir: string,
		prefix: string,
		results: string[],
	): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const key = path.relative(this.basePath, fullPath);

			if (entry.isDirectory()) {
				// Only recurse if this directory could contain matching keys
				if (key.startsWith(prefix) || prefix.startsWith(`${key}/`)) {
					await this.listRecursive(fullPath, prefix, results);
				}
			} else if (entry.isFile()) {
				if (key.startsWith(prefix)) {
					results.push(key);
				}
			}
		}
	}

	async putIfNotExists(key: string, value: string): Promise<boolean> {
		const filePath = this.keyToPath(key);
		const dir = path.dirname(filePath);

		try {
			await fs.mkdir(dir, { recursive: true });
			// Use exclusive flag to atomically check + create
			await fs.writeFile(filePath, value, { flag: "wx" });
			return true;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "EEXIST") {
				return false;
			}
			throw err;
		}
	}
}
