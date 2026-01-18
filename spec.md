# Skills Registry - Design Document

Package name: `openskills-ai`

## Overview

A registry service for versioned "skills" stored as markdown.

- Skills are stored and served as-is (format-agnostic)
- Reads are public by default
- Writes require authentication; see `Authentication (Authoritative)`
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

## Authentication (Authoritative)

This section is the single source of truth for authentication and authorization behavior. Other parts of the spec should reference this section instead of duplicating details.

### Goals

- Exactly one auth provider is enabled per deployment.
- Reads are public; writes require authentication.
- Authorization is namespace-scoped: a caller can only write to their bound namespace.
- Simple, self-contained auth implementation using `jose` for JWT operations.

### Provider Modes

`AUTH_PROVIDER` is one of:

- `github` — GitHub OAuth with self-issued JWTs (recommended for public deployments)
- `cloudflare-access` — Cloudflare Access JWT verification (recommended for private/enterprise deployments)

### Worker Routing

```
┌─────────────────────────────────────────────────────────────┐
│                    openskills-ai Worker                     │
├─────────────────────────────────────────────────────────────┤
│  /login      → Login page (GitHub only)                     │
│  /callback   → OAuth callback (GitHub only)                 │
│  /logout     → Logout (GitHub only)                         │
│  /api/v1/*   → Skills API                                   │
│  /*          → UI (optional)                                │
└─────────────────────────────────────────────────────────────┘
```

- When `AUTH_PROVIDER` is `github`, the Worker serves OAuth routes (`/login`, `/callback`, `/logout`) as part of the UI routes.
- When `AUTH_PROVIDER` is `cloudflare-access`, there are no OAuth routes; Cloudflare Access authenticates users at the perimeter.

### Identity Model

All auth providers yield the same identity shape:

```ts
// src/types/index.ts
export type Identity = {
  namespace: string
  email?: string
}
```

Namespace derivation:

- `github`: namespace is the GitHub username (lowercased).
- `cloudflare-access`: namespace is derived from the email local part (e.g., `alice@example.com` → `alice`), normalized to lowercase alphanumeric with hyphens.

### Authorization Rules

- Public routes: no auth required.
- Protected routes:
  - If identity is missing or invalid → 401.
  - If identity exists but `identity.namespace` does not match the target `:namespace` path param → 403.

### Auth Abstraction

Auth integrates into `createApp` via an injected factory, similar to core and analytics.

```ts
// src/auth/interface.ts
import type { MiddlewareHandler } from "hono"
import type { Identity } from "../types/index.js"

export type AuthProvider = "github" | "cloudflare-access"

export interface AuthEnv {
  AUTH_PROVIDER: AuthProvider

  // GitHub OAuth
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string

  // Cloudflare Access
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUDIENCE?: string

  // KV for signing keys (GitHub only)
  AUTH_KV?: KVNamespace
}

export interface AuthVariables {
  identity: Identity | null
}

export interface Auth<E extends AuthEnv, V extends AuthVariables> {
  middleware: MiddlewareHandler<{ Bindings: E; Variables: V }>
  requireAuth: MiddlewareHandler<{ Bindings: E; Variables: V }>
}

export type AuthFactory<E extends AuthEnv, V extends AuthVariables> = (env: E) => Auth<E, V>
```

### Integration with createApp

`createApp(...)` accepts `authFactory(env)` and uses it to:

- populate the request context identity for all routes (API + UI) via `c.set("identity", ...)`
- enforce protected routes via `auth.requireAuth`

The `makeAuth(env)` factory function selects the appropriate provider based on `AUTH_PROVIDER` and validates that required environment variables are set.

### Protocols / Headers

Protected routes (API + UI form posts) accept credentials via:

- `Authorization: Bearer <token>` — For CLI / API clients
- HttpOnly cookies — For browser/SSR flows

Provider-specific signals:

**cloudflare-access:**
- `Cf-Access-Jwt-Assertion` header (primary)
- `CF_Authorization` cookie (fallback)
- Tokens are verified against Cloudflare's JWKS at `https://<team-domain>/cdn-cgi/access/certs`

**github:**
- `Authorization: Bearer <jwt>` header
- `openskills_access` cookie
- JWTs are self-issued and verified using an ES256 key pair stored in KV

