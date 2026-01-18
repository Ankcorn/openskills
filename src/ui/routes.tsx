import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { marked } from "marked";
import {
	createToken,
	deriveNamespace,
	exchangeCodeForToken,
	fetchGitHubUser,
	getGitHubAuthURL,
} from "../auth/github.js";
import { COOKIE_NAMES, getCookieSettings } from "../auth/interface.js";
import { authLog, maskEmail } from "../auth/logger.js";
import type { Core } from "../core/core.js";
import type { Identity } from "../types/index.js";
import { Layout } from "./layout.js";
import { CreateSkillPage } from "./pages/create.js";
import { EditSkillPage } from "./pages/edit.js";
import { HomePage } from "./pages/home.js";
import { NotFoundPage } from "./pages/not-found.js";
import { ProfilePage } from "./pages/profile.js";
import { SearchPage } from "./pages/search.js";
import { SkillPage } from "./pages/skill.js";

/**
 * Environment for UI routes.
 */
export interface UIEnv {
	Bindings: {
		GITHUB_CLIENT_ID?: string;
		GITHUB_CLIENT_SECRET?: string;
		AUTH_KV?: KVNamespace;
	};
	Variables: {
		core: Core;
		identity: Identity | null;
	};
}

/**
 * Simple login page
 */
function LoginPage({ githubUrl }: { githubUrl: string }) {
	return (
		<Layout title="Sign In">
			<div class="max-w-md mx-auto mt-16 p-6 text-center">
				<h1 class="text-2xl font-bold text-gray-800 mb-4">Sign In</h1>
				<p class="text-gray-600 mb-6">Sign in to create and manage skills.</p>
				<a
					href={githubUrl}
					class="inline-block px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium"
				>
					Sign in with GitHub
				</a>
			</div>
		</Layout>
	);
}

/**
 * Logout confirmation page
 */
function LogoutPage() {
	return (
		<Layout title="Signed Out">
			<div class="max-w-md mx-auto mt-16 p-6 text-center">
				<h1 class="text-2xl font-bold text-gray-800 mb-4">Signed Out</h1>
				<p class="text-gray-600 mb-6">You have been signed out successfully.</p>
				<a
					href="/"
					class="inline-block px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
				>
					Return Home
				</a>
			</div>
		</Layout>
	);
}

/**
 * Auth error page
 */
function AuthErrorPage({ error }: { error: string }) {
	return (
		<Layout title="Authentication Error">
			<div class="max-w-md mx-auto mt-16 p-6">
				<h1 class="text-2xl font-bold text-red-600 mb-4">
					Authentication Failed
				</h1>
				<p class="text-gray-700 mb-6">{error}</p>
				<a
					href="/"
					class="inline-block px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
				>
					Return Home
				</a>
			</div>
		</Layout>
	);
}

/**
 * Create the UI routes app
 */
