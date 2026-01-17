import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Analytics } from "../analytics/index.js";
import type { Core } from "../core/core.js";
import { ErrorCode } from "../core/errors.js";
import {
	namespaceSchema,
	semverSchema,
	skillMetadataSchema,
	skillNameSchema,
	userProfileSchema,
} from "../types/index.js";
import {
	type AuthEnv,
	type AuthVariables,
	authMiddleware,
	requireAuth,
} from "./auth.js";

/**
 * Schema for namespace param that captures @namespace from URL path.
 * Strips the @ prefix and validates the namespace.
 */
const namespaceParamSchema = z
	.string()
	.transform((val) => (val.startsWith("@") ? val.slice(1) : val))
	.pipe(namespaceSchema);

/**
 * Environment bindings for the HTTP app
 */
export interface AppEnv {
	Bindings: AuthEnv;
	Variables: AuthVariables & {
		core: Core;
		analytics: Analytics;
	};
}

/**
 * App factory options
 */
export interface CreateAppOptions {
	coreFactory: (env: AuthEnv) => Core;
	analyticsFactory: (env: AuthEnv) => Analytics;
}

/**
 * Factory to create the HTTP app with the given core and analytics instances.
 */
export function createApp(options: CreateAppOptions) {
	const { coreFactory, analyticsFactory } = options;
	const app = new Hono<AppEnv>().basePath("/api/v1");

	// Inject core and analytics into context
	app.use("*", async (c, next) => {
		c.set("core", coreFactory(c.env));
		c.set("analytics", analyticsFactory(c.env));
		return next();
	});

	// Auth middleware for all routes (extracts identity if present)
	app.use("*", authMiddleware());

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
