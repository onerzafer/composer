// T020 — Handlebars helpers: json, kebab, slot, indent.
//
// Helpers are registered per-render-invocation against a fresh Handlebars
// instance so per-workspace SlotRegistry doesn't leak across calls.

import type Handlebars from "handlebars";
import type { SlotRegistry } from "@composer/adapter-kit";

export interface HelperBindings {
  json: (value: unknown) => string;
  kebab: (value: unknown) => string;
  slot: (family: unknown, variant: unknown) => string;
  indent: (n: unknown, text: unknown) => string;
  eq: (a: unknown, b: unknown) => boolean;
}

export function makeHelpers(slots: SlotRegistry): HelperBindings {
  return Object.freeze({
    json: (value: unknown): string => JSON.stringify(value),

    kebab: (value: unknown): string =>
      String(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase(),

    slot: (family: unknown, variant: unknown): string => {
      const fam = String(family);
      const variantName = String(variant);
      const familyMap = slots[fam];
      if (!familyMap) throw new Error(`Unknown slot family "${fam}"`);
      const entry = familyMap[variantName];
      if (!entry) {
        throw new Error(`Unknown variant "${variantName}" in slot family "${fam}"`);
      }
      return entry.exportName;
    },

    indent: (n: unknown, text: unknown): string => {
      const count = Number(n) || 0;
      const prefix = " ".repeat(count);
      return String(text)
        .split("\n")
        .map((line, i) => (i === 0 ? line : prefix + line))
        .join("\n");
    },

    eq: (a: unknown, b: unknown): boolean => a === b,
  });
}

/** Register all helpers on a Handlebars instance for one render pass. */
export function registerHelpers(hb: typeof Handlebars, slots: SlotRegistry): void {
  const helpers = makeHelpers(slots);
  hb.registerHelper("json", helpers.json);
  hb.registerHelper("kebab", helpers.kebab);
  hb.registerHelper("slot", helpers.slot);
  hb.registerHelper("indent", helpers.indent);
  hb.registerHelper("eq", helpers.eq);
}
