// T054 — adapter-next slot registry.
//
// One declaration simultaneously: (a) defines the schema enum (via
// `Object.keys(HERO_VARIANTS) as [...]` in hero.ts's z.enum call),
// (b) tells templates what to render via `{{slot "Hero" variant}}`,
// (c) gives TypeScript the union type.
//
// Adding a row → schema accepts it, templates resolve it. Drift impossible
// (README §4 slot-registry pattern).

import type { SlotEntry, SlotRegistry } from "@composer/adapter-kit";

const HERO_VARIANTS = {
  centered: {
    importPath: "@/components/heroes",
    exportName: "CenteredHero",
  },
  overlay: {
    importPath: "@/components/heroes",
    exportName: "OverlayHero",
  },
} as const satisfies Record<string, SlotEntry>;

export const SLOT_REGISTRY: SlotRegistry = {
  Hero: HERO_VARIANTS,
};
