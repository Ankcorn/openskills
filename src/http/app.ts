import { Hono } from "hono";
import {
	describeRoute,
	generateSpecs,
	resolver,
	validator,
} from "hono-openapi";
import { z } from "zod";
import type { Analytics } from "../analytics/index.js";
import type {
	Auth,
	AuthEnv,
	AuthFactory,
	AuthVariables,
} from "../auth/interface.js";
import type { Core } from "../core/core.js";
import { ErrorCode } from "../core/errors.js";
import {
	namespaceSchema,
	semverSchema,
	skillMetadataSchema,
	skillNameSchema,
	userProfileSchema,
} from "../types/index.js";

/**
 * OpenAPI document configuration
 */
const openAPIConfig = {
	documentation: {
		info: {
			title: "OpenSkills API",
			version: "1.0.0",
			description:
				"API for publishing and retrieving skills (markdown documents with semantic versioning)",
		},
		servers: [
			{
				url: "/api/v1",
				description: "API v1",
			},
		],
		tags: [
			{
				name: "skills",
				description: "Skill operations",
			},
			{
				name: "users",
				description: "User profile operations",
			},
		],
	},
};

/**
 * Schema for namespace param that captures @namespace from URL path.
 * Strips the @ prefix and validates the namespace.
 */
const namespaceParamSchema = z
	.string()
	.transform((val) => (val.startsWith("@") ? val.slice(1) : val))
	.pipe(namespaceSchema);

/**
 * Extended variables for the HTTP app context.
 * Includes auth identity plus core and analytics instances.
 */
export interface AppVariables extends AuthVariables {
	core: Core;
	analytics: Analytics;
	auth: Auth<AuthEnv, AuthVariables>;
}

/**
 * Environment bindings for the HTTP app
 */
export interface AppEnv {
	Bindings: AuthEnv;
	Variables: AppVariables;
}

/**
 * App factory options.
 * Accepts factories for core, analytics, and auth.
 */
export interface CreateAppOptions {
	coreFactory: (env: AuthEnv) => Core;
	analyticsFactory: (env: AuthEnv) => Analytics;
	authFactory: AuthFactory<AuthEnv, AuthVariables>;
}

/**
 * Full app factory options.
 * Extends CreateAppOptions with UI routes factory.
 */
export interface CreateFullAppOptions extends CreateAppOptions {
	/** Factory to create UI routes (optional) */
	// biome-ignore lint/suspicious/noExplicitAny: UI routes have flexible bindings
	uiRoutesFactory?: () => Hono<any>;
}

/**
 * Helper middleware that requires authentication.
 * Gets the auth instance from context and applies its requireAuth middleware.
 */
function requireAuth(): import("hono").MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const auth = c.get("auth");
		// Call requireAuth - use type assertion since AppEnv extends Auth's expected env
		return auth.requireAuth(
			c as unknown as Parameters<typeof auth.requireAuth>[0],
			next,
		);
	};
}

/**
 * Factory to create the HTTP app with the given core, analytics, and auth instances.
 */
