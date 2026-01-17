---
name: cloudflare-testing
description: Configure and use Cloudflare Workers Vitest integration (@cloudflare/vitest-pool-workers) + cloudflare:test helpers
license: MIT
compatibility: opencode
metadata:
  audience: engineers
  workflow: testing
  stack:
    - vitest
    - cloudflare-workers
---

## What I do

- Set up Vitest to run inside the Workers runtime using `@cloudflare/vitest-pool-workers`
- Provide a quick lookup for `cloudflare:test` helpers (`env`, `SELF`, `fetchMock`, ExecutionContext helpers)
- Point to the right Cloudflare recipes when you need a full example

## When to use me

Use this when you need Workers-native testing:
- you need access to bindings (`env.*`)
- you want integration tests via `SELF.fetch(...)`
- you need Miniflare-backed isolation for KV/R2/Cache/D1/Durable Objects

If you are testing pure logic with dependency injection (e.g. openskills-ai `core/`), you can use plain Vitest without the Workers pool.

## Core rules (firm)

- When using the Workers Vitest integration, do NOT set a custom Vitest `environment` or `runner`.
- Use `defineWorkersConfig()` (not `defineConfig()`).
- Prefer isolated tests; understand sampling when counting Analytics Engine rows (`SUM(_sample_interval)`).

## Minimal config

Create `vitest.config.ts` using `defineWorkersConfig()`:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.toml",
        },
      },
    },
  },
});
```

Remember these Worker pool options:
- `isolatedStorage` (default `true`): per-test isolated storage (no `.concurrent`)
- `singleWorker` (default `false`): run tests serially in one Worker for speed
- `main`: set this if you want `SELF` / integration tests against your Worker export

## `cloudflare:test` API lookup

### `env`

Access bindings configured via Wrangler/Miniflare:

```ts
import { env } from "cloudflare:test";
import { it, expect } from "vitest";

it("uses binding", async () => {
  await env.MY_KV.put("key", "value");
  expect(await env.MY_KV.get("key")).toBe("value");
});
```

Add types for bindings:

```ts
declare module "cloudflare:test" {
  interface ProvidedEnv {
    MY_KV: KVNamespace;
  }
}
```

### `SELF`

Integration test your Worker:

```ts
import { SELF } from "cloudflare:test";
import { it, expect } from "vitest";

it("calls worker", async () => {
  const res = await SELF.fetch("https://example.com/api/v1/skills");
  expect(res.status).toBe(200);
});
```

### `fetchMock`

Mock outbound `fetch()`:

```ts
import { fetchMock } from "cloudflare:test";
import { beforeAll, afterEach, it, expect } from "vitest";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

it("mocks outbound fetch", async () => {
  fetchMock.get("https://example.com").intercept({ path: "/" }).reply(200, "body");
  const res = await fetch("https://example.com/");
  expect(await res.text()).toBe("body");
});
```

### ExecutionContext helpers

Use when testing module-format handlers with `ctx.waitUntil()`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "./index";

it("waits for waitUntil side effects", async () => {
  const req = new Request("https://example.com/");
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
});
```

## Recipes (lookup)

Start from these official examples:
- Basics unit/integration with `SELF`: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/basics-unit-integration-self
- Workers assets: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/workers-assets
- KV/R2/Cache isolation: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/kv-r2-caches
- D1 migrations: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/d1
- Durable Objects: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/durable-objects
- Request mocking: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/request-mocking

## Anti-patterns

- `defineConfig()` instead of `defineWorkersConfig()`.
- Setting a custom Vitest `environment` or `runner` while using the Workers integration.
- Forgetting isolated storage constraints (no `.concurrent` when `isolatedStorage` is enabled).
