# openskills-ai Implementation TODO

Based on `spec.md` implementation order. Each section includes tests that run against public APIs.

**After each main section**: Run `npm run typecheck && npm test` to verify everything is correct. Fix issues before moving on.

## 0. Infrastructure & Setup

- [x] `wrangler.jsonc` exists with basic Worker config
- [x] Add KV namespace binding to `wrangler.jsonc`
- [x] Add Analytics Engine binding to `wrangler.jsonc`
- [x] Add static assets config to `wrangler.jsonc` (for UI)
- [x] Set up Vitest configuration
- [x] Install dependencies (zod, hono, better-result, hatchlet, hono-openapi)
- [x] Create test factory `makeCore()` (returns core with memory storage)
- [x] Create test factory `makeIdentity({ namespace })` (minimal identity object)
- [x] Create test helper `seedSkill(...)` (publish a skill for test setup)
- [x] **Verify**: `npm run typecheck && npm test` passes

## 1. Types (`src/types/`)

- [x] Create namespace validation schema (`^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$`)
- [x] Create skill name validation schema (`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`)
- [x] Create semver version schema (with optional pre-release)
- [x] Create skill metadata schema (namespace, name, created, updated, versions map, latest)
- [x] Create version info schema (published, size, checksum)
- [x] Create user profile schema
- [x] Export derived TypeScript types from schemas
- [x] **Verify**: `npm run typecheck && npm test` passes

## 2. Storage (`src/storage/`)

### 2.1 Interface & Memory Backend

- [x] Define `StorageBackend` interface (get, put, delete, list, putIfNotExists?)
- [x] Implement memory storage backend (for tests)
- [x] **Test**: `get` returns `null` for missing keys
- [x] **Test**: `put` then `get` returns the stored value
- [x] **Test**: `delete` removes key, returns `true`; returns `false` for missing key
- [x] **Test**: `list` returns keys matching prefix
- [x] **Test**: `list` returns empty array when no keys match
- [x] **Test**: `putIfNotExists` returns `true` and stores value when key is absent
- [x] **Test**: `putIfNotExists` returns `false` and does not overwrite when key exists
- [x] **Verify**: `npm run typecheck && npm test` passes

### 2.2 File System Backend

- [x] Implement file system storage backend (for local dev)
- [x] **Test**: same test suite as memory backend (SKIPPED - Workers runtime has no fs)
- [x] **Verify**: `npm run typecheck && npm test` passes

### 2.3 Cloudflare KV Backend

- [x] Implement Cloudflare KV storage backend (for production)
- [x] **Test**: same test suite via Miniflare/Workers Vitest pool (SKIPPED - needs real KV binding)
- [x] **Verify**: `npm run typecheck && npm test` passes

## 3. Core (`src/core/`)

Build in order so each feature can be tested via public methods immediately.

### 3.1 Foundation

- [x] Create core module structure (factory `makeCore({ storage })`)
- [x] Add domain error types (VERSION_ALREADY_EXISTS, CORRUPT_STORAGE_DATA, FORBIDDEN, NOT_FOUND, INVALID_INPUT)
- [x] **Verify**: `npm run typecheck && npm test` passes

### 3.2 Publish & Get Content (basic flow)

- [x] Implement `publishSkill` (creates metadata if new, appends version, stores content)
- [x] Implement `getSkillContent` (get specific version content)
- [x] **Test**: publish a skill, then get its content via `getSkillContent`
- [x] **Test**: `getSkillContent` returns NOT_FOUND for missing skill
- [x] **Test**: `getSkillContent` returns NOT_FOUND for missing version
- [x] **Verify**: `npm run typecheck && npm test` passes

### 3.3 Immutability

- [x] Enforce immutability in `publishSkill` (reject duplicate version)
- [x] **Test**: publishing the same version twice returns VERSION_ALREADY_EXISTS
- [x] **Verify**: `npm run typecheck && npm test` passes

### 3.4 Metadata

- [x] Implement `getSkillMetadata` (validate persisted metadata on read with Zod)
- [x] **Test**: `getSkillMetadata` returns metadata after publish
- [x] **Test**: `getSkillMetadata` returns NOT_FOUND for missing skill
- [x] **Test**: `getSkillMetadata` returns CORRUPT_STORAGE_DATA for invalid JSON
- [x] **Verify**: `npm run typecheck && npm test` passes

### 3.5 Latest Resolution

- [x] Implement `getSkillLatest` (resolve highest stable semver, exclude pre-releases)
- [x] **Test**: returns highest stable version when multiple versions exist
- [x] **Test**: excludes pre-release versions (e.g., `2.0.0-beta.1` < `1.1.0`)
- [x] **Test**: returns pre-release if no stable versions exist
- [x] **Test**: returns NOT_FOUND for missing skill
- [x] **Verify**: `npm run typecheck && npm test` passes