export function createUIRoutes() {
	const ui = new Hono<UIEnv>();

	// --------------------------------------------------------------------------
	// Auth routes - Simple GitHub OAuth
	// --------------------------------------------------------------------------

	// Login page - redirects to GitHub
	ui.get("/login", (c) => {
		const returnUrl = c.req.query("return") ?? "/";
		const clientId = c.env.GITHUB_CLIENT_ID;

		authLog.info`[AUTH:FLOW] Login page requested, return=${returnUrl}`;

		if (!clientId) {
			authLog.error`[AUTH:FLOW] Login failed: GITHUB_CLIENT_ID not configured`;
			return c.html(<AuthErrorPage error="GitHub OAuth not configured" />, 500);
		}

		const url = new URL(c.req.url);
		const origin = `${url.protocol}//${url.host}`;
		const redirectUri = `${origin}/callback`;

		const githubUrl = getGitHubAuthURL({
			clientId,
			redirectUri,
			state: returnUrl,
		});

		authLog.debug`[AUTH:FLOW] Showing GitHub login page`;
		return c.html(<LoginPage githubUrl={githubUrl} />);
	});

	// OAuth callback - exchange code for token, create JWT, set cookie
	ui.get("/callback", async (c) => {
		const code = c.req.query("code");
		const state = c.req.query("state") ?? "/";
		const error = c.req.query("error");
		const errorDescription = c.req.query("error_description");

		authLog.info`[AUTH:FLOW] OAuth callback received, return=${state}`;

		if (error) {
			const msg = errorDescription ?? error;
			authLog.error`[AUTH:FLOW] GitHub OAuth error: ${msg}`;
			return c.html(<AuthErrorPage error={msg} />, 400);
		}

		if (!code) {
			authLog.error`[AUTH:FLOW] No authorization code in callback`;
			return c.html(
				<AuthErrorPage error="No authorization code received" />,
				400,
			);
		}

		const clientId = c.env.GITHUB_CLIENT_ID;
		const clientSecret = c.env.GITHUB_CLIENT_SECRET;
		const kv = c.env.AUTH_KV;

		if (!clientId || !clientSecret || !kv) {
			authLog.error`[AUTH:FLOW] GitHub OAuth not configured in callback`;
			return c.html(<AuthErrorPage error="GitHub OAuth not configured" />, 500);
		}

		const url = new URL(c.req.url);
		const origin = `${url.protocol}//${url.host}`;
		const redirectUri = `${origin}/callback`;

		// Exchange code for GitHub access token
		authLog.debug`[AUTH:FLOW] Exchanging OAuth code for access token`;
		const tokenResult = await exchangeCodeForToken({
			clientId,
			clientSecret,
			code,
			redirectUri,
		});

		if (tokenResult.isErr()) {
			authLog.error`[AUTH:FLOW] Token exchange failed: ${tokenResult.error.message}`;
			return c.html(<AuthErrorPage error={tokenResult.error.message} />, 400);
		}

		// Fetch GitHub user profile
		authLog.debug`[AUTH:FLOW] Fetching GitHub user profile`;
		const userResult = await fetchGitHubUser(tokenResult.value.access_token);

		if (userResult.isErr()) {
			authLog.error`[AUTH:FLOW] User profile fetch failed: ${userResult.error.message}`;
			return c.html(<AuthErrorPage error={userResult.error.message} />, 400);
		}

		// Create our JWT
		const namespace = deriveNamespace(userResult.value.login);
		authLog.info`[AUTH:FLOW] Creating JWT for login=${userResult.value.login}, namespace=${namespace}, email=${maskEmail(userResult.value.email)}`;

		const jwtResult = await createToken({
			kv,
			namespace,
			email: userResult.value.email,
			issuer: origin,
		});

		if (jwtResult.isErr()) {
			authLog.error`[AUTH:FLOW] JWT creation failed for namespace=${namespace}`;
			return c.html(
				<AuthErrorPage error="Failed to create authentication token" />,
				500,
			);
		}

		// Set cookie
		const isSecure =
			c.req.header("x-forwarded-proto") === "https" ||
			c.req.url.startsWith("https://");

		const cookieSettings = getCookieSettings(isSecure);

		setCookie(c, COOKIE_NAMES.ACCESS, jwtResult.value, {
			...cookieSettings,
			maxAge: 60 * 60 * 24 * 30, // 30 days
		});

		authLog.info`[AUTH:FLOW] Login successful: namespace=${namespace}, email=${maskEmail(userResult.value.email)}, redirecting to ${state}`;
		// Redirect to return URL
		return c.redirect(state);
	});

	// Logout - clear cookies
	ui.get("/logout", (c) => {
		const identity = c.get("identity");
		authLog.info`[AUTH:FLOW] Logout requested: namespace=${identity?.namespace ?? "(anonymous)"}`;

		const isSecure =
			c.req.header("x-forwarded-proto") === "https" ||
			c.req.url.startsWith("https://");

		const cookieSettings = getCookieSettings(isSecure);

		deleteCookie(c, COOKIE_NAMES.ACCESS, cookieSettings);

		authLog.info`[AUTH:FLOW] Logout successful: namespace=${identity?.namespace ?? "(anonymous)"}`;
		return c.html(<LogoutPage />);
	});

	ui.post("/logout", (c) => {
		const identity = c.get("identity");
		authLog.info`[AUTH:FLOW] POST logout requested: namespace=${identity?.namespace ?? "(anonymous)"}`;

		const isSecure =
			c.req.header("x-forwarded-proto") === "https" ||
			c.req.url.startsWith("https://");

		const cookieSettings = getCookieSettings(isSecure);

		deleteCookie(c, COOKIE_NAMES.ACCESS, cookieSettings);

		authLog.info`[AUTH:FLOW] POST logout successful: namespace=${identity?.namespace ?? "(anonymous)"}`;
		return c.redirect("/");
	});

	// --------------------------------------------------------------------------
	// Main UI routes
	// --------------------------------------------------------------------------

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
