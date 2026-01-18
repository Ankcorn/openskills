import { generateFrontmatterTemplate } from "../../core/frontmatter.js";
import type { Identity } from "../../types/index.js";
import { Header, Layout } from "../layout.js";

interface CreateSkillPageProps {
	identity: Identity | null;
	error?: string;
	values?: {
		namespace?: string;
		name?: string;
		version?: string;
		content?: string;
	};
}

export function CreateSkillPage({
	identity,
	error,
	values,
}: CreateSkillPageProps) {
	// If not authenticated, show login prompt
	if (!identity) {
		return (
			<Layout title="Create Skill">
				<Header showCreate={false} />
				<div class="border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-neutral-800 p-8 text-center">
					<h1 class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
						Authentication Required
					</h1>
					<p class="text-gray-600 dark:text-gray-300">
						You must be signed in to create a skill.
					</p>
				</div>
			</Layout>
		);
	}

	const defaultNamespace = values?.namespace ?? identity.namespace;
	const defaultName = values?.name ?? "";
	const defaultVersion = values?.version ?? "1.0.0";
	// Always provide a template - use entered name or placeholder "my-skill"
	const defaultContent =
		values?.content ?? generateFrontmatterTemplate(defaultName || "my-skill");

	return (
		<Layout title="Create Skill">
			<Header showCreate={false} />

			<div class="mb-6">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
					Create a new skill
				</h1>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Skills are versioned markdown files with YAML frontmatter.
				</p>
			</div>

			{error && (
				<div class="mb-6 border-2 border-red-500 bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<form method="post" action="/create" class="space-y-6">
				{/* Namespace (read-only, from identity) */}
				<div>
					<label class="label" for="namespace">
						Namespace
					</label>
					<input
						type="text"
						id="namespace"
						name="namespace"
						value={defaultNamespace}
						readonly
						class="input opacity-70"
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Skills are published under your namespace.
					</p>
				</div>

				{/* Skill Name */}
				<div>
					<label class="label" for="name">
						Skill Name
					</label>
					<input
						type="text"
						id="name"
						name="name"
						value={defaultName}
						required
						pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
						placeholder="my-skill"
						class="input"
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Lowercase letters, numbers, and hyphens only. Example:
						docker-compose
					</p>
				</div>

				{/* Version */}
				<div>
					<label class="label" for="version">
						Version
					</label>
					<input
						type="text"
						id="version"
						name="version"
						value={defaultVersion}
						required
						pattern="^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$"
						placeholder="1.0.0"
						class="input"
					/>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Semantic version (e.g., 1.0.0, 2.1.0-beta.1)
					</p>
				</div>

				{/* Content */}
				<div>
					<label class="label" for="content">
						Content
					</label>
					<textarea
						id="content"
						name="content"
						required
						rows={20}
						class="input font-mono text-sm"
					>
						{defaultContent}
					</textarea>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Markdown with YAML frontmatter. The name field must match the skill
						name above.
					</p>
				</div>

				{/* Submit */}
				<div class="flex gap-4">
					<button type="submit" class="btn">
						Publish Skill
					</button>
					<a href="/" class="btn-secondary">
						Cancel
					</a>
				</div>
			</form>

			{/* Client-side script for auto-updating frontmatter */}
			<script
				dangerouslySetInnerHTML={{
					__html: `
					document.getElementById('name').addEventListener('input', function(e) {
						const content = document.getElementById('content');
						const name = e.target.value;
						// Update frontmatter name if content looks like default template
						if (content.value.includes('name: my-skill') || content.value.includes('name: ' + name.replace(/-/g, ''))) {
							content.value = content.value.replace(/name: [a-z0-9-]*/, 'name: ' + name);
						}
					});
				`,
				}}
			/>
		</Layout>
	);
}
