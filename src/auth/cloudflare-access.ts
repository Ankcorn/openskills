/**
 * Cloudflare Access authentication provider.
 *
 * Validates JWTs from Cloudflare Access using the remote JWK set.
 * This is a production auth provider.
 */
import type { Context, MiddlewareHandler } from "hono";
import * as jose from "jose";
import { z } from "zod";
import type { Auth, AuthEnv, AuthVariables } from "./interface.js";
import { authLog, maskEmail, maskToken } from "./logger.js";

/**
 * Cloudflare Access JWT payload schema.
 * We only extract the fields we need for identity.
 */
const cfAccessPayloadSchema = z.object({
	sub: z.string(),
	email: z.string().email().optional(),
	aud: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Cache for JWKS to avoid fetching on every request.
 * jose handles caching internally, but we cache the createRemoteJWKSet result.
 */
const jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

/**
 * Get or create a cached JWKS for the given team domain.
 */
function getJWKS(
	teamDomain: string,
): ReturnType<typeof jose.createRemoteJWKSet> {
	const cached = jwksCache.get(teamDomain);
	if (cached) {
		return cached;
	}

	const jwksUrl = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
	const jwks = jose.createRemoteJWKSet(jwksUrl);
	jwksCache.set(teamDomain, jwks);
	return jwks;
}

/**
 * Extract namespace from email.
 * Uses the local part of the email as the namespace.
 * e.g., "alice@example.com" -> "alice"
 */
function namespaceFromEmail(email: string): string {
	const localPart = email.split("@")[0];
	if (!localPart) {
		throw new Error(`Invalid email: ${email}`);
	}
	// Normalize: lowercase, replace invalid chars with hyphens
	return localPart
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
		.replace(/-{2,}/g, "-") // collapse multiple hyphens
		.slice(0, 40); // max namespace length
}

/**
 * Verify a Cloudflare Access JWT.
 *
 * @param jwt - The JWT from the Cf-Access-Jwt-Assertion header
 * @param teamDomain - The Cloudflare Access team domain
 * @param audience - The expected audience (application AUD)
 * @returns The validated payload
 * @throws If verification fails
 */
async function verifyCfAccessJwt(
	jwt: string,
	teamDomain: string,
	audience: string,
): Promise<z.infer<typeof cfAccessPayloadSchema>> {
	authLog.debug`[AUTH:CF] Verifying CF Access JWT, token=${maskToken(jwt)}`;

	const jwks = getJWKS(teamDomain);

	// Verify the JWT signature and claims
	const { payload } = await jose.jwtVerify(jwt, jwks, {
		audience,
		// CF Access uses RS256
		algorithms: ["RS256"],
	});

	// Parse and validate the payload
	const validated = cfAccessPayloadSchema.parse(payload);
	authLog.debug`[AUTH:CF] JWT verified: sub=${validated.sub}, email=${maskEmail(validated.email)}`;

	return validated;
}

/**
 * Create a Cloudflare Access auth provider.
 *
 * This provider validates JWTs from the `Cf-Access-Jwt-Assertion` header
 * against the Cloudflare Access JWK set.
 *
 * Required env vars:
 * - CF_ACCESS_TEAM_DOMAIN: e.g., "myteam.cloudflareaccess.com"
 * - CF_ACCESS_AUDIENCE: The application AUD tag
 *
 * @param teamDomain - The Cloudflare Access team domain
 * @param audience - The expected audience (application AUD)
 */
export function makeAuthCloudflareAccess<
	E extends AuthEnv = AuthEnv,
	V extends AuthVariables = AuthVariables,
>(teamDomain: string, audience: string): Auth<E, V> {
	const middleware: MiddlewareHandler<{ Bindings: E; Variables: V }> = async (
		c: Context<{ Bindings: E; Variables: V }>,
		next,
	) => {
		const requestPath = c.req.path;

		// Look for the CF Access JWT assertion header
		const jwt = c.req.header("Cf-Access-Jwt-Assertion");

		if (jwt) {
			authLog.debug`[AUTH:CF] Found Cf-Access-Jwt-Assertion header for ${requestPath}`;
			try {
				const payload = await verifyCfAccessJwt(jwt, teamDomain, audience);
				const email = payload.email ?? payload.sub;
				const namespace = namespaceFromEmail(email);

				authLog.info`[AUTH:CF] Authenticated via header: namespace=${namespace}, email=${maskEmail(payload.email)}, path=${requestPath}`;
				c.set("identity", {
					namespace,
					email: payload.email,
				});
				return next();
			} catch (err) {
				// JWT verification failed - treat as unauthenticated
				authLog.warn`[AUTH:CF] Header JWT verification failed for ${requestPath}: ${err instanceof Error ? err.message : "unknown error"}`;
			}
		}

		// Also check for CF_Authorization cookie (alternative transport)
		const cfAuthCookie = getCookie(c, "CF_Authorization");
		if (cfAuthCookie) {
			authLog.debug`[AUTH:CF] Found CF_Authorization cookie for ${requestPath}`;
			try {
				const payload = await verifyCfAccessJwt(
					cfAuthCookie,
					teamDomain,
					audience,
				);
				const email = payload.email ?? payload.sub;
				const namespace = namespaceFromEmail(email);

				authLog.info`[AUTH:CF] Authenticated via cookie: namespace=${namespace}, email=${maskEmail(payload.email)}, path=${requestPath}`;
				c.set("identity", {
					namespace,
					email: payload.email,
				});
				return next();
			} catch (err) {
				// Cookie verification failed - treat as unauthenticated
				authLog.warn`[AUTH:CF] Cookie JWT verification failed for ${requestPath}: ${err instanceof Error ? err.message : "unknown error"}`;
			}
		}

		// No valid auth found
		authLog.debug`[AUTH:CF] No valid CF Access auth for ${requestPath}`;
		c.set("identity", null);
		return next();
	};

	const requireAuth: MiddlewareHandler<{ Bindings: E; Variables: V }> = async (
		c: Context<{ Bindings: E; Variables: V }>,
		next,
	) => {
		const identity = c.get("identity");
		const requestPath = c.req.path;

		if (!identity) {
			authLog.warn`[AUTH:CF] Unauthorized access attempt: path=${requestPath}`;
			return c.json({ error: "Authentication required" }, 401);
		}

		authLog.debug`[AUTH:CF] Auth required and satisfied: namespace=${identity.namespace}, path=${requestPath}`;
		return next();
	};

	return {
		middleware,
		requireAuth,
	};
}

/**
 * Simple cookie getter (avoids importing hono/cookie for minimal dependency).
 */
function getCookie(c: Context, name: string): string | undefined {
	const cookieHeader = c.req.header("Cookie");
	if (!cookieHeader) return undefined;

	const cookies = cookieHeader.split(";").map((s) => s.trim());
	for (const cookie of cookies) {
		const [cookieName, ...valueParts] = cookie.split("=");
		if (cookieName === name) {
			return valueParts.join("=");
		}
	}
	return undefined;
}
