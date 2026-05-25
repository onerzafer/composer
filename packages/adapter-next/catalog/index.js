// T055 — adapter-next catalog index.
//
// Exports the discriminated union (`PrimitiveNode`) consumed by the engine's
// structural validator, plus each primitive's metadata. The engine also picks
// up `SLOT_REGISTRY` here for the `{{slot family variant}}` helper.
import { z } from "zod";
import { Page, PageMeta } from "./primitives/page.js";
import { Hero, HeroMeta } from "./primitives/hero.js";
import { Section, SectionMeta } from "./primitives/section.js";
import { Card, CardMeta } from "./primitives/card.js";
import { CTA, CTAMeta } from "./primitives/cta.js";
export const PrimitiveNode = z.discriminatedUnion("primitive", [
    Page,
    Hero,
    Section,
    Card,
    CTA,
]);
export { Page, PageMeta };
export { Hero, HeroMeta };
export { Section, SectionMeta };
export { Card, CardMeta };
export { CTA, CTAMeta };
export { SLOT_REGISTRY } from "./slot-registry.js";
//# sourceMappingURL=index.js.map