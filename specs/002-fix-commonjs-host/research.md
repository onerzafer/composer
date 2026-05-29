# Research: CommonJS host support

Phase 0 output. No open `NEEDS CLARIFICATION` — the root cause was reproduced and isolated during the 2026-05-28 NestJS test.

## Root cause

`@composer/typescript`'s loader and `@composer/core`'s `loadOutputMap`/`loadAuditModule` import workspace TS modules via `tsx`'s `tsImport`. `tsx` chooses ESM vs CommonJS output based on the **nearest `package.json`**. In an ESM repo (`"type": "module"`) it emits ESM, so `export default X` imports as `{ default: X }` and `mod.default` is `X`. In a **CommonJS host** (no `"type": "module"`), `tsx` emits CJS (`module.exports.default = X`), and Node's CJS→ESM interop wraps `module.exports` again as `default` — yielding `{ default: { default: X } }`. The loaders only strip one level (`mod.default ?? mod`), so they return `{ default: X }` and `byPrimitive` is `undefined`.

Observed symptom: `composer compose` → `Cannot read properties of undefined (reading '<Primitive>')` at `resolveOutputs` (`render.ts`), because `outputMap.byPrimitive` was undefined.

## Decision 1 — Shape-aware nested-default unwrap in the loaders

- **Decision**: In `loadOutputMap`, if `exported` lacks `byPrimitive` but `exported.default?.byPrimitive` exists, descend one level. In `loadAuditModule`, if the resolved value isn't a function but `value.default` is, descend.
- **Rationale**: Smallest, host-agnostic fix; corrects the actual interop artifact at the single point of entry; shape-checking guarantees no behaviour change for ESM hosts (whose default already has the expected shape) and no over-unwrapping of a legitimately object-shaped default.
- **Alternatives considered**:
  - *Force ESM transpile in `tsx`* — not reliably controllable per-call across host configs; brittle.
  - *Require every host to set `"type":"module"`* — breaks NestJS/Express CommonJS apps; unacceptable for adoption.
  - *Blindly unwrap any `.default`* — risks mis-unwrapping a valid object that happens to carry a `default` key; rejected in favour of shape-aware descent.

## Decision 2 — `composer init` emits a workspace-local `package.json`

- **Decision**: `init` writes `<workspace>/package.json` = `{"type":"module"}` (when absent) in both `--bare` and `--extends` modes.
- **Rationale**: Makes the workspace authored-as-ESM independent of the host, which is the correct mental model (the workspace is Composer tooling, not host app code). Belt-and-suspenders with Decision 1; also documents intent.
- **Alternatives considered**: Rely solely on the loader unwrap (Decision 1). Kept both: the loader fix covers hand-authored or pre-existing workspaces; the `init` file makes new workspaces self-describing.

## Decision 3 — Regression test in a CommonJS host fixture

- **Decision**: Add `tests/fixtures/cjs-host/` (host `package.json` WITHOUT `"type":"module"` + a minimal workspace) and `tests/integration/cjs-host.test.ts` that composes and asserts the output file is written.
- **Rationale**: Encodes the minimal reproduction so the regression cannot silently return. The full NestJS stack is unnecessary to guard the engine behaviour.
- **Alternatives considered**: An end-to-end NestJS test — too heavy and slow for CI; the interop bug reproduces with a one-primitive workspace.

## Decision 4 — Documentation for backend/CommonJS adoption

- **Decision**: Document (a) the workspace `{"type":"module"}` convention, (b) excluding the workspace dir from the host's `tsconfig` build, (c) for NestJS 11 GraphQL hosts, installing `@as-integrations/express5`.
- **Rationale**: (b) and (c) are host-integration facts learned during the NestJS test that are required to reach a *running* app but are outside the engine's control; documenting them prevents adopter trial-and-error.
