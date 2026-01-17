import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import type { Identity } from "../types/index.js";

/**
 * JWT payload from Cloudflare Access
 */
const cfAccessJwtPayloadSchema = z.object({
	sub: z.string(), // email or service token ID
	email: z.string().email().optional(),
	// CF Access includes other fields but we only need these
});

/**
 * Environment bindings required for auth
 */
export interface AuthEnv {
	/**
	 * Cloudflare Access team domain (e.g., "myteam.cloudflareaccess.com")
	 * Required for JWT validation in production.
	 */
	CF_ACCESS_TEAM_DOMAIN?: string;

	/**
	 * Cloudflare Access audience tag (Application AUD)
	 * Required for JWT validation in production.
	 */
	CF_ACCESS_AUD?: string;
}

/**
 * Variables set by auth middleware
 */
export interface AuthVariables {
	identity: Identity | null;
}

/**
 * Extract namespace from email.
 * For now, we use the local part of the email as the namespace.
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
		.slice(0, 40); // max namespace length
}

/**
 * Decode JWT payload without verification (for development only).
 * In production, we verify the JWT signature against Cloudflare Access keys.
 */
function decodeJwtPayload(jwt: string): unknown {
	const parts = jwt.split(".");
	const payloadPart = parts[1];
	if (!payloadPart) {
		throw new Error("Invalid JWT format");
	}
	// Base64url decode
	const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
	const json = atob(base64);
	return JSON.parse(json) as unknown;
}

/**
 * Verify Cloudflare Access JWT.
 * This fetches the JWKS from Cloudflare and verifies the signature.
 */
async function verifyCfAccessJwt(
	jwt: string,
	teamDomain: string,
	audience: string,
): Promise<z.infer<typeof cfAccessJwtPayloadSchema>> {
	// Fetch JWKS from Cloudflare Access
	const jwksUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
	const jwksResponse = await fetch(jwksUrl);
	if (!jwksResponse.ok) {
		throw new Error(`Failed to fetch JWKS: ${jwksResponse.status}`);
	}
	const jwks = (await jwksResponse.json()) as {
		keys: Array<JsonWebKey & { kid?: string }>;
	};

	// Parse the JWT header to get the key ID
	const parts = jwt.split(".");
	const headerPart = parts[0];
	if (!headerPart) {
		throw new Error("Invalid JWT format");
	}
	const headerJson = atob(headerPart.replace(/-/g, "+").replace(/_/g, "/"));
	const header = JSON.parse(headerJson) as { kid?: string; alg?: string };

	// Find the matching key
	const key = jwks.keys.find((k) => k.kid === header.kid);
	if (!key) {
		throw new Error("JWT key not found in JWKS");
	}

	// Import the key
	const cryptoKey = await crypto.subtle.importKey(
		"jwk",
		key,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["verify"],
	);

	// Verify the signature
	const signaturePart = parts[2];
	if (!signaturePart) {
		throw new Error("Invalid JWT format");
	}
	const signatureBase64 = signaturePart.replace(/-/g, "+").replace(/_/g, "/");
	const signature = Uint8Array.from(atob(signatureBase64), (c) =>
		c.charCodeAt(0),
	);
	const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

	const valid = await crypto.subtle.verify(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		signature,
		data,
	);
	if (!valid) {
		throw new Error("JWT signature verification failed");
	}

	// Decode and validate payload
	const payload = decodeJwtPayload(jwt);
	const parsed = cfAccessJwtPayloadSchema.parse(payload);

	// Verify audience (if specified in payload)
	const fullPayload = payload as { aud?: string[] | string };
	if (fullPayload.aud) {
		const auds = Array.isArray(fullPayload.aud)
			? fullPayload.aud
			: [fullPayload.aud];
		if (!auds.includes(audience)) {
			throw new Error("JWT audience mismatch");
		}
	}

	return parsed;
}

/**
 * Auth middleware that extracts identity from request headers.
 *
 * Checks in order:
 * 1. Cf-Access-Jwt-Assertion header (Cloudflare Access JWT)
 * 2. Authorization: Bearer <token> header (dev fallback, token is namespace)
 *
 * Sets c.var.identity to the extracted Identity or null if no auth provided.
 */
export function authMiddleware<
	E extends { Bindings: AuthEnv; Variables: AuthVariables },
>(): MiddlewareHandler<E> {
	return async (c: Context<E>, next) => {
		const cfAccessJwt = c.req.header("Cf-Access-Jwt-Assertion");
		const authHeader = c.req.header("Authorization");
		const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
		const audience = c.env.CF_ACCESS_AUD;

		// Try Cloudflare Access JWT first
		if (cfAccessJwt && teamDomain && audience) {
			try {
				const payload = await verifyCfAccessJwt(
					cfAccessJwt,
					teamDomain,
					audience,
				);
				const email = payload.email ?? payload.sub;
				c.set("identity", {
					namespace: namespaceFromEmail(email),
					email: payload.email,
				});
				return next();
			} catch {
				// JWT verification failed, fall through to other methods
			}
		}

		// Dev fallback: Authorization: Bearer <namespace>
		// In development, the bearer token IS the namespace
		if (authHeader?.startsWith("Bearer ")) {
			const token = authHeader.slice(7);
			// If it looks like a JWT (has dots), try to decode it for dev
			if (token.includes(".")) {
				try {
					const payload = cfAccessJwtPayloadSchema.parse(
						decodeJwtPayload(token),
					);
					const email = payload.email ?? payload.sub;
					c.set("identity", {
						namespace: namespaceFromEmail(email),
						email: payload.email,
					});
					return next();
				} catch {
					// Not a valid JWT, treat as namespace
				}
			}
			// Treat token as namespace directly (dev mode)
			c.set("identity", {
				namespace: token,
				email: undefined,
			});
			return next();
		}

		// No auth provided
		c.set("identity", null);
		return next();
	};
}

/**
 * Middleware that requires authentication.
 * Returns 401 if no identity is present.
 */
export function requireAuth<
	E extends { Variables: AuthVariables },
>(): MiddlewareHandler<E> {
	return async (c: Context<E>, next) => {
		const identity = c.get("identity");
		if (!identity) {
			return c.json({ error: "Authentication required" }, 401);
		}
		return next();
	};
}
