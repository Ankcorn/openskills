import type { Identity } from "../../types/index.js";
import { Header, Layout } from "../layout.js";

interface EditSkillPageProps {
	namespace: string;
	name: string;
	currentVersion: string;
	currentContent: string;
	identity: Identity | null;
	error?: string;
	values?: {
		version?: string;
		content?: string;
	};
}

/**
 * Suggest the next version based on current version.
 * Returns [patch, minor, major] suggestions.
 */
function suggestNextVersions(current: string): {
	patch: string;
	minor: string;
	major: string;
} {
	const match = current.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		return { patch: "1.0.1", minor: "1.1.0", major: "2.0.0" };
	}
	const major = Number.parseInt(match[1] ?? "0", 10);
	const minor = Number.parseInt(match[2] ?? "0", 10);
	const patch = Number.parseInt(match[3] ?? "0", 10);

	return {
		patch: `${major}.${minor}.${patch + 1}`,
		minor: `${major}.${minor + 1}.0`,
		major: `${major + 1}.0.0`,
	};
}

export function EditSkillPage({
	namespace,
	name,
	currentVersion,
	currentContent,
	identity,
	error,
	values,
}: EditSkillPageProps) {
	const skillPath = `@${namespace}/${name}`;

	// If not authenticated, show login prompt
	if (!identity) {
		return (
			<Layout title={`Edit ${skillPath}`}>
				<Header showCreate={false} />
				<div class="border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-neutral-800 p-8 text-center">
					<h1 class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
						Authentication Required
					</h1>
					<p class="text-gray-600 dark:text-gray-300">
						You must be signed in to edit this skill.
					</p>
				</div>
			</Layout>
		);
	}

	// Check if user owns this namespace
	if (identity.namespace !== namespace) {
		return (
			<Layout title={`Edit ${skillPath}`}>
				<Header showCreate={false} />
				<div class="border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-neutral-800 p-8 text-center">
					<h1 class="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">
						Permission Denied
					</h1>
					<p class="text-gray-600 dark:text-gray-300">
						You can only edit skills in your own namespace (@
						{identity.namespace}).
					</p>
				</div>
			</Layout>
		);
	}

	const suggestions = suggestNextVersions(currentVersion);
	const defaultVersion = values?.version ?? suggestions.patch;
	const defaultContent = values?.content ?? currentContent;

	return (
		<Layout title={`Edit ${skillPath}`}>
			<Header showCreate={false} />

			<div class="mb-6">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
					Publish new version of{" "}
					<a
						href={`/@${namespace}/${name}`}
						class="hover:text-gray-700 dark:hover:text-gray-200"
					>
						{skillPath}
					</a>
				</h1>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					Current version: {currentVersion}
				</p>
			</div>

			{error && (
				<div class="mb-6 border-2 border-red-500 bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<form
				method="post"
				action={`/@${namespace}/${name}/edit`}
				class="space-y-6"
			>
				{/* Hidden fields */}
				<input type="hidden" name="namespace" value={namespace} />
				<input type="hidden" name="name" value={name} />

				{/* Version */}
				<div>
					<label class="label" for="version">
						New Version
					</label>
					<div class="flex gap-2">
						<input
							type="text"
							id="version"
							name="version"
							value={defaultVersion}
							required
							pattern="^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$"
							placeholder={suggestions.patch}
							class="input flex-1"
						/>
					</div>
					<div class="mt-2 flex gap-2">
						<span class="text-xs text-gray-500 dark:text-gray-400">
							Suggestions:
						</span>
						<button
							type="button"
							class="text-xs text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 underline"
							onclick={`document.getElementById('version').value='${suggestions.patch}'`}
						>
							{suggestions.patch} (patch)
						</button>
						<button
							type="button"
							class="text-xs text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 underline"
							onclick={`document.getElementById('version').value='${suggestions.minor}'`}
						>
							{suggestions.minor} (minor)
						</button>
						<button
							type="button"
							class="text-xs text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 underline"
							onclick={`document.getElementById('version').value='${suggestions.major}'`}
						>
							{suggestions.major} (major)
						</button>
					</div>
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
						rows={25}
						class="input font-mono text-sm"
					>
						{defaultContent}
					</textarea>
					<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
						Edit the skill content. The frontmatter name must remain "{name}".
					</p>
				</div>

				{/* Submit */}
				<div class="flex gap-4">
					<button type="submit" class="btn">
						Publish Version
					</button>
					<a href={`/@${namespace}/${name}`} class="btn-secondary">
						Cancel
					</a>
				</div>
			</form>
		</Layout>
	);
}
