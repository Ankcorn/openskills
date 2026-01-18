import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestToken, initTestAuth } from "./helpers/auth.js";

describe("OpenSkills API", () => {
	// Initialize auth before all tests
	beforeAll(async () => {
		await initTestAuth();
	});
	describe("GET /api/v1/skills", () => {
		it("returns empty skills list initially", async () => {
			const response = await SELF.fetch("https://example.com/api/v1/skills");
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toEqual({ skills: [] });
		});
	});

	describe("GET /api/v1/openapi", () => {
		it("returns OpenAPI spec", async () => {
			const response = await SELF.fetch("https://example.com/api/v1/openapi");
			expect(response.status).toBe(200);
			const body = (await response.json()) as { info?: { title?: string } };
			expect(body.info?.title).toBe("OpenSkills API");
		});
	});

	describe("publish and retrieve flow", () => {
		it("can publish and retrieve a skill", async () => {
			// Publish a skill with valid frontmatter
			const content = `---
name: my-skill
description: This is a test skill
license: MIT
---

# My Skill

This is a test skill.`;
			const authHeader = await createTestToken("testuser");
			const publishResponse = await SELF.fetch(
				"https://example.com/api/v1/skills/@testuser/my-skill/versions/1.0.0",
				{
					method: "PUT",
					body: content,
					headers: {
						Authorization: authHeader,
						"Content-Type": "text/markdown",
					},
				},
			);
			expect(publishResponse.status).toBe(201);
			const publishBody = (await publishResponse.json()) as {
				namespace: string;
				name: string;
				version: string;
				frontmatter: { name: string; description: string };
			};
			expect(publishBody.namespace).toBe("testuser");
			expect(publishBody.name).toBe("my-skill");
			expect(publishBody.version).toBe("1.0.0");
			expect(publishBody.frontmatter.name).toBe("my-skill");
			expect(publishBody.frontmatter.description).toBe("This is a test skill");

			// Get the skill content
			const getResponse = await SELF.fetch(
				"https://example.com/api/v1/skills/@testuser/my-skill/versions/1.0.0",
			);
			expect(getResponse.status).toBe(200);
			expect(await getResponse.text()).toBe(content);
			expect(getResponse.headers.get("Content-Type")).toContain(
				"text/markdown",
			);

			// Get metadata
			const metadataResponse = await SELF.fetch(
				"https://example.com/api/v1/skills/@testuser/my-skill",
			);
			expect(metadataResponse.status).toBe(200);
			const metadata = (await metadataResponse.json()) as {
				namespace: string;
				name: string;
				latest: string;
			};
			expect(metadata.namespace).toBe("testuser");
			expect(metadata.name).toBe("my-skill");
			expect(metadata.latest).toBe("1.0.0");

			// Get latest
			const latestResponse = await SELF.fetch(
				"https://example.com/api/v1/skills/@testuser/my-skill/latest",
			);
			expect(latestResponse.status).toBe(200);
			expect(await latestResponse.text()).toBe(content);
			expect(latestResponse.headers.get("X-Skill-Version")).toBe("1.0.0");
		});
	});

	describe("authentication", () => {
		it("returns 401 when publishing without auth", async () => {
			const response = await SELF.fetch(
				"https://example.com/api/v1/skills/@testuser/my-skill/versions/1.0.0",
				{
					method: "PUT",
					body: "# Test",
				},
			);
			expect(response.status).toBe(401);
		});

		it("returns 403 when publishing to different namespace", async () => {
			const authHeader = await createTestToken("testuser");
			const response = await SELF.fetch(
				"https://example.com/api/v1/skills/@otheruser/my-skill/versions/1.0.0",
				{
					method: "PUT",
					body: "# Test",
					headers: {
						Authorization: authHeader,
					},
				},
			);
			expect(response.status).toBe(403);
		});
	});

	describe("user profiles", () => {
		it("returns 404 for non-existent profile", async () => {
			const response = await SELF.fetch(
				"https://example.com/api/v1/users/@nonexistent",
			);
			expect(response.status).toBe(404);
		});

		it("can update own profile", async () => {
			const authHeader = await createTestToken("testuser2");
			const response = await SELF.fetch(
				"https://example.com/api/v1/users/@testuser2",
				{
					method: "PUT",
					body: JSON.stringify({
						displayName: "Test User",
						bio: "A test user",
					}),
					headers: {
						Authorization: authHeader,
						"Content-Type": "application/json",
					},
				},
			);
			expect(response.status).toBe(200);
			const profile = (await response.json()) as {
				namespace: string;
				displayName: string;
				bio: string;
			};
			expect(profile.namespace).toBe("testuser2");
			expect(profile.displayName).toBe("Test User");
			expect(profile.bio).toBe("A test user");

			// Verify we can get it back
			const getResponse = await SELF.fetch(
				"https://example.com/api/v1/users/@testuser2",
			);
			expect(getResponse.status).toBe(200);
		});

		it("returns 403 when updating another user's profile", async () => {
			const authHeader = await createTestToken("testuser");
			const response = await SELF.fetch(
				"https://example.com/api/v1/users/@otheruser",
				{
					method: "PUT",
					body: JSON.stringify({ displayName: "Hacked" }),
					headers: {
						Authorization: authHeader,
						"Content-Type": "application/json",
					},
				},
			);
			expect(response.status).toBe(403);
		});
	});

	describe("validation", () => {
		it("rejects invalid namespace", async () => {
			const response = await SELF.fetch(
				"https://example.com/api/v1/skills/@INVALID",
			);
			expect(response.status).toBe(400);
		});

		it("rejects invalid version", async () => {
			const response = await SELF.fetch(
				"https://example.com/api/v1/skills/@testuser/my-skill/versions/invalid",
			);
			expect(response.status).toBe(400);
		});
	});
});
