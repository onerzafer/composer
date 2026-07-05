// Mirrors @sifir/design-system's real catalog/index.ts: the primitive
// schema + metadata are pulled in via the adapter's OWN `@/registry/*`
// tsconfig alias (declared in this fixture's tsconfig.json) rather than a
// plain relative path — the shape that broke `rewriteAdapterAliases` even
// after `resolveAndCacheParent` started copying `src/` alongside `catalog/`
// (see adapter-extends-parent-src.test.ts). The alias resolves to
// `src/registry/foo.ts`, and the rewrite step's hardcoded allow-list only
// ever accepted catalog/templates/output.map.ts/audit.ts as valid rewrite
// targets, so a `src/`-resolving alias threw a descriptive
// "outside catalog/templates/output.map.ts/audit.ts" error even though
// `src/` was sitting right there in the materialized cache.
import { z } from "zod";
import { Widget, WidgetMeta } from "@/registry/foo";
import { WIDGET_SLOTS } from "../src/slots.js";

export { Widget, WidgetMeta };
export const SLOT_REGISTRY = WIDGET_SLOTS;
export const PrimitiveNode = z.discriminatedUnion("primitive", [Widget]);