Notes:
- Cookie support is required so SSR form posts (`POST /create`, `POST /@:namespace/:name/edit`) work without client-side JS.
- Middleware credential precedence: check `Authorization: Bearer ...` first, then fall back to cookie auth.
- CSRF: the cookie approach relies on `SameSite=Lax` for CSRF mitigation.

### GitHub OAuth Provider

The GitHub provider implements a simple OAuth flow without external dependencies:

1. **Login (`GET /login`)**: Displays a login page with a "Sign in with GitHub" button that redirects to GitHub's authorization URL.

2. **Callback (`GET /callback`)**: Exchanges the OAuth code for a GitHub access token, fetches the user profile, and issues a self-signed JWT.

3. **JWT Issuance**: 
   - Signs JWTs using an ES256 key pair
   - Key pair is generated on first use and stored in `AUTH_KV`
   - JWTs contain: `namespace` (GitHub username), `email`, `provider: "github"`
   - Default expiration: 30 days

4. **JWT Verification**:
   - Middleware extracts tokens from `Authorization: Bearer` header or `openskills_access` cookie
   - Verifies signature using the public key from KV
   - Validates issuer matches the request origin

Cookie settings:
- Name: `openskills_access`
- `HttpOnly`, `Path=/`, `SameSite=Lax`
- `Secure` in production (HTTPS), omitted for local dev (HTTP)
- `Max-Age`: 30 days

### Cloudflare Access Provider

The Cloudflare Access provider validates JWTs issued by Cloudflare Access:

1. **Token Extraction**: Checks `Cf-Access-Jwt-Assertion` header, falls back to `CF_Authorization` cookie.

2. **JWT Verification**:
   - Fetches JWKS from `https://<team-domain>/cdn-cgi/access/certs`
   - Verifies signature using RS256
   - Validates `aud` claim matches `CF_ACCESS_AUDIENCE`

3. **Identity Derivation**: Extracts email from JWT payload, derives namespace from email local part.

### Storage

- `github`: Signing key pair stored in `AUTH_KV` at key `auth:signing-key`
- `cloudflare-access`: No auth storage required (stateless JWT verification)

### Configuration

Required environment variables:

| Variable | Required For | Description |
|----------|-------------|-------------|
| `AUTH_PROVIDER` | All | `"github"` or `"cloudflare-access"` |
| `GITHUB_CLIENT_ID` | GitHub | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub | GitHub OAuth App client secret |
| `AUTH_KV` | GitHub | KV namespace binding for signing keys |
| `CF_ACCESS_TEAM_DOMAIN` | CF Access | e.g., `myteam.cloudflareaccess.com` |
| `CF_ACCESS_AUDIENCE` | CF Access | Application AUD tag from CF Access |

### Dependencies

```bash
npm install jose  # JWT signing/verification (used by both providers)
```

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
  auth/       # Authentication providers
    index.ts              # Module exports
    interface.ts          # Auth types, AuthEnv, Auth interface
    factory.ts            # makeAuth() - selects provider based on AUTH_PROVIDER
    github.ts             # GitHub OAuth + JWT issuance/verification
    github-middleware.ts  # Middleware for GitHub JWT validation
    cloudflare-access.ts  # Cloudflare Access JWT verification
    logger.ts             # Auth-specific logging utilities
  core/       # business logic and domain services
  http/       # Hono routes -> validate inputs -> call core
  ui/         # SSR UI routes (optional, includes /login, /callback, /logout)
  storage/    # storage backends used by core
  types/      # schemas + derived TS types
```

### Config (MVP)

- `workspace`: string identifier used for analytics indexing
- `enableUi`: boolean (default false)
- `maxSkillBytes`: number (default 262144)
- `auth`: authentication provider via `AUTH_PROVIDER` env var:
  - `github`: GitHub OAuth with self-issued JWTs
  - `cloudflare-access`: Cloudflare Access JWT verification

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
| `PUT` | `/skills/@:namespace/:name/versions/:version` | Publish new version | Yes (must own namespace) |

### User Profile Operations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/users/@:namespace` | Get a namespace profile | No |
| `PUT` | `/users/@:namespace` | Update the caller's own profile | Yes (must match caller namespace) |

Namespaces are created implicitly on first publish or profile update.

