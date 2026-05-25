// T061 — adapter-next adapter export.
//
// Aggregates the catalog, output map, audit, and bootstrap into a single
// Adapter object suitable for `composer init --extends @composer/adapter-next`.

import { defineAdapter } from "@composer/adapter-kit";

import { PrimitiveNode, PageMeta, HeroMeta, SectionMeta, CardMeta, CTAMeta, Page, Hero, Section, Card, CTA, SLOT_REGISTRY } from "./catalog/index.js";
import outputMap from "./output.map.js";
import audit from "./audit.js";
import bootstrap from "./bootstrap.js";

export default defineAdapter({
  name: "@composer/adapter-next",
  version: "0.1.0-alpha.0",
  catalog: {
    primitives: {
      Page: { schema: Page, meta: PageMeta },
      Hero: { schema: Hero, meta: HeroMeta },
      Section: { schema: Section, meta: SectionMeta },
      Card: { schema: Card, meta: CardMeta },
      CTA: { schema: CTA, meta: CTAMeta },
    },
    slotRegistry: SLOT_REGISTRY,
    index: PrimitiveNode,
  },
  outputMap,
  audit,
  bootstrap,
});

// Re-exports for convenience
export { PrimitiveNode, Page, Hero, Section, Card, CTA, SLOT_REGISTRY };
export { PageMeta, HeroMeta, SectionMeta, CardMeta, CTAMeta };
