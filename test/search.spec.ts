import { beforeEach, describe, expect, it } from "vitest";
import {
	clearSearchCache,
	makeSearch,
	rebuildSearchIndex,
} from "../src/search/index.js";
import {
	makeIdentity,
	makeSkillContent,
	makeTestCore,
	seedSkill,
} from "./helpers.js";

describe("Search", () => {
	// Clear cached index between tests to ensure isolation
	beforeEach(() => {
		clearSearchCache();
	});
	describe("rebuildSearchIndex", () => {
		it("builds index from existing skills", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "kubernetes",
				version: "1.0.0",
			});

			// Act
			await rebuildSearchIndex(storage, core);

			// Assert
			const indexJson = await storage.get("search:index");
			expect(indexJson).not.toBeNull();
		});

		it("handles empty skill list gracefully", async () => {
			// Arrange
			const { core, storage } = makeTestCore();

			// Act
			await rebuildSearchIndex(storage, core);

			// Assert
			const indexJson = await storage.get("search:index");
			expect(indexJson).not.toBeNull();
		});
	});

	describe("search", () => {
		it("returns relevant results for name match", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "kubernetes",
				version: "1.0.0",
			});
			await rebuildSearchIndex(storage, core);
			const search = makeSearch(storage);

			// Act
			const results = await search.search("docker");

			// Assert
			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.name).toBe("docker-compose");
		});

		it("returns relevant results for description match", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			const content = makeSkillContent("my-skill", "# My Skill", {
				description: "Best practices for container orchestration",
			});
			await core.publishSkill({
				namespace: "acme",
				name: "my-skill",
				version: "1.0.0",
				content,
				identity: makeIdentity({ namespace: "acme" }),
			});
			await rebuildSearchIndex(storage, core);
			const search = makeSearch(storage);

			// Act
			const results = await search.search("orchestration");

			// Assert
			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.name).toBe("my-skill");
		});

		it("returns empty array when no index exists", async () => {
			// Arrange
			const { storage } = makeTestCore();
			const search = makeSearch(storage);

			// Act
			const results = await search.search("anything");

			// Assert
			expect(results).toEqual([]);
		});

		it("returns empty array for no matches", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
			});
			await rebuildSearchIndex(storage, core);
			const search = makeSearch(storage);

			// Act
			const results = await search.search("nonexistent-term-xyz");

			// Assert
			expect(results).toEqual([]);
		});

		it("includes score in results", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
			});
			await rebuildSearchIndex(storage, core);
			const search = makeSearch(storage);

			// Act
			const results = await search.search("docker");

			// Assert
			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.score).toBeGreaterThan(0);
		});

		it("respects limit parameter", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			// Create multiple skills with similar names
			for (let i = 1; i <= 5; i++) {
				await seedSkill(core, {
					namespace: "acme",
					name: `test-skill-${i}`,
					version: "1.0.0",
				});
			}
			await rebuildSearchIndex(storage, core);
			const search = makeSearch(storage);

			// Act
			const results = await search.search("test", 2);

			// Assert
			expect(results.length).toBeLessThanOrEqual(2);
		});
	});
});
