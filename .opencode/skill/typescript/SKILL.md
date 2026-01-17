---
name: typescript
description: Enforce openskills-ai TypeScript conventions (strict ESM, Zod v4 validation, better-result error handling, no casts/any)
license: MIT
compatibility: opencode
metadata:
  audience: engineers
  workflow: implementation
  stack:
    - typescript
    - zod-v4
    - better-result
---

## What I do

- Keep codebase TypeScript-first and strict (noUncheckedIndexedAccess + full strict)
- Enforce ESM-only module semantics (no CommonJS)
- Ensure runtime validation uses Zod v4 schemas from `src/types/`
- Ensure error handling uses `better-result`
- Prevent type-safety regressions by avoiding casts and `any`

## When to use me

Use this when adding or refactoring TypeScript in openskills-ai, especially in:
- `src/core/`
- `src/storage/`
- `src/mcp/`
- `src/http/`

## Non-negotiable rules

### TypeScript configuration

- Full `strict` mode
- `noUncheckedIndexedAccess: true`
- ESM only (package.json `"type": "module"`)

### Validation (Zod v4)

- All runtime schemas live in `src/types/`.
- Validate at boundaries:
  - HTTP params/query/body via hono-openapi validators
  - MCP tool inputs via schemas
  - Persisted data loaded from storage (e.g. `metadata.json`, `user.json`) on read
- Internal core functions accept typed inputs and do not re-validate.

### Error handling (better-result)

- Prefer returning `Result` for fallible operations and wrapping throwing code with `Result.try`.

```ts
import { Result } from "better-result";

const parsed = Result.try(() => JSON.parse(raw));
return parsed.match({
  ok: (value) => Result.ok(value),
  err: (e) => Result.err(e),
});
```

## Anti-patterns (do not do these)

- `any` (including `eslint-disable` or ts-ignore style escapes)
- Double-casting (`as unknown as T`)
- Blind casting from untrusted data (`JSON.parse(...) as MyType`)
- Accepting `unknown` from the outside and passing it inward without Zod parsing
- Stringly-typed errors when a domain error or Result is expected

## Preferred patterns

### 1) Parse untrusted JSON with Zod

```ts
import { Result } from "better-result";
import { schemas } from "../types";

export function parseUserJson(raw: string) {
  return Result.try(() => JSON.parse(raw)).match({
    ok: (value) => Result.try(() => schemas.userProfile.parse(value)),
    err: (e) => Result.err(e),
  })
}
```

### 2) No unchecked indexed access

Assume indexing may return undefined. Use guards.

```ts
const first = items[0]
if (first == null) {
  return Result.err(new Error('no items'))
}
```

### 3) Boundary validation -> typed core call

```ts
// mcp tool handler
const input = schemas.publishSkillInput.parse(rawInput)
return core.publishSkill({ ...input, identity: ctx.identity })
```

## Review checklist

- No casts added (`as ...`) unless it is a narrow, justified, and local cast (rare)
- No `any` introduced
- All external inputs are parsed with `src/types/` Zod schemas
- All fallible operations use `better-result`
- Code compiles under strict + `noUncheckedIndexedAccess`
