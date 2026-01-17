import { Hono } from "hono";
import { marked } from "marked";
import type { Core } from "../core/core.js";
import type { Identity } from "../types/index.js";
import { CreateSkillPage } from "./pages/create.js";
import { EditSkillPage } from "./pages/edit.js";
import { HomePage } from "./pages/home.js";
import { NotFoundPage } from "./pages/not-found.js";
import { ProfilePage } from "./pages/profile.js";
import { SearchPage } from "./pages/search.js";
import { SkillPage } from "./pages/skill.js";

interface UIEnv {
	Variables: {
		core: Core;
		identity: Identity | null;
	};
}

/**
 * Create the UI routes app
 */
export function createUIRoutes() {
	const ui = new Hono<UIEnv>();

	// Home page
	ui.get("/", async (c) => {
		const core = c.get("core");
		const identity = c.get("identity");
		const skillsResult = await core.listSkills();

		const topSkills = skillsResult.isOk()
			? await Promise.all(
					skillsResult.value.slice(0, 10).map(async (skill) => {
						const meta = await core.getSkillMetadata(skill);
						return {
							namespace: skill.namespace,
							name: skill.name,
							version: meta.isOk()
								? (meta.value.latest ?? undefined)
								: undefined,
						};
					}),
				)
			: [];

		return c.html(
			<HomePage topSkills={topSkills} isAuthenticated={identity !== null} />,
		);
	});

	// Create skill page (GET)
	ui.get("/create", (c) => {
		const identity = c.get("identity");
		return c.html(<CreateSkillPage identity={identity} />);
	});

	// Create skill form handler (POST)
	ui.post("/create", async (c) => {
		const identity = c.get("identity");
		const core = c.get("core");

		if (!identity) {
			return c.html(<CreateSkillPage identity={null} />, 401);
		}

		const formData = await c.req.formData();
		const namespace = formData.get("namespace")?.toString() ?? "";
		const name = formData.get("name")?.toString() ?? "";
		const version = formData.get("version")?.toString() ?? "";
		const content = formData.get("content")?.toString() ?? "";

		// Validate namespace matches identity
		if (namespace !== identity.namespace) {
			return c.html(
				<CreateSkillPage
					identity={identity}
					error="You can only create skills in your own namespace."
					values={{ namespace, name, version, content }}
				/>,
				403,
			);
		}

		// Attempt to publish
		const result = await core.publishSkill({
			namespace,
			name,
			version,
			content,
			identity,
		});

		if (result.isErr()) {
			return c.html(
				<CreateSkillPage
					identity={identity}
					error={result.error.message}
					values={{ namespace, name, version, content }}
				/>,
				400,
			);
		}

		// Redirect to the new skill page
		return c.redirect(`/@${namespace}/${name}`);
	});

	// Search page
	ui.get("/search", async (c) => {
		const query = c.req.query("q") ?? "";
		const core = c.get("core");
		const identity = c.get("identity");

		// Simple search: list all skills and filter by name/namespace containing query
		const skillsResult = await core.listSkills();
		const allSkills = skillsResult.isOk() ? skillsResult.value : [];

		const lowerQuery = query.toLowerCase();
		const filteredSkills = allSkills.filter(
			(s) => s.namespace.includes(lowerQuery) || s.name.includes(lowerQuery),
		);

		const results = await Promise.all(
			filteredSkills.slice(0, 20).map(async (skill) => {
				const meta = await core.getSkillMetadata(skill);
				return {
					namespace: skill.namespace,
					name: skill.name,
					version: meta.isOk() ? (meta.value.latest ?? undefined) : undefined,
				};
			}),
		);

		return c.html(
			<SearchPage
				query={query}
				results={results}
				isAuthenticated={identity !== null}
			/>,
		);
	});

	// Edit skill page (GET): /:at/:name/edit
	ui.get("/:at/:name/edit", async (c) => {
		const at = c.req.param("at") ?? "";
		const name = c.req.param("name") ?? "";
		const namespace = at.startsWith("@") ? at.slice(1) : "";
		const identity = c.get("identity");
		const core = c.get("core");

		if (!namespace || !name) {
			return c.html(<NotFoundPage message="Invalid skill path." />, 404);
		}

		// Get latest version content
		const latestResult = await core.getSkillLatest({ namespace, name });
		if (latestResult.isErr()) {
			return c.html(
				<NotFoundPage message={`Skill @${namespace}/${name} not found.`} />,
				404,
			);
		}

		return c.html(
			<EditSkillPage
				namespace={namespace}
				name={name}
				currentVersion={latestResult.value.version}
				currentContent={latestResult.value.content}
				identity={identity}
			/>,
		);
	});

	// Edit skill form handler (POST): /:at/:name/edit
	ui.post("/:at/:name/edit", async (c) => {
		const at = c.req.param("at") ?? "";
		const paramName = c.req.param("name") ?? "";
		const namespace = at.startsWith("@") ? at.slice(1) : "";
		const identity = c.get("identity");
		const core = c.get("core");

		if (!namespace || !paramName) {
			return c.html(<NotFoundPage message="Invalid skill path." />, 404);
		}

		// Get current version for error display
		const latestResult = await core.getSkillLatest({
			namespace,
			name: paramName,
		});
		if (latestResult.isErr()) {
			return c.html(
				<NotFoundPage
					message={`Skill @${namespace}/${paramName} not found.`}
				/>,
				404,
			);
		}

		if (!identity) {
			return c.html(
				<EditSkillPage
					namespace={namespace}
					name={paramName}
					currentVersion={latestResult.value.version}
					currentContent={latestResult.value.content}
					identity={null}
				/>,
				401,
			);
		}

		const formData = await c.req.formData();
		const version = formData.get("version")?.toString() ?? "";
		const content = formData.get("content")?.toString() ?? "";

		// Attempt to publish
		const result = await core.publishSkill({
			namespace,
			name: paramName,
			version,
			content,
			identity,
		});

		if (result.isErr()) {
			return c.html(
				<EditSkillPage
					namespace={namespace}
					name={paramName}
					currentVersion={latestResult.value.version}
					currentContent={latestResult.value.content}
					identity={identity}
					error={result.error.message}
					values={{ version, content }}
				/>,
				400,
			);
		}

		// Redirect to the skill page
		return c.redirect(`/@${namespace}/${paramName}`);
	});

	// Skill version page: /:at/:name/versions/:version (most specific, must come first)
	// Using :at instead of @:namespace to work around Hono routing issues with @ in path params
	ui.get("/:at/:name/versions/:version", async (c) => {
		const at = c.req.param("at") ?? "";
		const name = c.req.param("name") ?? "";
		const version = c.req.param("version") ?? "";
		const namespace = at.startsWith("@") ? at.slice(1) : "";
		const core = c.get("core");
		const identity = c.get("identity");

		if (!namespace || !name || !version) {
			return c.html(<NotFoundPage message="Invalid skill path." />, 404);
		}

		// Get specific version
		const contentResult = await core.getSkillContent({
			namespace,
			name,
			version,
		});
		if (contentResult.isErr()) {
			return c.html(
				<NotFoundPage
					message={`Skill @${namespace}/${name}@${version} not found.`}
				/>,
				404,
			);
		}

		// Get all versions
		const versionsResult = await core.listVersions({ namespace, name });
		const versions = versionsResult.isOk() ? versionsResult.value : [];

		const content = contentResult.value.content;
		const contentHtml = await marked.parse(content);

		return c.html(
			<SkillPage
				namespace={namespace}
				name={name}
				version={version}
				content={content}
				contentHtml={contentHtml}
				versions={versions}
				identity={identity}
			/>,
		);
	});

	// Skill detail page: /:at/:name
	// Using :at instead of @:namespace to work around Hono routing issues with @ in path params
	ui.get("/:at/:name", async (c) => {
		const at = c.req.param("at") ?? "";
		const name = c.req.param("name") ?? "";
		// Only handle paths that start with @
		if (!at.startsWith("@")) {
			return c.notFound();
		}
		const namespace = at.slice(1);
		const core = c.get("core");
		const identity = c.get("identity");

		if (!namespace || !name) {
			return c.html(<NotFoundPage message="Invalid skill path." />, 404);
		}

		// Get latest version
		const latestResult = await core.getSkillLatest({ namespace, name });
		if (latestResult.isErr()) {
			return c.html(
				<NotFoundPage message={`Skill @${namespace}/${name} not found.`} />,
				404,
			);
		}

		// Get all versions
		const versionsResult = await core.listVersions({ namespace, name });
		const versions = versionsResult.isOk() ? versionsResult.value : [];

		const content = latestResult.value.content;
		const contentHtml = await marked.parse(content);

		return c.html(
			<SkillPage
				namespace={namespace}
				name={name}
				version={latestResult.value.version}
				content={content}
				contentHtml={contentHtml}
				versions={versions}
				identity={identity}
			/>,
		);
	});

	// Namespace profile page: /:at (least specific, must come last)
	// Using :at instead of @:namespace to work around Hono routing issues with @ in path params
	ui.get("/:at", async (c) => {
		const at = c.req.param("at") ?? "";
		// Only handle paths that start with @
		if (!at.startsWith("@")) {
			return c.notFound();
		}
		const namespace = at.slice(1);
		const core = c.get("core");
		const identity = c.get("identity");

		if (!namespace) {
			return c.html(<NotFoundPage message="Invalid namespace." />, 404);
		}

		// Get profile (optional)
		const profileResult = await core.getProfile(namespace);
		const profile = profileResult.isOk() ? profileResult.value : null;

		// Get skills in namespace
		const skillsResult = await core.listSkillsInNamespace(namespace);
		const skillNames = skillsResult.isOk() ? skillsResult.value : [];

		const skills = await Promise.all(
			skillNames.map(async (skillName) => {
				const meta = await core.getSkillMetadata({
					namespace,
					name: skillName,
				});
				return {
					name: skillName,
					version: meta.isOk() ? (meta.value.latest ?? undefined) : undefined,
				};
			}),
		);

		return c.html(
			<ProfilePage
				namespace={namespace}
				displayName={profile?.displayName}
				bio={profile?.bio}
				skills={skills}
				isAuthenticated={identity !== null}
			/>,
		);
	});

	// 404 fallback
	ui.notFound((c) => {
		return c.html(<NotFoundPage />, 404);
	});

	return ui;
}