export function createApp(options: CreateAppOptions) {
	const { coreFactory, analyticsFactory, authFactory } = options;
	const app = new Hono<AppEnv>().basePath("/api/v1");

	// Inject core, analytics, and auth into context
	app.use("*", async (c, next) => {
		const auth = authFactory(c.env);
		c.set("core", coreFactory(c.env));
		c.set("analytics", analyticsFactory(c.env));
		c.set("auth", auth);
		return next();
	});

	// Auth middleware for all routes (extracts identity if present)
	// We apply the middleware after auth is set on context
	app.use("*", async (c, next) => {
		const auth = c.get("auth");
		// Call middleware - it will set c.var.identity
		// Use type assertion since our AppEnv extends the Auth's expected env
		return auth.middleware(
			c as unknown as Parameters<typeof auth.middleware>[0],
			next,
		);
	});

	// =========================================================================
	// Skills Routes (Read)
	// =========================================================================

	// GET /skills - List all skills
	app.get(
		"/skills",
		describeRoute({
			description: "List all skills across all namespaces",
			tags: ["skills"],
			responses: {
				200: {
					description: "List of skills",
					content: {
						"application/json": {
							schema: resolver(
								z.object({
									skills: z.array(
										z.object({
											namespace: namespaceSchema,
											name: skillNameSchema,
										}),
									),
								}),
							),
						},
					},
				},
			},
		}),
		async (c) => {
			const core = c.get("core");
			const result = await core.listSkills();

			if (result.isErr()) {
				return c.json({ error: result.error.message }, 500);
			}

			return c.json({ skills: result.value });
		},
	);

	// GET /skills/:namespace - List skills in namespace (namespace includes @ prefix in URL)
	app.get(
		"/skills/:namespace",
		describeRoute({
			description: "List all skills in a namespace",
			tags: ["skills"],
			responses: {
				200: {
					description: "List of skill names in namespace",
					content: {
						"application/json": {
							schema: resolver(
								z.object({
									namespace: namespaceSchema,
									skills: z.array(skillNameSchema),
								}),
							),
						},
					},
				},
			},
		}),
		validator("param", z.object({ namespace: namespaceParamSchema })),
		async (c) => {
			const { namespace } = c.req.valid("param");
			const core = c.get("core");
			const result = await core.listSkillsInNamespace(namespace);

			if (result.isErr()) {
				return c.json({ error: result.error.message }, 500);
			}

			return c.json({ namespace, skills: result.value });
		},
	);

	// GET /skills/:namespace/:name - Get skill metadata
	app.get(
		"/skills/:namespace/:name",
		describeRoute({
			description: "Get skill metadata",
			tags: ["skills"],
			responses: {
				200: {
					description: "Skill metadata",
					content: {
						"application/json": {
							schema: resolver(skillMetadataSchema),
						},
					},
				},
				404: {
					description: "Skill not found",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
			},
		}),
		validator(
			"param",
			z.object({ namespace: namespaceParamSchema, name: skillNameSchema }),
		),
		async (c) => {
			const { namespace, name } = c.req.valid("param");
			const core = c.get("core");
			const result = await core.getSkillMetadata({ namespace, name });

			if (result.isErr()) {
				if (result.error.code === ErrorCode.NOT_FOUND) {
					return c.json({ error: result.error.message }, 404);
				}
				return c.json({ error: result.error.message }, 500);
			}

			return c.json(result.value);
		},
	);

	// GET /skills/:namespace/:name/versions - List versions
	app.get(
		"/skills/:namespace/:name/versions",
		describeRoute({
			description: "List all versions of a skill",
			tags: ["skills"],
			responses: {
				200: {
					description: "List of versions",
					content: {
						"application/json": {
							schema: resolver(
								z.object({
									namespace: namespaceSchema,
									name: skillNameSchema,
									versions: z.array(semverSchema),
								}),
							),
						},
					},
				},
			},
		}),
		validator(
			"param",
			z.object({ namespace: namespaceParamSchema, name: skillNameSchema }),
		),
		async (c) => {
			const { namespace, name } = c.req.valid("param");
			const core = c.get("core");
			const result = await core.listVersions({ namespace, name });

			if (result.isErr()) {
				return c.json({ error: result.error.message }, 500);
			}

			return c.json({ namespace, name, versions: result.value });
		},
	);

	// GET /skills/:namespace/:name/versions/:version - Get specific version content
	app.get(
		"/skills/:namespace/:name/versions/:version",
		describeRoute({
			description: "Get specific version content",
			tags: ["skills"],
			responses: {
				200: {
					description: "Skill content",
					content: {
						"text/markdown": {
							schema: resolver(z.string()),
						},
					},
				},
				404: {
					description: "Skill or version not found",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
			},
		}),
		validator(
			"param",
			z.object({
				namespace: namespaceParamSchema,
				name: skillNameSchema,
				version: semverSchema,
			}),
		),
		async (c) => {
			const { namespace, name, version } = c.req.valid("param");
			const core = c.get("core");
			const analytics = c.get("analytics");
			const result = await core.getSkillContent({ namespace, name, version });

			if (result.isErr()) {
				if (result.error.code === ErrorCode.NOT_FOUND) {
					return c.json({ error: result.error.message }, 404);
				}
				return c.json({ error: result.error.message }, 500);
			}

			// Track download
			analytics.trackDownload({
				namespaceId: result.value.namespaceId,
				skillId: result.value.skillId,
				namespace,
				skillName: name,
				version,
				route: "versions",
				bytes: new TextEncoder().encode(result.value.content).length,
				requestId: c.req.header("cf-ray"),
			});

			return c.text(result.value.content, 200, {
				"Content-Type": "text/markdown; charset=utf-8",
			});
		},
	);

	// GET /skills/:namespace/:name/latest - Get latest version content
	app.get(
		"/skills/:namespace/:name/latest",
		describeRoute({
			description: "Get latest version content",
			tags: ["skills"],
			responses: {
				200: {
					description: "Skill content with version header",
					content: {
						"text/markdown": {
							schema: resolver(z.string()),
						},
					},
				},
				404: {
					description: "Skill not found",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
			},
		}),
		validator(
			"param",
			z.object({ namespace: namespaceParamSchema, name: skillNameSchema }),
		),
		async (c) => {
			const { namespace, name } = c.req.valid("param");
			const core = c.get("core");
			const analytics = c.get("analytics");
			const result = await core.getSkillLatest({ namespace, name });

			if (result.isErr()) {
				if (result.error.code === ErrorCode.NOT_FOUND) {
					return c.json({ error: result.error.message }, 404);
				}
				return c.json({ error: result.error.message }, 500);
			}

			// Track download
			analytics.trackDownload({
				namespaceId: result.value.namespaceId,
				skillId: result.value.skillId,
				namespace,
				skillName: name,
				version: result.value.version,
				route: "latest",
				bytes: new TextEncoder().encode(result.value.content).length,
				requestId: c.req.header("cf-ray"),
			});

			return c.text(result.value.content, 200, {
				"Content-Type": "text/markdown; charset=utf-8",
				"X-Skill-Version": result.value.version,
			});
		},
	);

	// =========================================================================
	// Skills Routes (Write - Auth Required)
	// =========================================================================

	// PUT /skills/:namespace/:name/versions/:version - Publish new version
	app.put(
		"/skills/:namespace/:name/versions/:version",
		describeRoute({
			description: "Publish a new skill version",
			tags: ["skills"],
			responses: {
				201: {
					description: "Version published successfully",
					content: {
						"application/json": {
							schema: resolver(
								z.object({
									namespace: namespaceSchema,
									name: skillNameSchema,
									version: semverSchema,
									size: z.number(),
									checksum: z.string(),
								}),
							),
						},
					},
				},
				401: {
					description: "Authentication required",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
				403: {
					description: "Forbidden - cannot publish to this namespace",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
				409: {
					description: "Version already exists",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
			},
		}),
		requireAuth(),
		validator(
			"param",
			z.object({
				namespace: namespaceParamSchema,
				name: skillNameSchema,
				version: semverSchema,
			}),
		),
		async (c) => {
			const { namespace, name, version } = c.req.valid("param");
			const identity = c.get("identity");
			const core = c.get("core");

			// Identity is guaranteed by requireAuth
			if (!identity) {
				return c.json({ error: "Authentication required" }, 401);
			}

			// Read content from body
			const content = await c.req.text();

			const result = await core.publishSkill({
				namespace,
				name,
				version,
				content,
				identity,
			});

			if (result.isErr()) {
				switch (result.error.code) {
					case ErrorCode.FORBIDDEN:
						return c.json({ error: result.error.message }, 403);
					case ErrorCode.VERSION_ALREADY_EXISTS:
						return c.json({ error: result.error.message }, 409);
					case ErrorCode.INVALID_INPUT:
						return c.json({ error: result.error.message }, 400);
					default:
						return c.json({ error: result.error.message }, 500);
				}
			}

			return c.json(result.value, 201);
		},
	);

	// =========================================================================
	// User Profile Routes
	// =========================================================================

	// GET /users/:namespace - Get profile
	app.get(
		"/users/:namespace",
		describeRoute({
			description: "Get a namespace profile",
			tags: ["users"],
			responses: {
				200: {
					description: "User profile",
					content: {
						"application/json": {
							schema: resolver(userProfileSchema),
						},
					},
				},
				404: {
					description: "Profile not found",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
			},
		}),
		validator("param", z.object({ namespace: namespaceParamSchema })),
		async (c) => {
			const { namespace } = c.req.valid("param");
			const core = c.get("core");
			const result = await core.getProfile(namespace);

			if (result.isErr()) {
				if (result.error.code === ErrorCode.NOT_FOUND) {
					return c.json({ error: result.error.message }, 404);
				}
				return c.json({ error: result.error.message }, 500);
			}

			return c.json(result.value);
		},
	);

	// PUT /users/:namespace - Update profile (auth required, must match caller)
	const profileUpdateSchema = z.object({
		displayName: z.string().max(100).optional(),
		bio: z.string().max(500).optional(),
		website: z.string().url().optional(),
	});

	app.put(
		"/users/:namespace",
		describeRoute({
			description: "Update the caller's own profile",
			tags: ["users"],
			responses: {
				200: {
					description: "Updated profile",
					content: {
						"application/json": {
							schema: resolver(userProfileSchema),
						},
					},
				},
				401: {
					description: "Authentication required",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
				403: {
					description: "Forbidden - can only update own profile",
					content: {
						"application/json": {
							schema: resolver(z.object({ error: z.string() })),
						},
					},
				},
			},
		}),
		requireAuth(),
		validator("param", z.object({ namespace: namespaceParamSchema })),
		validator("json", profileUpdateSchema),
		async (c) => {
			const { namespace } = c.req.valid("param");
			const profile = c.req.valid("json");
			const identity = c.get("identity");
			const core = c.get("core");

			// Identity is guaranteed by requireAuth
			if (!identity) {
				return c.json({ error: "Authentication required" }, 401);
			}

			const result = await core.updateProfile({
				namespace,
				profile,
				identity,
			});

			if (result.isErr()) {
				if (result.error.code === ErrorCode.FORBIDDEN) {
					return c.json({ error: result.error.message }, 403);
				}
				return c.json({ error: result.error.message }, 500);
			}

			return c.json(result.value);
		},
	);

	return app;
}

/**
 * Create the full application with API and optional UI.
 *
 * This composes:
 * - API routes at /api/v1/* (includes OpenAPI endpoint)
 * - UI routes at /* (if uiRoutesFactory is provided, includes auth routes)
 *
 * @param options - Factory options for core, analytics, auth, and UI
 * @returns Complete Hono app ready to be exported as the worker
 */
export function createFullApp(options: CreateFullAppOptions) {
	const { coreFactory, analyticsFactory, authFactory, uiRoutesFactory } =
		options;

	// Create the API app (at /api/v1) and add OpenAPI endpoint
	const apiApp = createApp({ coreFactory, analyticsFactory, authFactory });

	// Add OpenAPI endpoint to the API app
	apiApp.get("/openapi", async (c) => {
		const spec = await generateSpecs(apiApp, openAPIConfig);
		return c.json(spec);
	});

	// Create the root app that combines everything
	const app = new Hono<AppEnv>();

	// Auth middleware to extract identity from requests
	app.use("*", async (c, next) => {
		const auth = authFactory(c.env);
		c.set("auth", auth);
		return auth.middleware(
			c as unknown as Parameters<typeof auth.middleware>[0],
			next,
		);
	});

	// Inject core into context
	app.use("*", async (c, next) => {
		c.set("core", coreFactory(c.env));
		c.set("analytics", analyticsFactory(c.env));
		return next();
	});

	// Mount UI routes at root if provided (includes auth routes like /login, /callback)
	if (uiRoutesFactory) {
		const uiRoutes = uiRoutesFactory();
		app.route("/", uiRoutes);
	}

	// Mount API routes (already has /api/v1 basePath)
	app.route("/", apiApp);

	return app;
}
