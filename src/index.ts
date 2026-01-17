import { Hono } from "hono";
import { makeAnalytics } from "./analytics/index.js";
import type { Core } from "./core/core.js";
import { makeCore } from "./core/core.js";
import {
	type AuthEnv,
	type AuthVariables,
	addOpenAPIEndpoint,
	authMiddleware,
	createApp,
} from "./http/index.js";
import { KVStorage } from "./storage/kv.js";
import { createUIRoutes } from "./ui/routes.js";

/**
 * Environment bindings from wrangler.jsonc
 */
interface WorkerEnv extends AuthEnv {
	SKILLS_KV: KVNamespace;
	ANALYTICS: AnalyticsEngineDataset;
	ASSETS: Fetcher;
}

interface AppEnv {
	Bindings: WorkerEnv;
	Variables: AuthVariables & {
		core: Core;
	};
}

/**
 * Create the HTTP API app with core wired to KV storage and analytics
 */
const apiApp = createApp({
	coreFactory: (env: AuthEnv) => {
		const workerEnv = env as WorkerEnv;
		const storage = new KVStorage(workerEnv.SKILLS_KV);
		return makeCore({ storage });
	},
	analyticsFactory: (env: AuthEnv) => {
		const workerEnv = env as WorkerEnv;
		return makeAnalytics(workerEnv.ANALYTICS);
	},
});

// Add OpenAPI endpoint to API app
addOpenAPIEndpoint(apiApp);

/**
 * Create the UI routes
 */
const uiRoutes = createUIRoutes();

/**
 * Main app that combines API and UI
 */
const app = new Hono<AppEnv>();

// Auth middleware to extract identity from headers (for UI routes)
app.use("*", authMiddleware());

// Inject core into context for UI routes
app.use("*", async (c, next) => {
	const storage = new KVStorage(c.env.SKILLS_KV);
	c.set("core", makeCore({ storage }));
	return next();
});

// Mount UI routes at root (before API to avoid basePath issues)
app.route("/", uiRoutes);

// Mount API routes (already has /api/v1 basePath)
app.route("/", apiApp);

export default app;
