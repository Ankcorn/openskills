# Skills Registry - Design Document

Package name: `openskills-ai`

## Overview

A registry service for versioned "skills" stored as markdown.

- Skills are stored and served as-is (format-agnostic)
- Reads are public by default
- Writes are expected to be protected by Cloudflare Access
- HTTP API (Hono)
- Optional web UI rendered with Hono JSX
- MCP integration is deferred until the MCP package is ready

Non-goals (MVP): agent-specific plugins, format conversion, a required CLI.

---

## MVP Package

Ship a single npm package: `openskills-ai`.

- Includes core + HTTP + MCP
- UI is optional (configurable)

---

## Core Concepts

### Namespacing

- Skill ID: `@{namespace}/{skill-name}`
- Namespace may represent a user or organization

### Versioning

- Immutable versions: once published, content cannot be changed
- Versions follow semver: `MAJOR.MINOR.PATCH` (optional pre-release)
- All versions kept forever
- `latest` resolves to the highest stable semver version
  - pre-releases excluded unless no stable versions exist

### Upload

- Publish via direct `PUT` of markdown content
- `Content-Type: text/markdown`

### Skill Content Schema

Skills are markdown files with YAML frontmatter. The frontmatter follows the OpenCode skill format for compatibility.

#### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill name (must match URL path) |
| `description` | Yes | 1-1024 characters, used for discovery |
| `license` | No | License identifier (e.g., "MIT") |
| `compatibility` | No | Tool compatibility hint (e.g., "opencode") |
| `metadata` | No | Arbitrary key-value pairs (string to string) |

#### Name Validation

The `name` field must:
- Be 1-64 characters
- Be lowercase alphanumeric with single hyphen separators
- Not start or end with `-`
- Not contain consecutive `--`
- Match the skill name in the URL path

Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`

#### Example Skill Content

```markdown
---
name: docker-compose
description: Best practices for Docker Compose configuration and multi-container orchestration
license: MIT
compatibility: opencode
metadata:
  audience: engineers
  workflow: devops
---

## What I do

- Guide Docker Compose file structure
- Recommend networking and volume patterns
- Suggest health check configurations

## When to use me

Use this when setting up multi-container applications with Docker Compose.
```

#### Validation on Publish

When a skill is published:
1. Parse YAML frontmatter from markdown content
2. Validate frontmatter against the schema
3. Verify `name` field matches the URL path parameter
4. Store the full content (frontmatter + body) as-is

The registry stores skills verbatim and serves them as-is. Frontmatter validation ensures discoverability and consistency, but the body content is free-form markdown.

---

## Identity & Authentication

### Cloudflare Access

- Reads require no auth
- Write routes are designed to sit behind Cloudflare Access
- A Hono middleware verifies the Cloudflare Access JWT and attaches identity to the request context
  - Primary header: `Cf-Access-Jwt-Assertion: <jwt>`
  - Optional dev fallback: `Authorization: Bearer <jwt>`

### Authorization (MVP)

- Publishing skills is enforced at the perimeter (Cloudflare Access policy)
- Profile edits are self-service: a caller can only update their own `skills/{namespace}/user.json`
  - the namespace must be derived from verified identity

---

## Namespace Rules

- Case-insensitive: normalize to lowercase for storage and responses
- Allowed characters:
  - `namespace`: `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$` (1-40 chars; no leading/trailing `-`)
  - `skill-name`: `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$` (1-64 chars; no leading/trailing `-`)
- Reserved namespaces (MVP): none

---

## Validation & Limits

- Max skill content size (MVP default): 256 KiB (configurable)

### Runtime Validation

- Use `hono-openapi` + `@hono/standard-validator` for request validation and OpenAPI generation.
- Preferred for this project: **Zod v4**.
- `hono-openapi` supports multiple validation libs via Standard Schema; we standardize on Zod to keep one schema system across HTTP + persisted-data validation.

- Keep schemas in `src/types/`.
- Derive TS types from schemas (no casts).

Validate at boundaries and when reading persisted data:
- HTTP inputs validated via `validator(...)` from `hono-openapi` using Zod schemas.
- Persisted data read from storage (e.g. `metadata.json`, `user.json`) validated on read using the same Zod schemas.

Internal write paths do not re-validate once inputs are typed.

---

## TypeScript Conventions

- Full strict mode + `noUncheckedIndexedAccess`
- ESM only (`"type": "module"`), no CommonJS
- Bun runtime:
  - `bun test`
  - `bun run build`

Anti-patterns:
- `any`
- `as unknown as ...`
- casting untrusted data (`JSON.parse(...) as T`)

---

## Error Handling

Use `better-result`:

```ts
import { Result } from "better-result";
```

- Wrap throwing functions with `Result.try(...)`
- Prefer `.match({ ok, err })` for branching
- Keep the dual API convention for any custom combinators we add: `fn(result, arg)` and `fn(arg)(result)`

## Logging

Use `hatchlet` for logging.

```ts
import { Logger } from "hatchlet";

