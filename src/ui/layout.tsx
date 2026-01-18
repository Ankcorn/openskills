import type { Child } from "hono/jsx";

interface LayoutProps {
	title?: string;
	children: Child;
}

export function Layout({ title, children }: LayoutProps) {
	const pageTitle = title ? `${title} | openskills` : "openskills";

	return (
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>{pageTitle}</title>
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link
					rel="preconnect"
					href="https://fonts.gstatic.com"
					crossorigin="anonymous"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap"
					rel="stylesheet"
				/>
				<link rel="stylesheet" href="/output.css" />
			</head>
			<body class="min-h-screen bg-gray-100 dark:bg-neutral-900">
				<div class="mx-auto max-w-4xl px-4 py-8">{children}</div>
				<script src="/client.js" type="module" />
			</body>
		</html>
	);
}

interface HeaderProps {
	showCreate?: boolean;
	isAuthenticated?: boolean;
	/** Custom action to show in header (replaces create button) */
	action?: Child;
}

export function Header({
	showCreate = true,
	isAuthenticated = false,
	action,
}: HeaderProps) {
	return (
		<header class="mb-8 flex items-center justify-between">
			<a
				href="/"
				class="text-2xl font-bold text-gray-900 hover:text-gray-700 dark:text-gray-100 dark:hover:text-gray-200"
			>
				openskills
			</a>
			{action
				? action
				: showCreate &&
					(isAuthenticated ? (
						<a href="/create" class="btn">
							create
						</a>
					) : (
						<a href="/login" class="btn">
							sign in
						</a>
					))}
		</header>
	);
}

interface SearchBoxProps {
	placeholder?: string;
	value?: string;
}

export function SearchBox({
	placeholder = "search for skills",
	value = "",
}: SearchBoxProps) {
	return (
		<form action="/search" method="get" class="mb-8">
			<input
				type="search"
				name="q"
				placeholder={placeholder}
				value={value}
				class="input"
				autocomplete="off"
			/>
		</form>
	);
}

interface SkillCardProps {
	namespace: string;
	name: string;
	version?: string;
	downloads?: number;
}

/**
 * Format view count for display.
 */
function formatViews(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	}
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`;
	}
	return count.toString();
}

export function SkillCard({
	namespace,
	name,
	version,
	downloads,
}: SkillCardProps) {
	return (
		<a href={`/@${namespace}/${name}`} class="skill-card">
			<div class="flex-1">
				<span class="skill-card-title">
					@{namespace}/{name}
				</span>
				{version && <span class="skill-card-meta">v{version}</span>}
			</div>
			{downloads !== undefined && downloads > 0 && (
				<span
					class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400"
					title="Views"
				>
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
		</a>
	);
}

interface SectionProps {
	title: string;
	children: Child;
}

export function Section({ title, children }: SectionProps) {
	return (
		<section class="mb-8">
			<h2 class="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
				{title}
			</h2>
			{children}
		</section>
	);
}

interface SkillListProps {
	children: Child;
}

export function SkillList({ children }: SkillListProps) {
	return <div class="flex flex-col gap-3">{children}</div>;
}
