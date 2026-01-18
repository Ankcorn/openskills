/**
 * Simple GitHub OAuth implementation.
 *
 * This module handles:
 * 1. Redirecting users to GitHub for authorization
 * 2. Exchanging authorization codes for access tokens
 * 3. Fetching user profile from GitHub
 * 4. Creating/verifying our own JWTs
 */

import { Result } from "better-result";
import {
	exportPKCS8,
	exportSPKI,
	generateKeyPair,
	importPKCS8,
	importSPKI,
	type JWTPayload,
	jwtVerify,
	SignJWT,
} from "jose";
import { z } from "zod";

import { authLog, maskEmail, maskToken } from "./logger.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * GitHub user profile response schema.
 */
const gitHubUserSchema = z.object({
	login: z.string(),
	email: z.string().email().nullable(),
	name: z.string().nullable(),
	avatar_url: z.string().url(),
});

export type GitHubUser = z.infer<typeof gitHubUserSchema>;

/**
 * GitHub email list response schema.
 */
const gitHubEmailSchema = z.object({
	email: z.string().email(),
	primary: z.boolean(),
	verified: z.boolean(),
});

/**
 * GitHub OAuth token response schema.
 */
const gitHubTokenSuccessSchema = z.object({
	access_token: z.string(),
});

const gitHubTokenErrorSchema = z.object({
	error: z.string(),
	error_description: z.string().optional(),
});

const gitHubTokenResponseSchema = z.union([
	gitHubTokenSuccessSchema,
	gitHubTokenErrorSchema,
]);

/**
 * Stored signing key schema for KV.
 */
const storedKeySchema = z.object({
	id: z.string(),
	publicKey: z.string(),
	privateKey: z.string(),
	created: z.number(),
	alg: z.string(),
});

type StoredKey = z.infer<typeof storedKeySchema>;

/**
 * Our JWT payload schema for validation.
 */
const tokenPayloadSchema = z.object({
	namespace: z.string(),
	email: z.string().email().nullable(),
	provider: z.literal("github"),
});

/**
 * Our JWT payload structure (extends JWTPayload for jose compatibility).
 */
export interface TokenPayload extends JWTPayload {
	namespace: string;
	email: string | null;
	provider: "github";
}

const KEY_ALG = "ES256";
const KEY_ID = "signing-key-v1";
const KV_KEY = "auth:signing-key";

// =============================================================================
// Error Types
// =============================================================================

export type GitHubAuthErrorCode =
	| "TOKEN_EXCHANGE_FAILED"
	| "USER_FETCH_FAILED"
	| "INVALID_RESPONSE";

export interface GitHubAuthError {
	code: GitHubAuthErrorCode;
	message: string;
}

// =============================================================================
// Signing Key Management
// =============================================================================

interface SigningKeyResult {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
	kid: string;
}

/**
 * Get or create the signing key from KV.
 */
async function getSigningKey(
	kv: KVNamespace,
): Promise<Result<SigningKeyResult, Error>> {
	// Try to get existing key
	const raw = await kv.get(KV_KEY, "text");

	if (raw) {
		authLog.debug`[AUTH] Loading existing signing key from KV`;

		const parseResult = Result.try(() => JSON.parse(raw) as unknown);
		if (parseResult.isErr()) {
			authLog.error`[AUTH] Failed to parse stored signing key JSON`;
			return Result.err(new Error("Failed to parse stored key JSON"));
		}

		const validationResult = storedKeySchema.safeParse(parseResult.value);
		if (!validationResult.success) {
			authLog.error`[AUTH] Invalid stored signing key format`;
			return Result.err(new Error("Invalid stored key format"));
		}

		const stored = validationResult.data;
		const importResult = await Result.tryPromise(async () => {
			const privateKey = await importPKCS8(stored.privateKey, KEY_ALG);
			const publicKey = await importSPKI(stored.publicKey, KEY_ALG);
			return { privateKey, publicKey, kid: stored.id };
		});

		if (importResult.isErr()) {
			authLog.error`[AUTH] Failed to import stored signing keys`;
			return Result.err(new Error("Failed to import stored keys"));
		}

		authLog.debug`[AUTH] Signing key loaded successfully, kid=${stored.id}`;
		return Result.ok(importResult.value);
	}

	// Generate new key pair
	authLog.info`[AUTH] No signing key found, generating new key pair`;

	const generateResult = await Result.tryPromise(async () => {
		const { privateKey, publicKey } = await generateKeyPair(KEY_ALG, {
			extractable: true,
		});

		const toStore: StoredKey = {
			id: KEY_ID,
			publicKey: await exportSPKI(publicKey),
			privateKey: await exportPKCS8(privateKey),
			created: Date.now(),
			alg: KEY_ALG,
		};

		await kv.put(KV_KEY, JSON.stringify(toStore));

		return { privateKey, publicKey, kid: KEY_ID };
	});

	if (generateResult.isErr()) {
		authLog.error`[AUTH] Failed to generate new signing key pair`;
		return Result.err(
			generateResult.error instanceof Error
				? generateResult.error
				: new Error("Failed to generate signing key"),
		);
	}

	authLog.info`[AUTH] New signing key generated successfully, kid=${KEY_ID}`;
	return Result.ok(generateResult.value);
}