const logger = new Logger({ dev: true });
logger.info`published ${{ namespace }} / ${{ name }} @ ${{ version }}`;
```

- Use named parameters (`${{name}}`) so logs are structured.
- Prefer logging at the boundaries (HTTP handlers, MCP handlers, storage adapters), not deep inside tight loops.

---

## Architecture

### Code Structure

The server exposes business logic via HTTP (and an optional UI). MCP integration is added later.

```
src/
  core/       # business logic and domain services
  http/       # Hono routes -> validate inputs -> call core
  ui/         # SSR UI routes (optional) -> call core
  storage/    # storage backends used by core
  middleware/ # Cloudflare Access auth, etc
  types/      # schemas + derived TS types
```

### Config (MVP)

- `workspace`: string identifier used for analytics indexing
- `enableUi`: boolean (default false)
- `maxSkillBytes`: number (default 262144)

---

## Storage

### Storage Interface

```ts
interface StorageBackend {
  get(key: string): Promise<string | null>
  put(key: string, value: string, metadata?: object): Promise<void>
  delete(key: string): Promise<boolean>
  list(prefix: string): Promise<string[]>

  // Optional: atomic operations for versioning
  putIfNotExists?(key: string, value: string): Promise<boolean>
}
```

### Storage Backends

| Backend | Use case |
|--------|----------|
| Cloudflare KV | production default |
| File system | local dev / self-hosted |
| Memory | tests |

### Storage Keys

All keys are stored under `skills/`.

```
skills/{namespace}/user.json
skills/{namespace}/{skill-name}/metadata.json
skills/{namespace}/{skill-name}/versions/{version}.md
```

---

## Data Models

### Skill Metadata (stored)

```json
{
  "namespace": "anthropic",
  "name": "docker-compose",
  "created": "2025-01-15T00:00:00Z",
  "updated": "2025-01-17T00:00:00Z",
  "versions": {
    "1.0.0": {
      "published": "2025-01-15T00:00:00Z",
      "size": 4523,
      "checksum": "sha256:abc123..."
    }
  },
  "latest": "1.0.0"
}
```

### User Profile (stored)

Stored at `skills/{namespace}/user.json`. Created on demand when a user first interacts.

Schema is defined in `src/types/`.

---

## HTTP API

Base path: `/api/v1`

### HTTP Validation & OpenAPI

Use `hono-openapi` as the validation + OpenAPI layer.

Install:

```bash
npm install hono-openapi @hono/standard-validator
npm install zod
```

Notes:
- `hono-openapi` is middleware that generates OpenAPI docs automatically from validation.
- When using `validator()` from `hono-openapi`, validated `query`/`json`/`param`/`form` inputs are automatically reflected in the OpenAPI request schema.
  - Do not manually duplicate request schema inside `describeRoute()`.

Pattern (Zod v4):

```ts
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";

