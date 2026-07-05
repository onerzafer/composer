// Stand-in for @sifir/design-system's real `src/slots.ts` (there: MACRO_SLOTS).
// Not exercised by the render path in this fixture — present only so the
// `../src/` tree has more than one file, matching the real package's shape.
export const WIDGET_SLOTS = {
  layout: { default: { importPath: "@/layout", exportName: "Default" } },
};
