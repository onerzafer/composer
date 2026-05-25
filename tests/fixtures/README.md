# Test fixtures

This directory used to host pre-checked-in fixture projects. **In v0.1, fixtures are programmatic** — `tests/helpers/fixture.ts` exports `makeFixture` and `makeNextProjectFixture` which create throw-away tempdir projects per test.

Rationale: a checked-in fixture would duplicate `@composer/adapter-next`'s content and require manual re-sync on every adapter update. The programmatic approach binds tests to the live adapter source.

If a future fixture genuinely needs to be checked in (e.g., for a snapshot of a previous-version project to test migration codemods in v1+), put it under a versioned subdirectory like `legacy-v0/`.
