/**
 * Auth factory that selects the appropriate provider based on AUTH_PROVIDER.
 */

import { makeAuthCloudflareAccess } from "./cloudflare-access.js";
import { makeAuthGitHub } from "./github-middleware.js";
import type { Auth, AuthEnv, AuthVariables } from "./interface.js";
import { validateAuthEnv } from "./interface.js";

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
			const teamDomain = env.CF_ACCESS_TEAM_DOMAIN!;
			const audience = env.CF_ACCESS_AUDIENCE!;
			return makeAuthCloudflareAccess<E, V>(teamDomain, audience);
		}

		case "github": {
			return makeAuthGitHub<E, V>();
		}

		default: {
			const exhaustiveCheck: never = provider;
			throw new Error(`Unknown AUTH_PROVIDER: ${exhaustiveCheck}`);
		}
	}
}
