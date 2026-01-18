import type { MiddlewareHandler } from "hono";
import type { Identity } from "../types/index.js";

/**
 * Auth provider types.
 * - github: GitHub OAuth with our own JWTs
 * - cloudflare-access: Cloudflare Access JWT verification
 * - none: No authentication (read-only mode for local development)
 */
export type AuthProvider = "github" | "cloudflare-access" | "none";

/**
 * Environment bindings required for authentication.
 */
export interface AuthEnv {
	/** Which auth provider to use */
	AUTH_PROVIDER: AuthProvider;

	/** GitHub OAuth app client ID (required for github provider) */
	GITHUB_CLIENT_ID?: string;

	/** GitHub OAuth app client secret (required for github provider) */
	GITHUB_CLIENT_SECRET?: string;

	/** Cloudflare Access team domain e.g. "myteam.cloudflareaccess.com" (required for cloudflare-access provider) */
	CF_ACCESS_TEAM_DOMAIN?: string;

	/** Cloudflare Access application audience tag (required for cloudflare-access provider) */
	CF_ACCESS_AUDIENCE?: string;

	/** KV namespace for storing signing keys (required for github provider) */
	AUTH_KV?: KVNamespace;
}

/**
 * Variables set by auth middleware on the Hono context.
 */
export interface AuthVariables {
	/** The authenticated identity, or null if not authenticated */
	identity: Identity | null;
}

/**
 * Auth abstraction that provides middleware for authentication.
 *
 * @template E - Environment bindings type (must extend AuthEnv)
 * @template V - Variables type (must extend AuthVariables)
 */
export interface Auth<
	E extends AuthEnv = AuthEnv,
	V extends AuthVariables = AuthVariables,
> {
	/**
	 * Middleware that extracts identity from request.
	 * Sets `c.var.identity` to the authenticated Identity or null.
	 * Does NOT reject unauthenticated requests.
	 */
	middleware: MiddlewareHandler<{ Bindings: E; Variables: V }>;

	/**
	 * Middleware that requires authentication.
	 * Returns 401 if no identity is present.
	 * Must be used after `middleware`.
	 */
	requireAuth: MiddlewareHandler<{ Bindings: E; Variables: V }>;
}

/**
 * Factory function to create an Auth instance for a given environment.
 *
 * @template E - Environment bindings type (must extend AuthEnv)
 * @template V - Variables type (must extend AuthVariables)
 */
export type AuthFactory<
	E extends AuthEnv = AuthEnv,
	V extends AuthVariables = AuthVariables,
> = (env: E) => Auth<E, V>;

/**
 * Cookie names used for authentication.
 */
export const COOKIE_NAMES = {
	/** Access token cookie */
	ACCESS: "openskills_access",
} as const;

/**
 * Cookie security settings based on environment.
 *
 * @param isSecure - Whether the connection is HTTPS
 * @returns Cookie attribute settings
 */
export function getCookieSettings(isSecure: boolean) {
	return {
		httpOnly: true,
		secure: isSecure,
		sameSite: "Lax" as const,
		path: "/",
	};
}

/**
 * Validates that required environment variables are set for the given provider.
 * Throws an error with a clear message if any required vars are missing.
 *
 * @param env - The environment bindings
 * @throws Error if required vars are missing for the configured provider
 */
export function validateAuthEnv(env: AuthEnv): void {
	const provider = env.AUTH_PROVIDER;

	if (!provider) {
		throw new Error("AUTH_PROVIDER environment variable is required");
	}

	switch (provider) {
		case "github": {
			const missing: string[] = [];
			if (!env.GITHUB_CLIENT_ID) missing.push("GITHUB_CLIENT_ID");
			if (!env.GITHUB_CLIENT_SECRET) missing.push("GITHUB_CLIENT_SECRET");
			if (!env.AUTH_KV) missing.push("AUTH_KV binding");
			if (missing.length > 0) {
				throw new Error(`GitHub auth provider requires: ${missing.join(", ")}`);
			}
			break;
		}
		case "cloudflare-access": {
			const missing: string[] = [];
			if (!env.CF_ACCESS_TEAM_DOMAIN) missing.push("CF_ACCESS_TEAM_DOMAIN");
			if (!env.CF_ACCESS_AUDIENCE) missing.push("CF_ACCESS_AUDIENCE");
			if (missing.length > 0) {
				throw new Error(
					`Cloudflare Access auth provider requires: ${missing.join(", ")}`,
				);
			}
			break;
		}
		case "none": {
			// No validation needed - read-only mode
			break;
		}
		default: {
			const exhaustiveCheck: never = provider;
			throw new Error(`Unknown AUTH_PROVIDER: ${exhaustiveCheck}`);
		}
	}
}
