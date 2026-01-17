import { type Core, makeCore } from "../src/core/index.js";
import { MemoryStorage } from "../src/storage/memory.js";
import type { Identity } from "../src/types/index.js";

/**
 * Create a Core instance with memory storage for testing.
 */
export function makeTestCore(options?: {
	getNow?: () => Date;
	maxSkillBytes?: number;
}): { core: Core; storage: MemoryStorage } {
	const storage = new MemoryStorage();
	const core = makeCore({
		storage,
		getNow: options?.getNow,
		maxSkillBytes: options?.maxSkillBytes,
	});
	return { core, storage };
}

/**
 * Create a minimal identity object for testing.
 */
export function makeIdentity(options: {
	namespace: string;
	email?: string;
}): Identity {
	return {
		namespace: options.namespace,
		email: options.email,
	};
}

/**
 * Generate valid skill content with frontmatter.
 */
export function makeSkillContent(
	name: string,
	body = "# Skill body",
	options?: {
		description?: string;
		license?: string;
		compatibility?: string;
		metadata?: Record<string, string>;
	},
): string {
	const description = options?.description ?? `A skill for ${name}`;
	const license = options?.license ?? "MIT";
	const compatibility = options?.compatibility ?? "opencode";

	let content = `---
name: ${name}
description: ${description}
license: ${license}
compatibility: ${compatibility}`;

	if (options?.metadata) {
		content += "\nmetadata:";
		for (const [key, value] of Object.entries(options.metadata)) {
			content += `\n  ${key}: ${value}`;
		}
	}

	content += `\n---\n\n${body}`;
	return content;
}

/**
 * Seed a skill by publishing it. Helper for test setup.
 * Automatically generates valid frontmatter if content doesn't have it.
 */
export async function seedSkill(
	core: Core,
	options: {
		namespace: string;
		name: string;
		version: string;
		content?: string;
	},
): Promise<void> {
	const identity = makeIdentity({ namespace: options.namespace });
	// If content is provided but doesn't have frontmatter, wrap it
	const content =
		options.content && options.content.startsWith("---")
			? options.content
			: makeSkillContent(options.name, options.content ?? `# ${options.name}`);

	const result = await core.publishSkill({
		namespace: options.namespace,
		name: options.name,
		version: options.version,
		content,
		identity,
	});
	if (result.isErr()) {
		throw new Error(`Failed to seed skill: ${result.error.message}`);
	}
}