/**
 * Generate the GitHub authorization URL
 */
export function getGitHubAuthURL(params: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const url = new URL(GITHUB_AUTHORIZE_URL);
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("scope", "read:user user:email");
	url.searchParams.set("state", params.state);
	return url.toString();
}

/**
 * Exchange authorization code for GitHub access token.
 *
 * @returns Result with access token or a GitHubAuthError
 */
export async function exchangeCodeForToken(params: {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
}): Promise<Result<{ access_token: string }, GitHubAuthError>> {
	authLog.debug`[AUTH] Exchanging OAuth code for GitHub access token`;

	const fetchResult = await Result.tryPromise(async () => {
		const response = await fetch(GITHUB_TOKEN_URL, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				client_id: params.clientId,
				client_secret: params.clientSecret,
				code: params.code,
				redirect_uri: params.redirectUri,
			}),
		});
		return response.json() as Promise<unknown>;
	});

	if (fetchResult.isErr()) {
		authLog.error`[AUTH] GitHub token exchange failed: network error`;
		return Result.err({
			code: "TOKEN_EXCHANGE_FAILED",
			message: "Failed to exchange code for token",
		});
	}

	// Parse with Zod
	const parseResult = gitHubTokenResponseSchema.safeParse(fetchResult.value);
	if (!parseResult.success) {
		authLog.error`[AUTH] GitHub token exchange failed: invalid response format`;
		return Result.err({
			code: "INVALID_RESPONSE",
			message: "Invalid response from GitHub token endpoint",
		});
	}

	const data = parseResult.data;
	if ("error" in data) {
		const errorMsg = data.error_description ?? data.error;
		authLog.error`[AUTH] GitHub token exchange failed: ${errorMsg}`;
		return Result.err({
			code: "TOKEN_EXCHANGE_FAILED",
			message: errorMsg,
		});
	}

	authLog.debug`[AUTH] GitHub token exchange successful, token=${maskToken(data.access_token)}`;
	return Result.ok(data);
}

/**
 * Fetch GitHub user profile.
 *
 * @returns Result with user profile or a GitHubAuthError
 */
