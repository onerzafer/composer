// Parent audit for the alias adapter — imports the same `@/core` alias as
// catalog/index.ts (see this package's tsconfig.json: `"@/*": ["catalog/*"]`).
// Proves the audit-loading call site also resolves adapter-internal aliases
// when this file is loaded as the parent link of the audit chain (see
// @composer/core's pipeline/audit-loader.ts) — not just the catalog loader.
import type { AuditRule } from "@composer/adapter-kit";
import { CORE_LABEL, CORE_VERSION } from "@/core";

const audit: AuditRule = (ws) => {
  const warnings: { path: string | null; message: string }[] = [];
  if (CORE_VERSION !== "1.0.0") {
    warnings.push({ path: null, message: `unexpected ${CORE_LABEL} core version` });
  }
  return { ok: true, errors: [], warnings };
};

export default audit;