### 3.6 List Operations

- [x] Implement `listVersions` (versions of a specific skill)
- [x] **Test**: returns all versions for a skill
- [x] **Test**: returns empty array for missing skill (or NOT_FOUND, decide on behavior)
- [x] Implement `listSkillsInNamespace` (skills in a specific namespace)
- [x] **Test**: returns skills in namespace
- [x] **Test**: returns empty array for empty/missing namespace
- [x] Implement `listSkills` (paginated, all skills)
- [x] **Test**: returns all skills across namespaces
- [x] **Test**: pagination works correctly
- [x] **Verify**: `npm run typecheck && npm test` passes

### 3.7 User Profiles

- [x] Implement `getProfile` (get user profile, validate on read)
- [x] **Test**: returns NOT_FOUND for missing profile
- [x] **Test**: returns CORRUPT_STORAGE_DATA for invalid profile JSON
- [x] Implement `updateProfile` (self-service, caller can only update own namespace)
- [x] **Test**: update own profile succeeds, then `getProfile` returns updated data
- [x] **Test**: update another user's profile returns FORBIDDEN
- [x] **Verify**: `npm run typecheck && npm test` passes

## 4. HTTP (`src/http/`)

- [x] Set up Hono app with base path `/api/v1`
- [x] Create Cloudflare Access JWT middleware (verify `Cf-Access-Jwt-Assertion` header)
- [x] Add fallback dev auth via `Authorization: Bearer` header
- [x] `GET /skills` - list all skills (paginated)
- [x] `GET /skills/@:namespace` - list skills in namespace
- [x] `GET /skills/@:namespace/:name` - get skill metadata
- [x] `GET /skills/@:namespace/:name/versions` - list versions
- [x] `GET /skills/@:namespace/:name/versions/:version` - get specific version content
- [x] `GET /skills/@:namespace/:name/latest` - get latest version content
- [x] `PUT /skills/@:namespace/:name/versions/:version` - publish new version (auth required)
- [x] `GET /users/@:namespace` - get namespace profile
- [x] `PUT /users/@:namespace` - update caller's own profile (auth required, must match caller)
- [x] `GET /openapi` - expose OpenAPI document
- [x] Set up hono-openapi validation with Zod schemas
- [x] Enforce max skill content size (256 KiB default - enforced in core)
- [x] **Verify**: `npm run typecheck && npm test` passes

## 5. Analytics

- [x] Create analytics service for Workers Analytics Engine
- [x] Define event shape (index1, blobs, doubles)
- [x] Write download event on skill read (HTTP)
- [x] Add SQL query helper for analytics API
- [x] **Verify**: `npm run typecheck && npm test` passes

## 6. Web UI (Optional)

- [x] Set up Tailwind CSS with CLI
- [x] Configure color palette (oklch tokens from spec)
- [x] Set up Space Mono font
- [x] Create layout component with Hono JSX
- [x] Home page (search + top skills + create button)
- [x] Namespace profile page (skills list)
- [x] Skill detail page (rendered markdown + edit affordance)
- [x] Set up Workers static assets serving
- [x] Add client components for interactivity (copy-to-clipboard)
- [x] **Verify**: `npm run typecheck && npm test` passes

## 7. Skill Content Schema (Frontmatter)

- [x] Create frontmatter schema in `src/types/` (name, description, license, compatibility, metadata)
- [x] Create frontmatter parser utility (extract YAML from markdown)
- [x] Add frontmatter validation to `publishSkill` in core
- [x] Verify `name` field matches URL path parameter on publish
- [x] **Test**: publish with valid frontmatter succeeds
- [x] **Test**: publish with missing required frontmatter fields returns INVALID_INPUT
- [x] **Test**: publish with mismatched `name` field returns INVALID_INPUT
- [x] **Test**: publish with invalid `name` format returns INVALID_INPUT
- [x] **Test**: publish with description > 1024 chars returns INVALID_INPUT
- [x] **Verify**: `npm run typecheck && npm test` passes

## 8. Web UI - Create & Edit Pages

### 8.1 Create Skill Page

- [x] Create route `/create`
- [x] Build create skill form component (namespace, name, version, content)
- [x] Add frontmatter template pre-population in textarea
- [x] Add client-side validation (name regex, semver, required fields)
- [x] Wire form submission to publish via core
- [x] Handle success (redirect to skill detail page)
- [x] Handle errors (display inline validation errors)
- [x] Add auth gate (require authentication to view page)
- [x] **Verify**: `npm run typecheck && npm test` passes

### 8.2 Edit Skill Page

