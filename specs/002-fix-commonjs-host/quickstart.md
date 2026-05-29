# Quickstart: reproduce & validate CommonJS host support

## Reproduce the bug (pre-fix)

```bash
# A CommonJS host = package.json WITHOUT "type":"module"
TMP=$(mktemp -d) && cd "$TMP"
echo '{"name":"cjs-demo","version":"0.0.0","private":true}' > package.json
npm install zod@3
composer init --bare          # crashes: Cannot read properties of undefined (reading 'Hero')  (exit 4)
```

Root cause: in a CommonJS host the `tsx` loader emits CJS for `design/output.map.ts`, and Node's interop double-wraps the default export, so `byPrimitive` is one level too deep. See `research.md`.

## Manual workaround (what the NestJS test used)

```bash
echo '{"type":"module"}' > design/package.json   # author the workspace as ESM
composer compose welcome                          # now succeeds
```

## Validate the fix (post-implementation)

1. **Loader unwrap (FR-001/002/003)** — in a CommonJS host with a workspace that has NO `design/package.json`, `composer compose <spec>` succeeds and writes the expected file (no `reading '<Primitive>'` crash).
2. **init convention (FR-004)** — `composer init --bare` and `composer init --extends <pkg>` both create `<workspace>/package.json` containing `{"type":"module"}`; an existing workspace `package.json` is not overwritten.
3. **Regression test (FR-005 / SC-001)** — `pnpm vitest run tests/integration/cjs-host.test.ts` passes.
4. **No ESM regression (SC-002)** — `pnpm test` (full suite) stays green.
5. **End-to-end (SC-003)** — the NestJS GraphQL example (simulated-DB + simulated-JWT) builds, boots, returns an authenticated query, and rejects an unauthenticated one. Reference build/run:
   ```bash
   # in the generated NestJS app
   npm i @nestjs/graphql @nestjs/apollo @apollo/server graphql @as-integrations/express5
   # exclude the workspace from the host build (tsconfig "exclude": ["design"])
   npm run build && PORT=3100 node dist/main.js
   curl -s -X POST localhost:3100/graphql -H 'content-type: application/json' \
     -H 'authorization: Bearer dev-secret-token' -d '{"query":"{ users { id name } }"}'
   ```
