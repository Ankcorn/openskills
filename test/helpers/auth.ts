/**
 * Test authentication helpers.
 *
 * Generates valid JWT tokens for use in tests.
 */

import { env } from "cloudflare:test";
import { exportPKCS8, exportSPKI, generateKeyPair, SignJWT } from "jose";

const KEY_ALG = "ES256";
const KEY_ID = "signing-key-v1";
const KV_KEY = "auth:signing-key";

// Cache the key pair to avoid regenerating for each test
let cachedKeyPair: {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
} | null = null;

/**
 * Initialize the signing key in KV for tests.
 * Must be called before using createTestToken.
 */
export async function initTestAuth(): Promise<void> {
	if (!cachedKeyPair) {
		cachedKeyPair = await generateKeyPair(KEY_ALG, { extractable: true });
	}

	const toStore = {
		id: KEY_ID,
		publicKey: await exportSPKI(cachedKeyPair.publicKey),
		privateKey: await exportPKCS8(cachedKeyPair.privateKey),
		created: Date.now(),
		alg: KEY_ALG,
	};

	await env.AUTH_KV.put(KV_KEY, JSON.stringify(toStore));
}

/**
 * Create a valid JWT token for a test user.
 *
 * @param namespace - The user's namespace (e.g., "testuser")
 * @param email - Optional email address
 * @returns Authorization header value (e.g., "Bearer eyJ...")
 */
export async function createTestToken(
	namespace: string,
	email: string | null = null,
): Promise<string> {
	if (!cachedKeyPair) {
		throw new Error("Call initTestAuth() before createTestToken()");
	}

	const token = await new SignJWT({
		namespace,
		email,
		provider: "github",
	})
		.setProtectedHeader({ alg: KEY_ALG, kid: KEY_ID })
		.setIssuedAt()
		.setIssuer("https://example.com")
		.setExpirationTime("1h")
		.sign(cachedKeyPair.privateKey);

	return `Bearer ${token}`;
}
