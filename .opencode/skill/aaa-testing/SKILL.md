---
name: aaa-testing
description: Write clear Arrange-Act-Assert (AAA) unit tests for openskills-ai core using Vitest
license: MIT
compatibility: opencode
metadata:
  audience: engineers
  workflow: testing
  stack:
    - vitest
    - zod-v4
    - better-result
---

## What I do

- Turn vague requirements into focused AAA tests against `src/core/*`
- Prefer behavior assertions (outputs/effects) over internal implementation details
- Keep tests fast by using in-memory storage and deterministic clocks
- Validate persisted data on read (Zod v4) so tests never need type casts

## When to use me

Use this when writing or reviewing tests for the core registry logic.

- Scope: `core/` only (do not test HTTP routes)
- Runner: Vitest

## Core rules (firm)

- Tests read like a spec: Arrange, Act, Assert.
- One behavior per test.
- No double-casting (`as unknown as ...`) and no `any` escape hatches.
- If code reads from storage, validate the stored JSON with Zod before using it.

## Project testing approach

- Test the system at the `core` boundary:
  - `core.publishSkill(...)`
  - `core.getSkillContent(...)`
  - `core.getSkillLatest(...)`
  - `core.listSkills(...)`
  - `core.updateProfile(...)`
- Use the memory storage backend by default.
- Avoid asserting on storage key shapes unless the behavior depends on it.

## AAA template

```ts
import { describe, it, expect } from 'vitest'

describe('feature', () => {
  it('does X when Y', async () => {
    // Arrange

    // Act

    // Assert
  })
})
```

## Arrange

- Create only what the test needs.
- Use factories/builders:
  - `makeCore()` - returns a core instance with memory storage
  - `makeIdentity({ namespace })` - a minimal identity object that core can authorize
  - `seedSkill(...)` when you need pre-existing skills
- Prefer explicit inputs over shared mutable fixtures.

## Act

- Perform one action:
  - one core call
  - or one Result operation
- If the act takes multiple steps, split the test.

## Assert

- Assert on observable behavior:
  - returned values
  - returned metadata
  - errors (prefer domain errors over string matching)
  - effects at the boundary (e.g. storage writes) only when required

## Patterns specific to this repo

### 1) Immutability (publishing existing version returns conflict)

```ts
import { describe, it, expect } from 'vitest'

describe('publishSkill', () => {
  it('rejects publishing the same version twice', async () => {
    // Arrange
    const core = makeCore()
    const identity = makeIdentity({ namespace: 'acme' })

    await core.publishSkill({
      namespace: 'acme',
      name: 'docker-compose',
      version: '1.0.0',
      content: '# v1',
      identity,
    })

    // Act
    const second = await core.publishSkill({
      namespace: 'acme',
      name: 'docker-compose',
      version: '1.0.0',
      content: '# v1 overwritten',
      identity,
    })

    // Assert
    expect(second.ok).toBe(false)
    expect(second.error.code).toBe('VERSION_ALREADY_EXISTS')
  })
})
```

### 2) Latest resolution (stable releases only)

```ts
describe('getSkillLatest', () => {
  it('returns the highest stable semver version', async () => {
    // Arrange
    const core = makeCore()
    const identity = makeIdentity({ namespace: 'acme' })

    await core.publishSkill({ namespace: 'acme', name: 'x', version: '1.0.0', content: 'v1', identity })
    await core.publishSkill({ namespace: 'acme', name: 'x', version: '2.0.0-beta.1', content: 'beta', identity })
    await core.publishSkill({ namespace: 'acme', name: 'x', version: '1.1.0', content: 'v1.1', identity })

    // Act
    const latest = await core.getSkillLatest({ namespace: 'acme', name: 'x' })

    // Assert
    expect(latest.ok).toBe(true)
    expect(latest.value).toBe('v1.1')
  })
})
```

### 3) Stored data validation (read path validates JSON)

```ts
describe('metadata read', () => {
  it('fails with a typed error if metadata.json is invalid', async () => {
    // Arrange
    const { core, storage } = makeCoreWithStorage()

    await storage.put('acme/x/metadata.json', '{"not":"valid-metadata"}')

    // Act
    const res = await core.getSkillMetadata({ namespace: 'acme', name: 'x' })

    // Assert
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('CORRUPT_STORAGE_DATA')
  })
})
```

### 4) Profile update is self-service

```ts
describe('updateProfile', () => {
  it('rejects updates to another namespace profile', async () => {
    // Arrange
    const core = makeCore()
    const identity = makeIdentity({ namespace: 'alice' })

    // Act
    const res = await core.updateProfile({
      namespace: 'bob',
      profile: { displayName: 'Bob' },
      identity,
    })

    // Assert
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('FORBIDDEN')
  })
})
```

## Anti-patterns

- Testing HTTP wiring instead of core behavior.
- Multiple Acts in one test (setup is fine; actions are not).
- Asserting exact error strings when a typed domain error is available.
- Using `as unknown as` to force a type.
