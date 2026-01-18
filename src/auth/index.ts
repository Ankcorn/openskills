/**
 * Authentication module exports.
 *
 * Providers:
 * - GitHub: OAuth with our own JWTs
 * - Cloudflare Access: JWT verification via CF Access
 */

// Auth providers
export { makeAuthCloudflareAccess } from "./cloudflare-access.js";
// Factory that selects provider based on AUTH_PROVIDER env var
export { makeAuth } from "./factory.js";
export { makeAuthGitHub } from "./github-middleware.js";

// Core interface and types
export {
	type Auth,
	type AuthEnv,
	type AuthFactory,
	type AuthProvider,
	type AuthVariables,
	COOKIE_NAMES,
	getCookieSettings,
	validateAuthEnv,
} from "./interface.js";

// Logger utilities
export { authLog, maskEmail, maskToken } from "./logger.js";
