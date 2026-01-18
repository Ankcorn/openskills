/**
 * Auth factory that selects the appropriate provider based on AUTH_PROVIDER.
 */

import type { Context, MiddlewareHandler } from "hono";
import { makeAuthCloudflareAccess } from "./cloudflare-access.js";
import { makeAuthGitHub } from "./github-middleware.js";
import type { Auth, AuthEnv, AuthVariables } from "./interface.js";
import { validateAuthEnv } from "./interface.js";

/**
 * Create a no-op auth provider for read-only local development.
 * All users are unauthenticated, write operations will fail with 401.
 */
function makeAuthNone<
	E extends AuthEnv = AuthEnv,
	V extends AuthVariables = AuthVariables,
>(): Auth<E, V> {
	const middleware: MiddlewareHandler<{ Bindings: E; Variables: V }> = async (
		c: Context<{ Bindings: E; Variables: V }>,
		next,
	) => {
		c.set("identity", null);
		return next();
	};

	const requireAuth: MiddlewareHandler<{ Bindings: E; Variables: V }> = async (
		c: Context<{ Bindings: E; Variables: V }>,
	) => {
		return c.json(
			{ error: "Authentication disabled (AUTH_PROVIDER=none)" },
			401,
		);
	};

	return { middleware, requireAuth };
}

/**
 * Create an auth provider based on the AUTH_PROVIDER environment variable.
 *
 * @param env - The environment bindings
 * @returns The appropriate Auth implementation
 * @throws Error if AUTH_PROVIDER is missing or invalid, or if required vars are missing
 */
export function makeAuth<
	E extends AuthEnv = AuthEnv,
	V extends AuthVariables = AuthVariables,
>(env: E): Auth<E, V> {
	validateAuthEnv(env);

	const provider = env.AUTH_PROVIDER;

	switch (provider) {
		case "cloudflare-access": {
			// validateAuthEnv ensures these are defined for cloudflare-access provider
			const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
			const audience = env.CF_ACCESS_AUDIENCE;
			if (!teamDomain || !audience) {
				throw new Error(
					"CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUDIENCE required",
				);
			}
			return makeAuthCloudflareAccess<E, V>(teamDomain, audience);
		}

		case "github": {
			return makeAuthGitHub<E, V>();
		}

		case "none": {
			return makeAuthNone<E, V>();
		}

		default: {
			const exhaustiveCheck: never = provider;
			throw new Error(`Unknown AUTH_PROVIDER: ${exhaustiveCheck}`);
		}
	}
}
