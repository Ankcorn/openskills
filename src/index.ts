import { makeAnalytics } from "./analytics/index.js";
import { makeAuth } from "./auth/index.js";
import type { AuthEnv } from "./auth/interface.js";
import { makeCore } from "./core/core.js";
import { createFullApp } from "./http/index.js";
import { KVStorage } from "./storage/kv.js";
import { createUIRoutes } from "./ui/routes.js";

/**
 * Environment bindings from wrangler.jsonc
 */
interface WorkerEnv extends AuthEnv {
	SKILLS_KV: KVNamespace;
	ANALYTICS: AnalyticsEngineDataset;
	ASSETS: Fetcher;
	AUTH_KV: KVNamespace;
}

/**
 * Create the full application with API and UI.
 *
 * Routes:
 * - /api/v1/* - Skills API with OpenAPI docs
 * - /* - Web UI (includes /login, /callback, /logout)
 */
const app = createFullApp({
	coreFactory: (env) => {
		const workerEnv = env as WorkerEnv;
		const storage = new KVStorage(workerEnv.SKILLS_KV);
		return makeCore({ storage });
	},
	analyticsFactory: (env) => {
		const workerEnv = env as WorkerEnv;
		return makeAnalytics(workerEnv.ANALYTICS);
	},
	authFactory: makeAuth,
	uiRoutesFactory: createUIRoutes,
});

export default app;
