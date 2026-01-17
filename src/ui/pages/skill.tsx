import type { Identity } from "../../types/index.js";
import { Header, Layout } from "../layout.js";

interface SkillPageProps {
	namespace: string;
	name: string;
	version: string;
	content: string;
	/** Pre-rendered HTML from markdown */
	contentHtml: string;
	versions: string[];
	/** Current user identity (for showing edit button) */
	identity?: Identity | null;
}

export function SkillPage({
	namespace,
	name,
	version,
	content,
	contentHtml,
	versions,
	identity,
}: SkillPageProps) {
	const skillPath = `@${namespace}/${name}`;
	const fullPath = `${skillPath}@${version}`;
	const canEdit = identity?.namespace === namespace;

	return (
		<Layout title={fullPath}>
			<Header />

			{/* Skill header */}
			<div class="mb-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold text-gray-900">
							<a href={`/@${namespace}`} class="hover:text-gray-700">
								@{namespace}
							</a>
							<span class="text-gray-400">/</span>
							{name}
						</h1>
						<p class="mt-1 text-sm text-gray-500">v{version}</p>
					</div>

					{/* Action buttons */}
					<div class="flex gap-2">
						{canEdit && (
							<a href={`/@${namespace}/${name}/edit`} class="btn-secondary">
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
				</div>
			</div>

			{/* Version selector */}
			{versions.length > 1 && (
				<div class="mb-6">
					<span class="text-xs font-bold uppercase tracking-wider text-gray-500">
						Version
					</span>
					<div class="mt-2 flex flex-wrap gap-2">
						{versions.map((v) => (
							<a
								href={`/@${namespace}/${name}/versions/${v}`}
								class={`px-3 py-1 text-sm border-2 border-gray-900 transition-colors ${
									v === version
										? "bg-gray-900 text-gray-100"
										: "bg-gray-100 text-gray-900 hover:bg-gray-200"
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
				class="prose-skills border-2 border-gray-900 bg-white p-6"
				dangerouslySetInnerHTML={{ __html: contentHtml }}
			/>

			{/* Raw content for copying (hidden) */}
			<pre id="skill-raw" class="hidden">
				{content}
			</pre>
		</Layout>
	);
}
