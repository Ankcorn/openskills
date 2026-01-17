import { Result } from "better-result";
import type { SkillFrontmatter } from "../types/index.js";
import { skillFrontmatterSchema } from "../types/index.js";

/**
 * Result of parsing frontmatter from markdown content.
 */
export interface ParsedFrontmatter {
	frontmatter: SkillFrontmatter;
	body: string;
}

/**
 * Error codes for frontmatter parsing.
 */
export type FrontmatterErrorCode =
	| "MISSING_FRONTMATTER"
	| "INVALID_YAML"
	| "INVALID_FRONTMATTER";

/**
 * Error returned when frontmatter parsing fails.
 */
export interface FrontmatterError {
	code: FrontmatterErrorCode;
	message: string;
	details?: string;
}

/**
 * Parse YAML frontmatter from markdown content.
 *
 * Expects content in the format:
 * ```
 * ---
 * name: skill-name
 * description: A description
 * ---
 * # Body content
 * ```
 */
export function parseFrontmatter(
	content: string,
): Result<ParsedFrontmatter, FrontmatterError> {
	// Check for frontmatter delimiters
	if (!content.startsWith("---")) {
		return Result.err({
			code: "MISSING_FRONTMATTER",
			message: "Content must start with YAML frontmatter (---)",
		});
	}

	// Find the closing delimiter
	const endIndex = content.indexOf("\n---", 3);
	if (endIndex === -1) {
		return Result.err({
			code: "MISSING_FRONTMATTER",
			message: "Frontmatter must have a closing delimiter (---)",
		});
	}

	// Extract YAML content (between the delimiters)
	const yamlContent = content.slice(4, endIndex).trim();

	// Extract body (after the closing delimiter)
	const body = content.slice(endIndex + 4).trim();

	// Parse YAML manually (simple key-value parser for our use case)
	const parseResult = parseSimpleYaml(yamlContent);
	if (parseResult.isErr()) {
		return Result.err(parseResult.error);
	}

	// Validate against schema
	const validated = skillFrontmatterSchema.safeParse(parseResult.value);
	if (!validated.success) {
		return Result.err({
			code: "INVALID_FRONTMATTER",
			message: "Invalid frontmatter",
			details: validated.error.message,
		});
	}

	return Result.ok({
		frontmatter: validated.data,
		body,
	});
}

/**
 * Simple YAML parser for frontmatter.
 * Handles basic key-value pairs and nested objects (metadata).
 */
function parseSimpleYaml(
	yaml: string,
): Result<Record<string, unknown>, FrontmatterError> {
	const result: Record<string, unknown> = {};
	const lines = yaml.split("\n");

	let currentKey: string | null = null;
	let currentObject: Record<string, string> | null = null;

	for (const line of lines) {
		// Skip empty lines
		if (line.trim() === "") continue;

		// Check for nested key (indented with spaces)
		if (line.startsWith("  ") && currentKey !== null) {
			const nestedMatch = line.match(/^\s+([a-zA-Z0-9_-]+):\s*(.*)$/);
			if (nestedMatch) {
				if (currentObject === null) {
					currentObject = {};
				}
				const nestedKey = nestedMatch[1];
				const nestedValue = nestedMatch[2]?.trim() ?? "";
				if (nestedKey) {
					currentObject[nestedKey] = unquote(nestedValue);
				}
			}
			continue;
		}

		// Save any pending nested object
		if (currentKey !== null && currentObject !== null) {
			result[currentKey] = currentObject;
			currentObject = null;
		}

		// Parse top-level key-value
		const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
		if (!match) {
			return Result.err({
				code: "INVALID_YAML",
				message: `Invalid YAML syntax: ${line}`,
			});
		}

		const key = match[1];
		const value = match[2]?.trim() ?? "";

		if (!key) {
			return Result.err({
				code: "INVALID_YAML",
				message: `Invalid YAML key: ${line}`,
			});
		}

		currentKey = key;

		// If value is empty, expect nested object
		if (value === "") {
			currentObject = {};
		} else {
			result[key] = unquote(value);
			currentObject = null;
		}
	}

	// Save any final pending nested object
	if (currentKey !== null && currentObject !== null) {
		result[currentKey] = currentObject;
	}

	return Result.ok(result);
}

/**
 * Remove quotes from a YAML string value.
 */
function unquote(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

/**
 * Generate frontmatter template for creating a new skill.
 */
export function generateFrontmatterTemplate(
	name: string,
	description = "A brief description of what this skill does",
): string {
	return `---
name: ${name}
description: ${description}
license: MIT
compatibility: opencode
metadata:
  audience: engineers
  workflow: development
---

## What I do

- Describe the main capabilities of this skill
- Add specific guidance or best practices
- Include relevant context

## When to use me

Use this skill when...
`;
}
