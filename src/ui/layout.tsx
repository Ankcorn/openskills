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
			<body class="min-h-screen bg-gray-100">
				<div class="mx-auto max-w-4xl px-4 py-8">{children}</div>
				<script src="/client.js" type="module" />
			</body>
		</html>
	);
}

interface HeaderProps {
	showCreate?: boolean;
	isAuthenticated?: boolean;
}

export function Header({
	showCreate = true,
	isAuthenticated = false,
}: HeaderProps) {
	return (
		<header class="mb-8 flex items-center justify-between">
			<a href="/" class="text-2xl font-bold text-gray-900 hover:text-gray-700">
				openskills
			</a>
			{showCreate &&
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

export function SkillCard({
	namespace,
	name,
	version,
	downloads,
}: SkillCardProps) {
	return (
		<a href={`/@${namespace}/${name}`} class="skill-card">
			<span class="skill-card-title">
				@{namespace}/{name}
			</span>
			<span class="skill-card-meta">
				{version && <span>v{version}</span>}
				{version && downloads !== undefined && <span> · </span>}
				{downloads !== undefined && (
					<span>{downloads.toLocaleString()} downloads</span>
				)}
			</span>
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
			<h2 class="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
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