- [x] Create route `/@:namespace/:name/edit`
- [x] Build edit skill form component (version, content)
- [x] Pre-fill content textarea with latest version
- [x] Add version suggestion (next patch/minor/major)
- [x] Add client-side validation (semver)
- [x] Wire form submission to publish via core
- [x] Handle success (redirect to skill detail page)
- [x] Handle errors (display inline validation errors)
- [x] Add auth gate (require authentication, must own namespace)
- [x] **Verify**: `npm run typecheck && npm test` passes

### 8.3 UI Polish

- [x] Add "Create Skill" button to home page (links to create page)
- [x] Add "New Version" button to skill detail page (links to edit page)
- [x] Style forms consistent with existing UI (Tailwind + Space Mono)
- [ ] Add loading states during form submission (deferred - requires client JS)
- [x] **Verify**: `npm run typecheck && npm test` passes

## 9. Authentication (`src/auth/`)

Add an auth abstraction and wire it into `createApp` via `authFactory(env)`.

Exactly one provider is enabled per deployment:
- `github` (production)
- `cloudflare-access` (production)
- `password` (local development only)

Cookie names are always:
- `openskills_access`
- `openskills_refresh`

### 9.1 Infrastructure & Setup

- [x] Install dependencies per provider:
  - `cloudflare-access`: `jose`
  - `github/password`: `@openauthjs/openauth` + `jose`
- [x] Add `OPENAUTH_KV` binding to `wrangler.jsonc` (only required for `github`/`password`)
- [x] Add env var docs/validation wiring:
  - `AUTH_PROVIDER`
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (GitHub)
  - `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUDIENCE` (Cloudflare Access)
- [x] Decide cookie security settings in code:
  - prod: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain=`
  - local dev over HTTP: omit `Secure`
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.2 Auth Abstraction + Injection

- [x] Define `src/auth/interface.ts` (`Auth`, `AuthFactory`, `AuthEnv`, `AuthVariables`)
- [x] Update `createApp(...)` to accept `authFactory` and store it on context (`c.set("auth", ...)`)
- [x] Update protected routes to use `c.get("auth").requireAuth` (instead of importing `requireAuth` directly)
- [x] Ensure UI routes and API routes both run the same `auth.middleware` so `c.get("identity")` works consistently
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.3 Provider Selection + Env

- [x] Implement `makeAuth(env)` that switches by `env.AUTH_PROVIDER`
- [x] Fail fast with clear errors when required env vars are missing for the chosen provider
- [x] Wire the selected auth factory into API + UI composition in `src/index.ts`
- [x] **Test**: app starts with each provider configured
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.4 Cloudflare Access Auth (Production)

- [x] Implement `makeAuthCloudflareAccess(env)`
- [x] Verify `Cf-Access-Jwt-Assertion` using `jose` + remote JWK set (`/cdn-cgi/access/certs`)
- [x] Verify `aud` against `CF_ACCESS_AUDIENCE`
- [x] Extract identity (email/sub) and map to `Identity` with configured namespace strategy
- [x] **Test**: valid JWT yields `identity`
- [x] **Test**: invalid/missing JWT yields `identity: null` and protected routes 401
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.5 OpenAuth Issuer Routes (GitHub + Password)

- [x] Create `src/auth/subjects.ts` (`user: { namespace, email }`)
- [x] Implement `createAuthRoutes(env)` (Hono app mounted at `/auth/*`)
- [x] Mount `/auth` routes in `src/index.ts` only when provider is `github` or `password`
- [x] Implement cookie-setting behavior on successful auth:
  - set `openskills_access` and `openskills_refresh`
  - ensure cookie attributes match the spec
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.6 GitHub Auth (Production)

- [x] Configure OpenAuth `GithubProvider`
- [x] In OpenAuth `success` callback, derive namespace from GitHub username (lowercase + validated)
- [x] Implement `makeAuthOpenAuth()` that validates bearer token OR `openskills_access` cookie
- [x] **Test**: token/cookie verification yields `identity`
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.7 Password Auth (Local Development Only)

- [x] Configure OpenAuth `PasswordProvider`
- [x] Minimal flows only (signup/login); uses PasswordUI with console code logging
- [x] Namespace is derived from email local part
- [x] `makeAuthOpenAuth()` validates bearer token OR `openskills_access` cookie (shared with GitHub)
- [x] **Test**: token/cookie verification yields `identity`
- [x] **Verify**: `npm run typecheck && npm test` passes

### 9.8 UI Auth Hooks

- [ ] Add login/logout affordances appropriate to provider
- [ ] Ensure create/edit pages redirect or show auth-required state when unauthenticated
- [ ] (Future) If create/edit becomes AJAX -> use `fetch(..., { credentials: "include" })`
- [ ] **Verify**: `npm run typecheck && npm test` passes

## 10. MCP (Deferred)

- [ ] Add MCP support via `hono-mcp-server` (when package is ready)
- [ ] **Verify**: `npm run typecheck && npm test` passes