const querySchema = z.object({
  name: z.string().optional(),
});

const responseSchema = z.string();

const app = new Hono();

app.get(
  "/",
  describeRoute({
    description: "Say hello to the user",
    responses: {
      200: {
        description: "Successful response",
        content: {
          "text/plain": { schema: resolver(responseSchema) },
        },
      },
    },
  }),
  validator("query", querySchema),
  (c) => {
    const query = c.req.valid("query");
    return c.text(`Hello ${query?.name ?? "Hono"}!`);
  },
);
```

Expose an OpenAPI document endpoint (e.g. `GET /openapi`).

### Skill Operations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/skills` | List all skills (paginated) | No |
| `GET` | `/skills/@:namespace` | List skills in namespace | No |
| `GET` | `/skills/@:namespace/:name` | Get skill metadata | No |
| `GET` | `/skills/@:namespace/:name/versions` | List versions | No |
| `GET` | `/skills/@:namespace/:name/versions/:version` | Get specific version content | No |
| `GET` | `/skills/@:namespace/:name/latest` | Get latest version content | No |
| `PUT` | `/skills/@:namespace/:name/versions/:version` | Publish new version | Cloudflare Access |

### User Profile Operations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/users/@:namespace` | Get a namespace profile | No |
| `PUT` | `/users/@:namespace` | Update the caller's own profile | Cloudflare Access (must match caller namespace) |

Namespaces are created implicitly on first publish or profile update.

### Example Requests

```bash
GET /api/v1/skills
GET /api/v1/skills/@anthropic
GET /api/v1/skills/@anthropic/docker-compose/latest
GET /api/v1/skills/@anthropic/docker-compose/versions/1.2.0

PUT /api/v1/skills/@anthropic/docker-compose/versions/1.3.0
Content-Type: text/markdown
Cf-Access-Jwt-Assertion: <jwt>

<markdown content>
```

Search is a future feature (`GET /search?q=...`).

---

## MCP (Deferred)

We will add MCP support later.

- For now, we only ship the HTTP API + UI.
- HTTP endpoints should be documented and validated via `hono-openapi` so the MCP layer can be derived cleanly later.

Planned approach:
- Use `hono-mcp-server` to expose Hono routes as MCP tools once the package is ready.

---

## Web UI

Optional SSR UI rendered with Hono JSX.

- Server-rendered pages use `hono/jsx`
- Minimal interactivity uses client components via `hono/jsx/dom` (e.g. copy-to-clipboard)

Pages (MVP):
- Home: search + top skills + create button
- Namespace profile: skills list
- Skill detail: rendered markdown + edit affordance
- Create skill: form to publish a new skill (auth required)
- Edit skill: form to publish a new version of an existing skill (auth required)

### Create Skill Page

Route: `/@:namespace/:name/new` or `/new` (with namespace/name inputs)

Form fields:
- Namespace (pre-filled from authenticated user, read-only or dropdown if user has multiple)
- Skill name (validated client-side against name regex)
- Version (default "1.0.0", validated as semver)
- Content (textarea with markdown + frontmatter template)

Behavior:
- Pre-populate content textarea with frontmatter template
- Client-side validation before submit
- POST to API, redirect to skill detail on success
- Show validation errors inline

### Edit Skill Page

Route: `/@:namespace/:name/edit`

Form fields:
- Version (required, must be higher than current latest)
- Content (textarea pre-filled with latest version content)

Behavior:
- Load current latest version content into textarea
- Suggest next patch/minor/major version
- Client-side validation before submit
- POST to API, redirect to skill detail on success
- Show validation errors inline

### Authentication for UI Forms

- Create/Edit pages require authentication
- If user is not authenticated, show login prompt or redirect
- Forms only allow publishing to namespaces the user owns

Design references (wireframes):
- `design/home-wireframe.png`
- `design/profile-wireframe.png`
- `design/skill-detail-wireframe.png`

### Styling

