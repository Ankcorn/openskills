import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					kvNamespaces: ["SKILLS_KV", "AUTH_KV"],
					// Configure GitHub auth for tests
					bindings: {
						AUTH_PROVIDER: "github",
						GITHUB_CLIENT_ID: "test-client-id",
						GITHUB_CLIENT_SECRET: "test-client-secret",
					},
				},
			},
		},
	},
});
