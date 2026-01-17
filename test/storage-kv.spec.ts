import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KVStorage } from "../src/storage/kv.js";

/**
 * KVStorage tests
 *
 * These tests use Miniflare's KV implementation via the Vitest Workers pool.
 * The SKILLS_KV binding is auto-generated when no `id` is specified in wrangler.jsonc.
 */
describe("KVStorage", () => {
	let storage: KVStorage;

	beforeEach(() => {
		// env.SKILLS_KV would be the KV namespace from cloudflare:test
		storage = new KVStorage(env.SKILLS_KV);
	});

	describe("get", () => {
		it("returns null for missing keys", async () => {
			// Arrange - empty storage

			// Act
			const result = await storage.get("nonexistent");

			// Assert
			expect(result).toBeNull();
		});
	});

	describe("put + get", () => {
		it("stores and retrieves a value", async () => {
			// Arrange
			const key = "skills/acme/docker-compose/metadata.json";
			const value = '{"name": "docker-compose"}';

			// Act
			await storage.put(key, value);
			const result = await storage.get(key);

			// Assert
			expect(result).toBe(value);
		});

		it("overwrites existing values", async () => {
			// Arrange
			const key = "skills/acme/user.json";
			await storage.put(key, "original");

			// Act
			await storage.put(key, "updated");
			const result = await storage.get(key);

			// Assert
			expect(result).toBe("updated");
		});
	});

	describe("delete", () => {
		it("removes an existing key and returns true", async () => {
			// Arrange
			const key = "skills/acme/test/metadata.json";
			await storage.put(key, "value");

			// Act
			const deleted = await storage.delete(key);
			const afterDelete = await storage.get(key);

			// Assert
			expect(deleted).toBe(true);
			expect(afterDelete).toBeNull();
		});

		it("returns false for missing keys", async () => {
			// Arrange - empty storage

			// Act
			const deleted = await storage.delete("nonexistent");

			// Assert
			expect(deleted).toBe(false);
		});
	});

	describe("list", () => {
		it("returns keys matching prefix", async () => {
			// Arrange
			await storage.put("skills/acme/skill-a/metadata.json", "a");
			await storage.put("skills/acme/skill-b/metadata.json", "b");
			await storage.put("skills/other/skill-c/metadata.json", "c");

			// Act
			const result = await storage.list("skills/acme/");

			// Assert
			expect(result).toHaveLength(2);
			expect(result).toContain("skills/acme/skill-a/metadata.json");
			expect(result).toContain("skills/acme/skill-b/metadata.json");
		});

		it("returns empty array when no keys match", async () => {
			// Arrange
			await storage.put("skills/acme/test/metadata.json", "value");

			// Act
			const result = await storage.list("skills/nonexistent/");

			// Assert
			expect(result).toEqual([]);
		});

		it("returns empty array on empty storage", async () => {
			// Arrange - empty storage

			// Act
			const result = await storage.list("skills/");

			// Assert
			expect(result).toEqual([]);
		});

		it("handles pagination for large key sets", async () => {
			// Arrange - create many keys
			const promises: Promise<void>[] = [];
			for (let i = 0; i < 1500; i++) {
				promises.push(
					storage.put(
						`skills/acme/skill-${i.toString().padStart(4, "0")}/metadata.json`,
						`value-${i}`,
					),
				);
			}
			await Promise.all(promises);

			// Act
			const result = await storage.list("skills/acme/");

			// Assert
			expect(result).toHaveLength(1500);
		});
	});

	describe("putIfNotExists", () => {
		it("stores value and returns true when key is absent", async () => {
			// Arrange
			const key = "skills/acme/new-skill/versions/1.0.0.md";
			const value = "# New Skill";

			// Act
			const stored = await storage.putIfNotExists(key, value);
			const result = await storage.get(key);

			// Assert
			expect(stored).toBe(true);
			expect(result).toBe(value);
		});

		it("returns false and does not overwrite when key exists", async () => {
			// Arrange
			const key = "skills/acme/existing/versions/1.0.0.md";
			const original = "# Original";
			const attempted = "# Attempted Overwrite";
			await storage.put(key, original);

			// Act
			const stored = await storage.putIfNotExists(key, attempted);
			const result = await storage.get(key);

			// Assert
			expect(stored).toBe(false);
			expect(result).toBe(original);
		});
	});
});
