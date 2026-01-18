/**
 * Auth-specific logger using hatchlet.
 *
 * Provides structured logging for authentication events
 * with user identification details for debugging.
 */

import { Logger } from "hatchlet";

/**
 * Auth logger instance with "[AUTH]" prefix context.
 */
export const authLog = new Logger();

/**
 * Mask sensitive parts of a token for logging.
 * Shows first 8 and last 4 characters only.
 */
export function maskToken(token: string): string {
	if (token.length <= 16) {
		return "***";
	}
	return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

/**
 * Mask email for logging (shows first char and domain).
 * e.g., "alice@example.com" -> "a***@example.com"
 */
export function maskEmail(email: string | null | undefined): string {
	if (!email) return "(none)";
	const [local, domain] = email.split("@");
	if (!local || !domain) return "(invalid)";
	return `${local[0]}***@${domain}`;
}
