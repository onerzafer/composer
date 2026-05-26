// Cross-spec audit — every Config name must be unique across the workspace.
import type { AuditRule } from "@composer/adapter-kit";

const audit: AuditRule = (ws) => {
  const seen = new Map<string, string>();
  const errors: { spec_id: string | null; path: string | null; message: string }[] = [];
  for (const spec of ws.specs) {
    const json = spec.json as { primitive?: string; name?: string };
    if (json.primitive !== "Config" || typeof json.name !== "string") continue;
    const prior = seen.get(json.name);
    if (prior) {
      errors.push({
        spec_id: spec.id,
        path: `specs/${spec.id}.json`,
        message: `duplicate Config name "${json.name}" (also defined in ${prior})`,
      });
    } else {
      seen.set(json.name, `specs/${spec.id}.json`);
    }
  }
  if (errors.length > 0) return { ok: false, errors, warnings: [] };
  return { ok: true, errors: [], warnings: [] };
};

export default audit;
