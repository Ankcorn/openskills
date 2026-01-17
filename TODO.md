# openskills-ai Implementation TODO

Based on `spec.md` implementation order. Each section includes tests that run against public APIs.

## 0. Infrastructure & Setup

- [x] `wrangler.jsonc` exists with basic Worker config
- [ ] Add KV namespace binding to `wrangler.jsonc`
- [ ] Add Analytics Engine binding to `wrangler.jsonc`
- [ ] Add static assets config to `wrangler.jsonc` (for UI)
- [ ] Set up Vitest configuration
- [ ] Create test factory `makeCore()` (returns core with memory storage)
- [ ] Create test factory `makeIdentity({ namespace })` (minimal identity object)
- [ ] Create test helper `seedSkill(...)` (publish a skill for test setup)

## 1. Types (`src/types/`)

- [ ] Create namespace validation schema (`^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$`)
- [ ] Create skill name validation schema (`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`)
- [ ] Create semver version schema (with optional pre-release)
- [ ] Create skill metadata schema (namespace, name, created, updated, versions map, latest)
- [ ] Create version info schema (published, size, checksum)
- [ ] Create user profile schema
- [ ] Export derived TypeScript types from schemas

## 2. Storage (`src/storage/`)

### 2.1 Interface & Memory Backend

- [ ] Define `StorageBackend` interface (get, put, delete, list, putIfNotExists?)
- [ ] Implement memory storage backend (for tests)
- [ ] **Test**: `get` returns `null` for missing keys
- [ ] **Test**: `put` then `get` returns the stored value
- [ ] **Test**: `delete` removes key, returns `true`; returns `false` for missing key
- [ ] **Test**: `list` returns keys matching prefix
- [ ] **Test**: `list` returns empty array when no keys match
- [ ] **Test**: `putIfNotExists` returns `true` and stores value when key is absent
- [ ] **Test**: `putIfNotExists` returns `false` and does not overwrite when key exists

### 2.2 File System Backend

- [ ] Implement file system storage backend (for local dev)
- [ ] **Test**: same test suite as memory backend (parameterized)

### 2.3 Cloudflare KV Backend

- [ ] Implement Cloudflare KV storage backend (for production)
- [ ] **Test**: same test suite via Miniflare/Workers Vitest pool (if needed)

## 3. Core (`src/core/`)

Build in order so each feature can be tested via public methods immediately.

### 3.1 Foundation

- [ ] Create core module structure (factory `makeCore({ storage })`)
- [ ] Add domain error types (VERSION_ALREADY_EXISTS, CORRUPT_STORAGE_DATA, FORBIDDEN, NOT_FOUND, INVALID_INPUT)

### 3.2 Publish & Get Content (basic flow)

- [ ] Implement `publishSkill` (creates metadata if new, appends version, stores content)
- [ ] **Test**: publish a skill, then get its content via `getSkillContent`
- [ ] Implement `getSkillContent` (get specific version content)
- [ ] **Test**: `getSkillContent` returns NOT_FOUND for missing skill
- [ ] **Test**: `getSkillContent` returns NOT_FOUND for missing version

### 3.3 Immutability

- [ ] Enforce immutability in `publishSkill` (reject duplicate version)
- [ ] **Test**: publishing the same version twice returns VERSION_ALREADY_EXISTS

### 3.4 Metadata

- [ ] Implement `getSkillMetadata` (validate persisted metadata on read with Zod)
- [ ] **Test**: `getSkillMetadata` returns metadata after publish
- [ ] **Test**: `getSkillMetadata` returns NOT_FOUND for missing skill
- [ ] **Test**: `getSkillMetadata` returns CORRUPT_STORAGE_DATA for invalid JSON

### 3.5 Latest Resolution

- [ ] Implement `getSkillLatest` (resolve highest stable semver, exclude pre-releases)
- [ ] **Test**: returns highest stable version when multiple versions exist
- [ ] **Test**: excludes pre-release versions (e.g., `2.0.0-beta.1` < `1.1.0`)
- [ ] **Test**: returns pre-release if no stable versions exist
- [ ] **Test**: returns NOT_FOUND for missing skill

### 3.6 List Operations

- [ ] Implement `listVersions` (versions of a specific skill)
- [ ] **Test**: returns all versions for a skill
- [ ] **Test**: returns empty array for missing skill (or NOT_FOUND, decide on behavior)
- [ ] Implement `listSkillsInNamespace` (skills in a specific namespace)
- [ ] **Test**: returns skills in namespace
- [ ] **Test**: returns empty array for empty/missing namespace
- [ ] Implement `listSkills` (paginated, all skills)
- [ ] **Test**: returns all skills across namespaces
- [ ] **Test**: pagination works correctly

### 3.7 User Profiles

- [ ] Implement `getProfile` (get user profile, validate on read)
- [ ] **Test**: returns NOT_FOUND for missing profile
- [ ] **Test**: returns CORRUPT_STORAGE_DATA for invalid profile JSON
- [ ] Implement `updateProfile` (self-service, caller can only update own namespace)
- [ ] **Test**: update own profile succeeds, then `getProfile` returns updated data
- [ ] **Test**: update another user's profile returns FORBIDDEN

## 4. HTTP (`src/http/`)

- [ ] Set up Hono app with base path `/api/v1`
- [ ] Create Cloudflare Access JWT middleware (verify `Cf-Access-Jwt-Assertion` header)
- [ ] Add fallback dev auth via `Authorization: Bearer` header
- [ ] `GET /skills` - list all skills (paginated)
- [ ] `GET /skills/@:namespace` - list skills in namespace
- [ ] `GET /skills/@:namespace/:name` - get skill metadata
- [ ] `GET /skills/@:namespace/:name/versions` - list versions
- [ ] `GET /skills/@:namespace/:name/versions/:version` - get specific version content
- [ ] `GET /skills/@:namespace/:name/latest` - get latest version content
- [ ] `PUT /skills/@:namespace/:name/versions/:version` - publish new version (auth required)
- [ ] `GET /users/@:namespace` - get namespace profile
- [ ] `PUT /users/@:namespace` - update caller's own profile (auth required, must match caller)
- [ ] `GET /openapi` - expose OpenAPI document
- [ ] Set up hono-openapi validation with Zod schemas
- [ ] Enforce max skill content size (256 KiB default)

## 5. Analytics

- [ ] Create analytics service for Workers Analytics Engine
- [ ] Define event shape (index1, blobs, doubles)
- [ ] Write download event on skill read (HTTP)
- [ ] Add SQL query helper for analytics API

## 6. Web UI (Optional)

- [ ] Set up Tailwind CSS with CLI
- [ ] Configure color palette (oklch tokens from spec)
- [ ] Set up Space Mono font
- [ ] Create layout component with Hono JSX
- [ ] Home page (search + top skills + create button)
- [ ] Namespace profile page (skills list)
- [ ] Skill detail page (rendered markdown + edit affordance)
- [ ] Set up Workers static assets serving
- [ ] Add client components for interactivity (copy-to-clipboard)

## 7. MCP (Deferred)

- [ ] Add MCP support via `hono-mcp-server` (when package is ready)
