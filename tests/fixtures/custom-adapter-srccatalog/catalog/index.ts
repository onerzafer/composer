// Mirrors @sifir/design-system's real catalog/index.ts: this file lives in
// `catalog/` but the actual primitive schema + metadata are imported from a
// sibling `../src/` tree via a plain relative import — NOT from inside
// `catalog/` itself. This is exactly the shape that broke
// `resolveAndCacheParent`: it copied `catalog/` (and `templates/`) into
// `.composer/cache/parent/<name>/` but not `src/`, so the cached copy's
// `../src/catalog` import resolved to a directory that didn't exist,
// throwing at compile-catalog time.
import { z } from "zod";
import { Widget, WidgetMeta } from "../src/catalog/index.js";
import { WIDGET_SLOTS } from "../src/slots.js";

export { Widget, WidgetMeta };
export const SLOT_REGISTRY = WIDGET_SLOTS;
export const PrimitiveNode = z.discriminatedUnion("primitive", [Widget]);