export async function fetchGitHubUser(
	accessToken: string,
): Promise<Result<GitHubUser, GitHubAuthError>> {
	authLog.debug`[AUTH] Fetching GitHub user profile`;

	const fetchResult = await Result.tryPromise(async () => {
		const response = await fetch(GITHUB_USER_URL, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "openskills",
			},
		});

		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status}`);
		}

		return response.json() as Promise<unknown>;
	});

	if (fetchResult.isErr()) {
		authLog.error`[AUTH] Failed to fetch GitHub user profile: network error`;
		return Result.err({
			code: "USER_FETCH_FAILED",
			message: "Failed to fetch GitHub user profile",
		});
	}

	// Parse with Zod
	const parseResult = gitHubUserSchema.safeParse(fetchResult.value);
	if (!parseResult.success) {
		authLog.error`[AUTH] GitHub user response invalid format`;
		return Result.err({
			code: "INVALID_RESPONSE",
			message: "Invalid response from GitHub user endpoint",
		});
	}

	const user = parseResult.data;
	authLog.info`[AUTH] GitHub user fetched: login=${user.login}, email=${maskEmail(user.email)}`;

	// If no public email, try to get primary email
	if (!user.email) {
		authLog.debug`[AUTH] No public email for ${user.login}, fetching from /user/emails`;

		const emailResult = await Result.tryPromise(async () => {
			const emailResponse = await fetch("https://api.github.com/user/emails", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "openskills",
				},
			});

			if (!emailResponse.ok) {
				return null;
			}

			return emailResponse.json() as Promise<unknown>;
		});

		if (emailResult.isOk() && emailResult.value !== null) {
			const emailsParseResult = z
				.array(gitHubEmailSchema)
				.safeParse(emailResult.value);
			if (emailsParseResult.success) {
				const primary = emailsParseResult.data.find(
					(e) => e.primary && e.verified,
				);
				if (primary) {
					authLog.info`[AUTH] Found primary email for ${user.login}: ${maskEmail(primary.email)}`;
					// Return a new object with the email set (immutable update)
					return Result.ok({ ...user, email: primary.email });
				}
			}
		}

		authLog.warn`[AUTH] No verified primary email found for ${user.login}`;
	}

	return Result.ok(user);
}

/**
 * Create a signed JWT for the user.
 *
 * @returns Result with the JWT string or an error
 */
export async function createToken(params: {
	kv: KVNamespace;
	namespace: string;
	email: string | null;
	issuer: string;
	expiresInSeconds?: number;
}): Promise<Result<string, Error>> {
	authLog.debug`[AUTH] Creating JWT for namespace=${params.namespace}, email=${maskEmail(params.email)}`;

	const keyResult = await getSigningKey(params.kv);
	if (keyResult.isErr()) {
		authLog.error`[AUTH] Failed to get signing key for token creation: namespace=${params.namespace}`;
		return Result.err(keyResult.error);
	}
	const { privateKey, kid } = keyResult.value;

	const expiresIn = params.expiresInSeconds ?? 60 * 60 * 24 * 30; // 30 days default

	const signResult = await Result.tryPromise(async () => {
		const token = await new SignJWT({
			namespace: params.namespace,
			email: params.email,
			provider: "github",
		} satisfies Omit<TokenPayload, keyof JWTPayload>)
			.setProtectedHeader({ alg: KEY_ALG, kid })
			.setIssuedAt()
			.setIssuer(params.issuer)
			.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
			.sign(privateKey);
		return token;
	});

	if (signResult.isErr()) {
		authLog.error`[AUTH] Failed to sign JWT for namespace=${params.namespace}`;
		return Result.err(new Error("Failed to sign JWT"));
	}

	authLog.info`[AUTH] JWT created for namespace=${params.namespace}, email=${maskEmail(params.email)}, expires_in=${expiresIn}s`;
	return Result.ok(signResult.value);
}

/**
 * Verify a JWT and return the payload.
 *
 * @returns Result with the validated payload or null if invalid
 */
export async function verifyToken(params: {
	kv: KVNamespace;
	token: string;
	issuer: string;
}): Promise<Result<TokenPayload, null>> {
	authLog.debug`[AUTH] Verifying JWT, token=${maskToken(params.token)}`;

	const keyResult = await getSigningKey(params.kv);
	if (keyResult.isErr()) {
		authLog.error`[AUTH] Token verification failed: could not get signing key`;
		return Result.err(null);
	}
	const { publicKey } = keyResult.value;

	const verifyResult = await Result.tryPromise(async () => {
		const { payload } = await jwtVerify(params.token, publicKey, {
			issuer: params.issuer,
		});
		return payload;
	});

	if (verifyResult.isErr()) {
		authLog.warn`[AUTH] Token verification failed: invalid signature or expired`;
		return Result.err(null);
	}

	// Validate payload structure with Zod
	const validationResult = tokenPayloadSchema.safeParse(verifyResult.value);
	if (!validationResult.success) {
		authLog.warn`[AUTH] Token verification failed: invalid payload structure`;
		return Result.err(null);
	}

	const payload = validationResult.data;
	authLog.debug`[AUTH] Token verified: namespace=${payload.namespace}, email=${maskEmail(payload.email)}`;

	// Return as TokenPayload (includes JWTPayload fields from jose)
	return Result.ok({
		...verifyResult.value,
		...validationResult.data,
	} as TokenPayload);
}

/**
 * Derive namespace from GitHub username
 */
export function deriveNamespace(username: string): string {
	return username.toLowerCase();
}
