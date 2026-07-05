# Publishing @composer/* to npm

Composer ships nine public packages from one pnpm workspace, all versioned in
lockstep at `0.1.0-alpha.0`. This doc is the release runbook — read it before
running any publish command.

## The one rule that matters: never `npm publish` a package directly

Every `@composer/*` package depends on its siblings via the pnpm
`workspace:*` protocol (e.g. `@composer/core` depends on
`"@composer/adapter-kit": "workspace:*"`). That protocol string is **not**
valid outside a pnpm workspace — npm has no idea what to do with it.

- `pnpm publish` (and `pnpm pack`) rewrite `workspace:*` to the real resolved
  version (`0.1.0-alpha.0`) at pack time. Safe.
- Plain `npm publish` run inside `packages/<name>` does **not** rewrite
  anything. It would publish a tarball whose `package.json` literally says
  `"@composer/adapter-kit": "workspace:*"`, which breaks `npm install` for
  every consumer. Verified by hand: `npm pack --dry-run` vs `pnpm pack` in
  `packages/adapter-next` — only the pnpm tarball has real version numbers.

**Consequence**: always publish through `changesets` (below) or `pnpm -r
publish`, never `cd packages/x && npm publish`.

## Release flow (changesets)

Changesets is installed at the workspace root (`@changesets/cli`,
`.changeset/config.json`). Config highlights:

- All 9 public packages are `linked` — a version bump to any one bumps all of
  them together, so `@composer/*` stays aligned the way `composer.json`'s
  `engine`/`extends` version pins assume.
- `access: "public"` — required once per package (`@composer/*` is a scoped
  name; npm defaults scoped packages to private).
- `composer-monorepo` (root) and `composer-tests` (the `tests/` fixture
  workspace) are in `ignore` — both are `private: true` and never publish.

Day to day:

```bash
# 1. After a user-facing change, describe it:
pnpm changeset
# → prompts for bump type (all 9 packages move together via `linked`)
# → writes a markdown file to .changeset/

# 2. When ready to cut a release, bump versions + changelogs:
pnpm version-packages
# → runs `changeset version`: bumps package.json versions, rewrites
#   workspace:* internal deps to the new pinned versions, updates
#   CHANGELOG.md per package. Commit this.

# 3. Build + publish:
pnpm release
# → runs `pnpm build && changeset publish`
# → publishes every package whose version doesn't already exist on the
#   registry; skips the rest. Tags each published package
#   `<name>@<version>` in git (push tags separately: `git push --tags`).
```

`changeset version` writes real semver into every internal dependency before
publish ever runs, so the workspace-protocol footgun above is a non-issue
through this flow even though `changeset publish` shells out to plain `npm
publish` per package under the hood.

## Pre-flight checklist (do this before the first real release)

- [ ] `pnpm build && pnpm typecheck && pnpm test` green from a **clean clone**
      (not just the dev sandbox — catches anything accidentally
      gitignored/uncommitted). See verification note below.
- [ ] `npm whoami` shows the intended npm account, and that account is a
      member of the `composer` npm org (or `@composer` scope owner) with
      publish rights.
- [ ] 2FA/automation token configured for `npm publish` (`npm token create
      --read-only=false` or an org-level automation token in CI secrets).
- [ ] `pnpm changeset status --since=main` shows the expected set of pending
      releases.
- [ ] Tag the release in git and push tags after `changeset publish` succeeds.

Everything above this line is repo-fixable and has been done. Everything
below needs the npm-org owner:

- Creating/confirming the `@composer` org on npmjs.com and this machine's
  membership in it.
- Provisioning a publish token (2FA-backed or automation token) and making it
  available to whichever shell/CI runs `pnpm release`.
- Actually running `pnpm changeset` → `pnpm version-packages` → `pnpm
  release` for the v0.1.0 cut, then `git push --tags` and cutting the GitHub
  release notes (tasks.md T108).

## Verification performed for this pass (no publish executed)

- `git clone` into a scratch dir, `pnpm install`, `pnpm -r build`, `pnpm -r
  typecheck`, `pnpm test` — all green from a fresh clone (176/176 tests, one
  isolated rerun showed a single flaky pass in
  `tests/integration/atomic-rollback.test.ts` under full-suite parallelism;
  reran clean on retry and in isolation — pre-existing test-runner flakiness,
  unrelated to packaging, not investigated further here).
- `npm pack --dry-run --json` and `pnpm pack` run per package to inspect
  exact tarball contents against each `files` array — caught
  `@composer/adapter-next` shipping compiled `.js` for its root modules
  (`audit`, `bootstrap`, `index`, `output.map`) without the matching `.d.ts`
  / `.js.map` / `.d.ts.map` siblings; fixed.
- Confirmed no `.npmignore` anywhere overrides the `files` allowlists.
- Confirmed `bin` entrypoints (`@composer/cli`'s `composer`, `@composer/mcp`'s
  `composer-mcp`) carry the `#!/usr/bin/env node` shebang in their compiled
  output.
