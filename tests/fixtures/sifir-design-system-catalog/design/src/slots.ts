// Trimmed stand-in for @sifir/design-system's `src/slots.ts`. The real file
// carries an entry per agent-facing macro (17 of them); two representative
// entries are enough to exercise `catalog/index.ts`'s `SLOT_REGISTRY` export
// (nested one level under the "Macro" family key — see that file).
export const MACRO_SLOTS: Record<string, { importPath: string; exportName: string }> = {
  HeroSection: { importPath: "./macros/hero-section.js", exportName: "HeroSection" },
  CtaSection: { importPath: "./macros/cta-section.js", exportName: "CtaSection" },
};
