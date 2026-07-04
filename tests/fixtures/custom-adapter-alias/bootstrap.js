// Hand-authored (not built from .ts — this fixture ships it directly, same
// as a published adapter's compiled bootstrap.js) so `init --extends` can
// run its sample compose against the `Note` primitive without any build step.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function bootstrap(ctx) {
  const spec = {
    primitive: "Note",
    id: "welcome",
    body: "Hello from an alias-using adapter.",
  };
  const specPath = join(ctx.workspaceRoot, "specs", "welcome.json");
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n", "utf8");
}

export default bootstrap;