Tailwind CSS via Tailwind CLI (no bundler required).

- Use Tailwind Typography (`prose`) for markdown rendering
  - `<article class="prose prose-slate max-w-none">...</article>`
- Use Space Mono as the primary UI font

Font stack:
- `"Space Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`

Color palette (inspired by ankcorn.dev Tailwind v4 tokens):

```css
@layer theme {
  :root {
    --color-gray-100: oklch(96.7% 0.003 264.542);
    --color-gray-200: oklch(92.8% 0.006 264.531);
    --color-gray-400: oklch(70.7% 0.022 261.325);
    --color-gray-500: oklch(55.1% 0.027 264.364);
    --color-gray-700: oklch(37.3% 0.034 259.733);
    --color-gray-800: oklch(27.8% 0.033 256.848);
    --color-neutral-900: oklch(20.5% 0 0);
  }
}
```

Tailwind build:

```bash
npm install tailwindcss @tailwindcss/cli
npx @tailwindcss/cli -i ./src/input.css -o ./public/output.css --watch
```

### Static Assets

Serve UI static files (including compiled CSS and client entrypoints) using Workers static assets.

Example `wrangler.toml`:

```toml
[assets]
directory = "./public/"
binding = "ASSETS"
```

---

## Analytics (Workers Analytics Engine)

Track skill downloads using Workers Analytics Engine.

### Event Shape

- Dataset: `openskills_downloads`
- Index:

```
index1 = "{workspace}/@{namespace}/{skill-name}@{version}"
```

Blobs/doubles:
- `blob1`: `workspace`
- `blob2`: `namespace`
- `blob3`: `skill_name`
- `blob4`: `version`
- `blob5`: `route`
- `blob6`: `request_id` (optional)
- `double1`: `bytes`

### Writing Events (Worker)

Write a download event whenever a skill is returned (HTTP or MCP).

```ts
await env.ANALYTICS.writeDataPoint({
  dataset: "openskills_downloads",
  index1: `${workspace}/@${namespace}/${skillName}@${version}`,
  blobs: [workspace, namespace, skillName, version, route, requestId ?? ""],
  doubles: [bytes],
});
```

### Querying Analytics (SQL API)

```ts
const API = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`;
const query = `
  SELECT
    index1 AS skill_path,
    SUM(_sample_interval) AS downloads
  FROM openskills_downloads
  WHERE timestamp > NOW() - INTERVAL '7' DAY
  GROUP BY skill_path
  ORDER BY downloads DESC
  FORMAT JSON
`;

const res = await fetch(API, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.API_TOKEN}` },
  body: query,
});

const json = await res.json();
```

Prefix drilldown:

```sql
SELECT
  index1 AS skill_path,
  SUM(_sample_interval) AS downloads
FROM openskills_downloads
WHERE
  timestamp > NOW() - INTERVAL '30' DAY
  AND startsWith(index1, 'my-workspace/@acme/docker-compose@')
GROUP BY skill_path
ORDER BY downloads DESC
```

---

## Deployment

### Cloudflare Workers (default)

- Deploy as a Worker (Hono)
- Put writes behind Cloudflare Access
- Serve static assets via Workers assets when UI is enabled

### Hono plugin

- Mount the app as a sub-router in an existing Hono application

### Standalone Node

- Optional local/self-host mode

---

## Testing

- Use Vitest
- Test the main functionality via `src/core/*` (do not test HTTP endpoints in the MVP)
- Prefer memory storage backend for tests

---

## Implementation Order

1. `src/types/`: schemas + derived TS types (skills, versions, metadata, profiles)
2. `src/storage/`: `StorageBackend` + memory backend
3. `src/core/`: publish/get/list/latest/profile update (validate persisted data on read)
4. `src/http/`: Hono routes calling core + hono-openapi validation
5. Analytics logging hooks for skill reads
6. Optional UI (Hono JSX + Tailwind + assets)
7. Add MCP support via `hono-mcp-server` (deferred)
