import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/core/index.js";
import {
	makeIdentity,
	makeSkillContent,
	makeTestCore,
	seedSkill,
} from "./helpers.js";

describe("Core", () => {
	describe("publishSkill + getSkillContent", () => {
		it("publishes a skill and retrieves its content", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const content = makeSkillContent(
				"docker-compose",
				"# Docker Compose\n\nA skill for docker-compose.",
			);

			// Act
			const publishResult = await core.publishSkill({
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
				content,
				identity,
			});

			const getResult = await core.getSkillContent({
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
			});

			// Assert
			expect(publishResult.isOk()).toBe(true);
			if (publishResult.isOk()) {
				expect(publishResult.value.namespace).toBe("acme");
				expect(publishResult.value.name).toBe("docker-compose");
				expect(publishResult.value.version).toBe("1.0.0");
				expect(publishResult.value.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
				expect(publishResult.value.frontmatter.name).toBe("docker-compose");
				expect(publishResult.value.frontmatter.description).toBeDefined();
			}

			expect(getResult.isOk()).toBe(true);
			if (getResult.isOk()) {
				expect(getResult.value.content).toBe(content);
				expect(getResult.value.skillId).toMatch(/^[A-Za-z0-9_-]{21}$/);
				expect(getResult.value.namespaceId).toMatch(/^[A-Za-z0-9_-]{21}$/);
			}
		});

		it("returns NOT_FOUND for missing skill", async () => {
			// Arrange
			const { core } = makeTestCore();

			// Act
			const result = await core.getSkillContent({
				namespace: "acme",
				name: "nonexistent",
				version: "1.0.0",
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.NOT_FOUND);
			}
		});

		it("returns NOT_FOUND for missing version", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
				content: "# v1",
			});

			// Act
			const result = await core.getSkillContent({
				namespace: "acme",
				name: "docker-compose",
				version: "2.0.0",
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.NOT_FOUND);
			}
		});
	});

	describe("publishSkill immutability", () => {
		it("rejects publishing the same version twice", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const content = makeSkillContent("docker-compose", "# v1");

			await core.publishSkill({
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
				content,
				identity,
			});

			// Act
			const second = await core.publishSkill({
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
				content: makeSkillContent("docker-compose", "# v1 overwritten"),
				identity,
			});

			// Assert
			expect(second.isErr()).toBe(true);
			if (second.isErr()) {
				expect(second.error.code).toBe(ErrorCode.VERSION_ALREADY_EXISTS);
			}
		});
	});

	describe("getSkillMetadata", () => {
		it("returns metadata after publish", async () => {
			// Arrange
			const fixedDate = new Date("2025-01-15T00:00:00Z");
			const { core } = makeTestCore({ getNow: () => fixedDate });
			await seedSkill(core, {
				namespace: "acme",
				name: "docker-compose",
				version: "1.0.0",
				content: "# v1",
			});

			// Act
			const result = await core.getSkillMetadata({
				namespace: "acme",
				name: "docker-compose",
			});

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value.namespace).toBe("acme");
				expect(result.value.name).toBe("docker-compose");
				expect(result.value.created).toBe("2025-01-15T00:00:00.000Z");
				expect(result.value.versions["1.0.0"]).toBeDefined();
				expect(result.value.latest).toBe("1.0.0");
			}
		});

		it("returns NOT_FOUND for missing skill", async () => {
			// Arrange
			const { core } = makeTestCore();

			// Act
			const result = await core.getSkillMetadata({
				namespace: "acme",
				name: "nonexistent",
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.NOT_FOUND);
			}
		});

		it("returns CORRUPT_STORAGE_DATA for invalid metadata JSON", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			await storage.put("skills/acme/test/metadata.json", "not valid json");

			// Act
			const result = await core.getSkillMetadata({
				namespace: "acme",
				name: "test",
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.CORRUPT_STORAGE_DATA);
			}
		});
	});

	describe("getSkillLatest", () => {
		it("returns the highest stable version when multiple versions exist", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.0.0",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.1.0",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.0.1",
			});

			// Act
			const result = await core.getSkillLatest({
				namespace: "acme",
				name: "x",
			});

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value.version).toBe("1.1.0");
				// Content includes frontmatter, so check it contains the body
				expect(result.value.content).toContain("# x");
			}
		});

		it("excludes pre-release versions", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.0.0",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "2.0.0-beta.1",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.1.0",
			});

			// Act
			const result = await core.getSkillLatest({
				namespace: "acme",
				name: "x",
			});

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value.version).toBe("1.1.0");
				// Content includes frontmatter, so check it contains the body
				expect(result.value.content).toContain("# x");
			}
		});

		it("returns pre-release if no stable versions exist", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.0.0-alpha.1",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.0.0-beta.1",
			});

			// Act
			const result = await core.getSkillLatest({
				namespace: "acme",
				name: "x",
			});

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				// Both are 1.0.0 pre-releases, alpha vs beta - alpha comes first alphabetically
				// but we sort by semver base version, so they're equal. Either is acceptable.
				expect(["1.0.0-alpha.1", "1.0.0-beta.1"]).toContain(
					result.value.version,
				);
			}
		});

		it("returns NOT_FOUND for missing skill", async () => {
			// Arrange
			const { core } = makeTestCore();

			// Act
			const result = await core.getSkillLatest({
				namespace: "acme",
				name: "nonexistent",
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.NOT_FOUND);
			}
		});
	});

	describe("listVersions", () => {
		it("returns all versions for a skill", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.0.0",
				content: "v1",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "1.1.0",
				content: "v1.1",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "x",
				version: "2.0.0",
				content: "v2",
			});

			// Act
			const result = await core.listVersions({ namespace: "acme", name: "x" });

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value).toHaveLength(3);
				expect(result.value).toContain("1.0.0");
				expect(result.value).toContain("1.1.0");
				expect(result.value).toContain("2.0.0");
			}
		});

		it("returns empty array for missing skill", async () => {
			// Arrange
			const { core } = makeTestCore();

			// Act
			const result = await core.listVersions({
				namespace: "acme",
				name: "nonexistent",
			});

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value).toEqual([]);
			}
		});
	});

	describe("listSkillsInNamespace", () => {
		it("returns skills in namespace", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "skill-a",
				version: "1.0.0",
				content: "a",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "skill-b",
				version: "1.0.0",
				content: "b",
			});
			await seedSkill(core, {
				namespace: "other",
				name: "skill-c",
				version: "1.0.0",
				content: "c",
			});

			// Act
			const result = await core.listSkillsInNamespace("acme");

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value).toHaveLength(2);
				expect(result.value).toContain("skill-a");
				expect(result.value).toContain("skill-b");
			}
		});

		it("returns empty array for empty namespace", async () => {
			// Arrange
			const { core } = makeTestCore();

			// Act
			const result = await core.listSkillsInNamespace("empty");

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value).toEqual([]);
			}
		});
	});

	describe("listSkills", () => {
		it("returns all skills across namespaces", async () => {
			// Arrange
			const { core } = makeTestCore();
			await seedSkill(core, {
				namespace: "acme",
				name: "skill-a",
				version: "1.0.0",
				content: "a",
			});
			await seedSkill(core, {
				namespace: "acme",
				name: "skill-b",
				version: "1.0.0",
				content: "b",
			});
			await seedSkill(core, {
				namespace: "other",
				name: "skill-c",
				version: "1.0.0",
				content: "c",
			});

			// Act
			const result = await core.listSkills();

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value).toHaveLength(3);
				expect(result.value).toContainEqual({
					namespace: "acme",
					name: "skill-a",
				});
				expect(result.value).toContainEqual({
					namespace: "acme",
					name: "skill-b",
				});
				expect(result.value).toContainEqual({
					namespace: "other",
					name: "skill-c",
				});
			}
		});
	});

	describe("getProfile", () => {
		it("returns NOT_FOUND for missing profile", async () => {
			// Arrange
			const { core } = makeTestCore();

			// Act
			const result = await core.getProfile("acme");

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.NOT_FOUND);
			}
		});

		it("returns CORRUPT_STORAGE_DATA for invalid profile JSON", async () => {
			// Arrange
			const { core, storage } = makeTestCore();
			await storage.put("skills/acme/user.json", "not valid json");

			// Act
			const result = await core.getProfile("acme");

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.CORRUPT_STORAGE_DATA);
			}
		});
	});

	describe("updateProfile", () => {
		it("creates and updates own profile", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "alice" });

			// Act - create
			const createResult = await core.updateProfile({
				namespace: "alice",
				profile: { displayName: "Alice" },
				identity,
			});

			// Assert - create
			expect(createResult.isOk()).toBe(true);
			if (createResult.isOk()) {
				expect(createResult.value.displayName).toBe("Alice");
			}

			// Act - update
			const updateResult = await core.updateProfile({
				namespace: "alice",
				profile: { bio: "Developer" },
				identity,
			});

			// Assert - update preserves displayName
			expect(updateResult.isOk()).toBe(true);
			if (updateResult.isOk()) {
				expect(updateResult.value.displayName).toBe("Alice");
				expect(updateResult.value.bio).toBe("Developer");
			}

			// Verify via getProfile
			const getResult = await core.getProfile("alice");
			expect(getResult.isOk()).toBe(true);
			if (getResult.isOk()) {
				expect(getResult.value.displayName).toBe("Alice");
				expect(getResult.value.bio).toBe("Developer");
			}
		});

		it("returns FORBIDDEN when updating another user's profile", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "alice" });

			// Act
			const result = await core.updateProfile({
				namespace: "bob",
				profile: { displayName: "Bob" },
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.FORBIDDEN);
			}
		});
	});

	describe("publishSkill authorization", () => {
		it("returns FORBIDDEN when publishing to another namespace", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "alice" });
			const content = makeSkillContent("test", "# Test");

			// Act
			const result = await core.publishSkill({
				namespace: "bob",
				name: "test",
				version: "1.0.0",
				content,
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.FORBIDDEN);
			}
		});
	});

	describe("publishSkill frontmatter validation", () => {
		it("publishes with valid frontmatter succeeds", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const content = makeSkillContent("my-skill", "# Body", {
				description: "A test skill",
				license: "MIT",
				compatibility: "opencode",
				metadata: { audience: "engineers" },
			});

			// Act
			const result = await core.publishSkill({
				namespace: "acme",
				name: "my-skill",
				version: "1.0.0",
				content,
				identity,
			});

			// Assert
			expect(result.isOk()).toBe(true);
			if (result.isOk()) {
				expect(result.value.frontmatter.name).toBe("my-skill");
				expect(result.value.frontmatter.description).toBe("A test skill");
				expect(result.value.frontmatter.license).toBe("MIT");
				expect(result.value.frontmatter.compatibility).toBe("opencode");
				expect(result.value.frontmatter.metadata?.audience).toBe("engineers");
			}
		});

		it("returns INVALID_INPUT when content has no frontmatter", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });

			// Act
			const result = await core.publishSkill({
				namespace: "acme",
				name: "test",
				version: "1.0.0",
				content: "# No frontmatter here",
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.INVALID_INPUT);
				expect(result.error.message).toContain("frontmatter");
			}
		});

		it("returns INVALID_INPUT when frontmatter is missing required fields", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const content = `---
name: test
---

# Missing description`;

			// Act
			const result = await core.publishSkill({
				namespace: "acme",
				name: "test",
				version: "1.0.0",
				content,
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.INVALID_INPUT);
			}
		});

		it("returns INVALID_INPUT when frontmatter name does not match URL", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const content = makeSkillContent("different-name", "# Body");

			// Act
			const result = await core.publishSkill({
				namespace: "acme",
				name: "my-skill",
				version: "1.0.0",
				content,
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.INVALID_INPUT);
				expect(result.error.message).toContain("does not match");
			}
		});

		it("returns INVALID_INPUT when frontmatter name has invalid format", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const content = `---
name: Invalid_Name
description: A test
---

# Body`;

			// Act
			const result = await core.publishSkill({
				namespace: "acme",
				name: "invalid-name",
				version: "1.0.0",
				content,
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.INVALID_INPUT);
			}
		});

		it("returns INVALID_INPUT when description exceeds 1024 chars", async () => {
			// Arrange
			const { core } = makeTestCore();
			const identity = makeIdentity({ namespace: "acme" });
			const longDescription = "a".repeat(1025);
			const content = `---
name: test
description: ${longDescription}
---

# Body`;

			// Act
			const result = await core.publishSkill({
				namespace: "acme",
				name: "test",
				version: "1.0.0",
				content,
				identity,
			});

			// Assert
			expect(result.isErr()).toBe(true);
			if (result.isErr()) {
				expect(result.error.code).toBe(ErrorCode.INVALID_INPUT);
			}
		});
	});
});