### Example Requests

```bash
# Public reads
GET /api/v1/skills
GET /api/v1/skills/@anthropic
GET /api/v1/skills/@anthropic/docker-compose/latest
GET /api/v1/skills/@anthropic/docker-compose/versions/1.2.0

# Authenticated write
PUT /api/v1/skills/@anthropic/docker-compose/versions/1.3.0
Content-Type: text/markdown
Authorization: Bearer <access-token>

<markdown content>
```

See the **Search** section for search functionality (`GET /api/v1/search?q=...`).

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

Track skill views/downloads using Workers Analytics Engine.

### Event Shape

- Dataset: configured via `ANALYTICS` binding
- Index format: `{namespaceId}/{skillId}@{version}` (uses nanoids for compact indexing)

Blobs/doubles:
- `blob1`: `namespace_id` (nanoid)
- `blob2`: `skill_id` (nanoid)
- `blob3`: `version`
- `blob4`: `route` (`versions`, `latest`, `ui-versions`, `ui-latest`)
- `blob5`: `request_id` (optional, e.g., cf-ray)
- `blob6`: `namespace` (human-readable)
- `blob7`: `skill_name` (human-readable)
- `double1`: `bytes`

### Tracking Events

Events are tracked automatically when:
- API routes return skill content (`GET /api/v1/skills/@:namespace/:name/versions/:version`, `GET /api/v1/skills/@:namespace/:name/latest`)
- UI pages display a skill (`/@:namespace/:name`, `/@:namespace/:name/versions/:version`)

Route types distinguish API vs UI access:
- `versions`, `latest` — API routes
- `ui-versions`, `ui-latest` — UI routes

### Top Skills (Home Page)

The home page displays top skills based on download/view counts from the last 7 days. This requires configuring analytics query credentials:

- `CF_ACCOUNT_ID`: Cloudflare account ID
- `ANALYTICS_API_TOKEN`: API token with Analytics Engine read permissions

If these are not configured, the home page falls back to listing recent skills.

### Querying Analytics (SQL API)

```ts
const API = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
const query = `
  SELECT
    blob6 AS namespace,
    blob7 AS skill_name,
    blob2 AS skill_id,
    SUM(_sample_interval) AS downloads
  FROM ANALYTICS
  WHERE timestamp > NOW() - INTERVAL '7' DAY
  GROUP BY namespace, skill_name, skill_id
  ORDER BY downloads DESC
  LIMIT 10
  FORMAT JSON
`;

const res = await fetch(API, {
  method: "POST",
  headers: { Authorization: `Bearer ${env.ANALYTICS_API_TOKEN}` },
  body: query,
});

const json = await res.json();
```

---

## Search

