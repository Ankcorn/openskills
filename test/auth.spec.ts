import { describe, expect, it } from "vitest";
import {
	type AuthEnv,
	COOKIE_NAMES,
	getCookieSettings,
	makeAuth,
	makeAuthCloudflareAccess,
	makeAuthGitHub,
	validateAuthEnv,
} from "../src/auth/index.js";

describe("Auth", () => {
	describe("validateAuthEnv", () => {
		it("throws when AUTH_PROVIDER is missing", () => {
			const env = {} as AuthEnv;
			expect(() => validateAuthEnv(env)).toThrow(
				"AUTH_PROVIDER environment variable is required",
			);
		});

		it("throws when github provider missing required vars", () => {
			const env = { AUTH_PROVIDER: "github" } as AuthEnv;
			expect(() => validateAuthEnv(env)).toThrow(
				"GitHub auth provider requires: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, AUTH_KV binding",
			);
		});

		it("throws when cloudflare-access provider missing required vars", () => {
			const env = { AUTH_PROVIDER: "cloudflare-access" } as AuthEnv;
			expect(() => validateAuthEnv(env)).toThrow(
				"Cloudflare Access auth provider requires: CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUDIENCE",
			);
		});

		it("passes when cloudflare-access has all required vars", () => {
			const env = {
				AUTH_PROVIDER: "cloudflare-access",
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUDIENCE: "test-audience",
			} as AuthEnv;
			expect(() => validateAuthEnv(env)).not.toThrow();
		});

		it("passes when github has all required vars", () => {
			const mockKV = {} as KVNamespace;
			const env = {
				AUTH_PROVIDER: "github",
				GITHUB_CLIENT_ID: "test-client-id",
				GITHUB_CLIENT_SECRET: "test-secret",
				AUTH_KV: mockKV,
			} as AuthEnv;
			expect(() => validateAuthEnv(env)).not.toThrow();
		});
	});

	describe("getCookieSettings", () => {
		it("returns secure settings for production", () => {
			const settings = getCookieSettings(true);
			expect(settings.httpOnly).toBe(true);
			expect(settings.secure).toBe(true);
			expect(settings.sameSite).toBe("Lax");
			expect(settings.path).toBe("/");
		});

		it("returns non-secure settings for local dev", () => {
			const settings = getCookieSettings(false);
			expect(settings.httpOnly).toBe(true);
			expect(settings.secure).toBe(false);
			expect(settings.sameSite).toBe("Lax");
			expect(settings.path).toBe("/");
		});
	});

	describe("COOKIE_NAMES", () => {
		it("has expected cookie names", () => {
			expect(COOKIE_NAMES.ACCESS).toBe("openskills_access");
		});
	});

	describe("makeAuthCloudflareAccess", () => {
		it("creates auth with middleware and requireAuth", () => {
			const auth = makeAuthCloudflareAccess(
				"test.cloudflareaccess.com",
				"test-audience",
			);
			expect(auth.middleware).toBeDefined();
			expect(auth.requireAuth).toBeDefined();
		});
	});

	describe("makeAuthGitHub", () => {
		it("creates auth with middleware and requireAuth", () => {
			const auth = makeAuthGitHub();
			expect(auth.middleware).toBeDefined();
			expect(auth.requireAuth).toBeDefined();
		});
	});

	describe("makeAuth", () => {
		it("creates cloudflare-access auth when configured", () => {
			const env = {
				AUTH_PROVIDER: "cloudflare-access",
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUDIENCE: "test-audience",
			} as AuthEnv;
			const auth = makeAuth(env);
			expect(auth.middleware).toBeDefined();
			expect(auth.requireAuth).toBeDefined();
		});

		it("creates GitHub auth for github provider", () => {
			const mockKV = {} as KVNamespace;
			const env = {
				AUTH_PROVIDER: "github",
				GITHUB_CLIENT_ID: "test-client-id",
				GITHUB_CLIENT_SECRET: "test-secret",
				AUTH_KV: mockKV,
			} as AuthEnv;
			const auth = makeAuth(env);
			expect(auth.middleware).toBeDefined();
			expect(auth.requireAuth).toBeDefined();
		});
	});
});
