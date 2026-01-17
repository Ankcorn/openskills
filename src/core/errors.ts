/**
 * Domain error codes for the skills registry.
 */
export const ErrorCode = {
	NOT_FOUND: "NOT_FOUND",
	VERSION_ALREADY_EXISTS: "VERSION_ALREADY_EXISTS",
	CORRUPT_STORAGE_DATA: "CORRUPT_STORAGE_DATA",
	FORBIDDEN: "FORBIDDEN",
	INVALID_INPUT: "INVALID_INPUT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Domain error with typed code for pattern matching.
 */
export class DomainError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
	) {
		super(message);
		this.name = "DomainError";
	}
}

/**
 * Factory functions for creating domain errors.
 */
export const Errors = {
	notFound(resource: string): DomainError {
		return new DomainError(ErrorCode.NOT_FOUND, `${resource} not found`);
	},

	versionAlreadyExists(
		namespace: string,
		name: string,
		version: string,
	): DomainError {
		return new DomainError(
			ErrorCode.VERSION_ALREADY_EXISTS,
			`Version ${version} already exists for @${namespace}/${name}`,
		);
	},

	corruptStorageData(key: string, reason: string): DomainError {
		return new DomainError(
			ErrorCode.CORRUPT_STORAGE_DATA,
			`Corrupt data at ${key}: ${reason}`,
		);
	},

	forbidden(action: string): DomainError {
		return new DomainError(ErrorCode.FORBIDDEN, `Forbidden: ${action}`);
	},

	invalidInput(field: string, reason: string): DomainError {
		return new DomainError(
			ErrorCode.INVALID_INPUT,
			`Invalid ${field}: ${reason}`,
		);
	},
} as const;
