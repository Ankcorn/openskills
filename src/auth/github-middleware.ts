/**
 * GitHub OAuth authentication middleware.
 *
 * This module provides middleware that validates JWTs we issue
 * after GitHub OAuth login. It checks:
 * 1. Authorization: Bearer header
 * 2. openskills_access cookie
 */

import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import type { Identity } from "../types/index.js";
import { verifyToken } from "./github.js";
import type { Auth, AuthEnv, AuthVariables } from "./interface.js";
import { COOKIE_NAMES } from "./interface.js";
import { authLog, maskEmail, maskToken } from "./logger.js";

/**
 * Create auth middleware that validates our JWTs.
 *
 * @returns Auth implementation for GitHub OAuth
 */
export function makeAuthGitHub<
	E extends AuthEnv = AuthEnv,
	V extends AuthVariables = AuthVariables,
>(): Auth<E, V> {
	const middleware: MiddlewareHandler<{ Bindings: E; Variables: V }> = async (
		c,
		next,
	) => {
		const requestPath = c.req.path;

		// Try Authorization header first
		const authHeader = c.req.header("Authorization");
		let accessToken: string | undefined;
		let tokenSource: "header" | "cookie" | undefined;

		if (authHeader?.startsWith("Bearer ")) {
			accessToken = authHeader.slice(7);
			tokenSource = "header";
		}

		// Fall back to cookies
		if (!accessToken) {
			accessToken = getCookie(c, COOKIE_NAMES.ACCESS);
			if (accessToken) {
				tokenSource = "cookie";
			}
		}

		// No token available
		if (!accessToken) {
			authLog.debug`[AUTH] No token found for ${requestPath}`;
			c.set("identity" as keyof V, null as V[keyof V]);
			return next();
		}

		authLog.debug`[AUTH] Token found via ${tokenSource} for ${requestPath}, token=${maskToken(accessToken)}`;

		// Get KV binding
		const kv = c.env.AUTH_KV;
		if (!kv) {
			authLog.error`[AUTH] AUTH_KV not configured - cannot verify tokens`;
			c.set("identity" as keyof V, null as V[keyof V]);
			return next();
		}

		// Determine issuer from request origin
		const url = new URL(c.req.url);
		const issuer = `${url.protocol}//${url.host}`;

		// Verify the token
		const payloadResult = await verifyToken({
			kv,
			token: accessToken,
			issuer,
		});

		if (payloadResult.isErr()) {
			authLog.warn`[AUTH] Token verification failed for ${requestPath}`;
			c.set("identity" as keyof V, null as V[keyof V]);
			return next();
		}

		// Extract identity from verified token
		const identity: Identity = {
			namespace: payloadResult.value.namespace,
			email: payloadResult.value.email ?? undefined,
		};

		authLog.info`[AUTH] Authenticated: namespace=${identity.namespace}, email=${maskEmail(identity.email)}, path=${requestPath}`;
		c.set("identity" as keyof V, identity as V[keyof V]);
		return next();
	};

	const requireAuth: MiddlewareHandler<{ Bindings: E; Variables: V }> = async (
		c,
		next,
	) => {
		const identity = c.get("identity" as keyof V) as Identity | null;
		const requestPath = c.req.path;

		if (!identity) {
			authLog.warn`[AUTH] Unauthorized access attempt: path=${requestPath}`;
			return c.json({ error: "Authentication required" }, 401);
		}

		authLog.debug`[AUTH] Auth required and satisfied: namespace=${identity.namespace}, path=${requestPath}`;
		return next();
	};

	return { middleware, requireAuth };
}
