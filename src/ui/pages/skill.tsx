import type { Identity } from "../../types/index.js";
import { Header, Layout } from "../layout.js";

interface SkillPageProps {
	namespace: string;
	name: string;
	version: string;
	/** Skill description from frontmatter */
	description?: string;
	content: string;
	/** Pre-rendered HTML from markdown */
	contentHtml: string;
	versions: string[];
	/** Current user identity (for showing edit button) */
	identity?: Identity | null;
	/** Download count (from analytics) */
	downloads?: number;
}

export function SkillPage({
	namespace,
	name,
	version,
	description,
	content,
	contentHtml,
	versions,
	identity,
	downloads,
}: SkillPageProps) {
	const fullPath = `@${namespace}/${name}@${version}`;
	const canEdit = identity?.namespace === namespace;

	// Format view count
	const formatViews = (count: number): string => {
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		}
		if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	};

	// Header action buttons
	const headerAction = (
		<div class="flex gap-2">
			{canEdit && (
				<a href={`/@${namespace}/${name}/edit`} class="btn">
					new version
				</a>
			)}
			<button
				type="button"
				class="btn copy-btn"
				data-copy-target="skill-content"
				data-copy-text={content}
			>
				<span class="copy-label">copy</span>
				<span class="copy-success hidden">copied!</span>
			</button>
		</div>
	);

	return (
		<Layout title={fullPath}>
			<Header action={headerAction} />

			{/* Skill header */}
			<div class="mb-6">
				<h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
					<a
						href={`/@${namespace}`}
						class="hover:text-gray-700 dark:hover:text-gray-200"
					>
						@{namespace}
					</a>
					<span class="text-gray-400 dark:text-gray-500">/</span>
					{name}
				</h1>
				<div class="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
					<span>v{version}</span>
					{downloads !== undefined && downloads > 0 && (
						<span class="flex items-center gap-1" title="Views">
							<svg
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/>
							</svg>
							{formatViews(downloads)}
						</span>
					)}
				</div>
				{description && (
					<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
						{description}
					</p>
				)}
			</div>

			{/* Version selector - show last 3 versions */}
			{versions.length > 1 && (
				<div class="mb-6">
					<span class="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
						Version
					</span>
					<div class="mt-2 flex flex-wrap gap-2">
						{versions.slice(-3).map((v) => (
							<a
								href={`/@${namespace}/${name}/versions/${v}`}
								class={`px-3 py-1 text-sm border-2 border-gray-900 dark:border-gray-100 transition-colors ${
									v === version
										? "bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-neutral-900"
										: "bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-neutral-800 dark:text-gray-100 dark:hover:bg-neutral-700"
								}`}
							>
								{v}
							</a>
						))}
					</div>
				</div>
			)}

			{/* Markdown content */}
			<article
				id="skill-content"
				class="prose-skills border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-neutral-800 p-6"
				dangerouslySetInnerHTML={{ __html: contentHtml }}
			/>

			{/* Raw content for copying (hidden) */}
			<pre id="skill-raw" class="hidden">
				{content}
			</pre>
		</Layout>
	);
}
