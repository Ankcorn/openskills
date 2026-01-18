import { makeAnalytics } from "./analytics/index.js";
import { makeAuth } from "./auth/index.js";
import type { AuthEnv } from "./auth/interface.js";
import { makeCore } from "./core/core.js";
import { createFullApp } from "./http/index.js";
import { makeSearch } from "./search/index.js";
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
	/** Cloudflare account ID for analytics queries */
	CF_ACCOUNT_ID?: string;
	/** API token for analytics queries */
	ANALYTICS_API_TOKEN?: string;
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
		const queryConfig =
			workerEnv.CF_ACCOUNT_ID && workerEnv.ANALYTICS_API_TOKEN
				? {
						accountId: workerEnv.CF_ACCOUNT_ID,
						apiToken: workerEnv.ANALYTICS_API_TOKEN,
					}
				: null;
		return makeAnalytics(workerEnv.ANALYTICS, queryConfig);
	},
	searchFactory: (env, core) => {
		const workerEnv = env as WorkerEnv;
		const storage = new KVStorage(workerEnv.SKILLS_KV);
		return makeSearch(storage, core);
	},
	storageFactory: (env) => {
		const workerEnv = env as WorkerEnv;
		return new KVStorage(workerEnv.SKILLS_KV);
	},
	authFactory: makeAuth,
	uiRoutesFactory: createUIRoutes,
});

export default app;