Full-text search for skills using [Orama](https://docs.orama.com/), a lightweight JavaScript search library.

### Goals

- Fast, typo-tolerant search across skill names and descriptions
- Lightweight index that can be stored in KV and loaded on-demand
- No external search service dependencies

### Search Index Schema

```ts
import { create } from "@orama/orama";

const searchIndex = create({
  schema: {
    namespace: "string",
    name: "string",
    description: "string",
    skillId: "string",
  },
});
```

Fields indexed:
- `namespace`: The skill's namespace (e.g., `ankcorn`)
- `name`: The skill name (e.g., `docker-compose`)
- `description`: From frontmatter (e.g., "Best practices for Docker Compose...")
- `skillId`: Internal ID for lookups (not searched, used for result mapping)

### Index Storage

The search index is persisted to KV using Orama's `plugin-data-persistence`:

```ts
import { persist, restore } from "@orama/plugin-data-persistence";

// Save index to KV
const indexJson = await persist(searchIndex, "json");
await env.SKILLS_KV.put("search:index", indexJson);

// Load index from KV
const indexJson = await env.SKILLS_KV.get("search:index");
const searchIndex = await restore("json", indexJson);
```

Storage key: `search:index`

### Index Updates

The search index is rebuilt in the background after each publish using `ctx.waitUntil`:

```ts
// In publish handler
ctx.waitUntil(rebuildSearchIndex(env, core));
```

This ensures the publish response is fast while the index rebuild happens asynchronously.

```ts
async function rebuildSearchIndex(env: Env, core: Core): Promise<void> {
  const logger = new Logger();
  logger.info`[SEARCH] Rebuilding search index`;
  
  const allSkills = await core.listSkills();
  const index = create({ schema: { ... } });

  for (const skill of allSkills) {
    const content = await core.getSkillLatest(skill);
    const frontmatter = parseFrontmatter(content);
    insert(index, {
      namespace: skill.namespace,
      name: skill.name,
      description: frontmatter.description,
      skillId: skill.id,
    });
  }

  await env.SKILLS_KV.put("search:index", await persist(index, "json"));
  logger.info`[SEARCH] Index rebuilt with ${{ count: allSkills.length }} skills`;
}
```

### Search API

```ts
import { search } from "@orama/orama";

const results = search(searchIndex, {
  term: "docker compose",
  limit: 20,
});
```

Results include relevance scores. Map `skillId` back to full skill data for display.

### Search Endpoint

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/v1/search?q=:query` | Search skills | No |

Response:
```json
{
  "query": "docker",
  "results": [
    {
      "namespace": "ankcorn",
      "name": "docker-compose",
      "description": "Best practices for Docker Compose...",
      "version": "1.2.0",
      "score": 0.95
    }
  ]
}
```

### UI Search

The existing `/search` UI route uses the same search logic:

1. Load index from KV (cache in memory for request duration)
2. Execute Orama search
3. Fetch latest version for each result
4. Render `SearchPage` with results

### Dependencies

```bash
npm install @orama/orama @orama/plugin-data-persistence
```

### In-Memory Caching

Cache the loaded index in a module-level variable to avoid repeated KV reads:

```ts
import { Logger } from "hatchlet";

let cachedIndex: Orama | null = null;

async function getSearchIndex(env: Env): Promise<Orama | null> {
  const logger = new Logger();
  
  if (cachedIndex) {
    logger.debug`[SEARCH] Loading search index from ${{ source: "memory" }}`;
    return cachedIndex;
  }

  const indexJson = await env.SKILLS_KV.get("search:index");
  if (!indexJson) {
    logger.warn`[SEARCH] No search index found in KV`;
    return null;
  }

  logger.info`[SEARCH] Loading search index from ${{ source: "kv" }}`;
  cachedIndex = await restore("json", indexJson);
  return cachedIndex;
}
```

The `source` log parameter helps monitor cache effectiveness:
- `memory` — Cache hit, no KV read required
- `kv` — Cache miss, loaded from KV

No explicit cache invalidation needed - Worker isolates are ephemeral and recycle frequently, so the cache naturally refreshes. This should reduce KV lookups by ~4-5x.

### Implementation Notes

- Index is small (names + descriptions only), so loading from KV is fast even on cache miss
- Module-level cache persists across requests within the same Worker isolate
- Orama supports typo tolerance out of the box
- Search is case-insensitive by default

---

## Deployment

### Cloudflare Workers (default)

- Deploy as a Worker (Hono)
- Configure one auth provider; see `Authentication (Authoritative)`
- Serve static assets via Workers assets when UI is enabled
- Required KV namespaces:
  - `SKILLS_KV`: skill content and metadata
  - `AUTH_KV`: signing key storage (GitHub provider only)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_PROVIDER` | Yes | One of: `github`, `cloudflare-access` |
| `GITHUB_CLIENT_ID` | If GitHub | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | If GitHub | GitHub OAuth app client secret |
| `CF_ACCESS_TEAM_DOMAIN` | If CF Access | e.g., `myteam.cloudflareaccess.com` |
| `CF_ACCESS_AUDIENCE` | If CF Access | Application AUD tag from Cloudflare Access |
| `CF_ACCOUNT_ID` | No | Cloudflare account ID (enables analytics queries for top skills) |
| `ANALYTICS_API_TOKEN` | No | API token with Analytics Engine read permissions |

Secrets (set via `wrangler secret put`):
- `GITHUB_CLIENT_SECRET`
- `ANALYTICS_API_TOKEN`

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
7. Authentication
   - Add `Auth` abstraction + `authFactory` injection into `createApp`
   - `cloudflare-access` implementation (JWKS-based JWT validation)
   - `github` implementation (OAuth flow + self-issued JWTs)
8. Add MCP support via `hono-mcp-server` (deferred)
