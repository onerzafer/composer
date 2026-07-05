// T020 — Handlebars helpers: json, kebab, slot, indent, renderPrimitive.
//
// Helpers are registered per-render-invocation against a fresh Handlebars
// instance so per-workspace SlotRegistry doesn't leak across calls.

import { readFileSync } from "node:fs";
import type Handlebars from "handlebars";
import type { SlotRegistry } from "@composer/adapter-kit";

export interface HelperBindings {
  json: (value: unknown) => string;
  kebab: (value: unknown) => string;
  slot: (family: unknown, variant: unknown, field?: unknown) => string;
  indent: (n: unknown, text: unknown) => string;
  eq: (a: unknown, b: unknown) => boolean;
}

/**
 * Context needed to let a parent primitive's template delegate rendering of
 * an *embedded* child primitive (no `byPrimitive` output-map entry, e.g.
 * Hero/Section/Card/CTA under adapter-next's Page) to that child's own
 * `<primitive>.<language>.hbs` file — the template-per-primitive model
 * (docs/adapters/authoring.md §2). Without this, every embedded primitive's
 * markup would have to be hand-inlined into the parent's template, which is
 * exactly what the 30-line discipline (constitution V) forbids for anything
 * beyond a handful of primitives.
 */
export interface RenderPrimitiveContext {
  /** Absolute path per `<name>.<language>.hbs`, as collected by workspace layering. */
  templatePaths: Map<string, string>;
  /** Output language of the *parent* render pass (embedded children share it). */
  language: string;
  /** Workspace-relative spec path threaded into the child's `spec_path`. */
  specPath: string;
}

export function makeHelpers(slots: SlotRegistry): HelperBindings {
  return Object.freeze({
    json: (value: unknown): string => JSON.stringify(value),

    kebab: (value: unknown): string =>
      String(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase(),

    slot: (family: unknown, variant: unknown, field?: unknown): string => {
      const fam = String(family);
      const variantName = String(variant);
      const familyMap = slots[fam];
      if (!familyMap) throw new Error(`Unknown slot family "${fam}"`);
      const entry = familyMap[variantName];
      if (!entry) {
        throw new Error(`Unknown variant "${variantName}" in slot family "${fam}"`);
      }
      // Handlebars always appends its options hash as the trailing call
      // argument, so a 2-arg template call `{{slot family variant}}` lands
      // that hash object here — only a genuine string selects a field.
      // Default is "exportName" (component to render); pass "importPath"
      // to resolve where it comes from (e.g. for an import statement).
      const key = typeof field === "string" ? field : "exportName";
      if (key !== "exportName" && key !== "importPath") {
        throw new Error(`Unknown slot field "${key}" — expected "exportName" or "importPath"`);
      }
      return entry[key];
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

/**
 * Build the `renderPrimitive` helper: given an embedded child node (e.g. one
 * entry of `{{#each tree}}` or `{{#each cards}}`), compile-and-run *that
 * primitive's own* template file and splice its output inline. Compiled
 * templates are cached per `templateName` for the lifetime of one render
 * pass (a Section with many Cards would otherwise recompile card.tsx.hbs
 * once per card).
 */
function makeRenderPrimitiveHelper(
  hb: typeof Handlebars,
  ctx: RenderPrimitiveContext,
): (node: unknown) => string {
  const cache = new Map<string, HandlebarsTemplateDelegate>();

  return function renderPrimitive(node: unknown): string {
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      throw new Error("renderPrimitive: expected a primitive node object");
    }
    const primitive = (node as Record<string, unknown>)["primitive"];
    if (typeof primitive !== "string" || primitive.length === 0) {
      throw new Error('renderPrimitive: node is missing a string "primitive" field');
    }

    const templateName = `${primitive.toLowerCase()}.${ctx.language}.hbs`;
    let compiled = cache.get(templateName);
    if (!compiled) {
      const templatePath = ctx.templatePaths.get(templateName);
      if (!templatePath) {
        throw new Error(
          `renderPrimitive: no template for embedded primitive "${primitive}" ` +
            `(expected templates/${templateName})`,
        );
      }
      const source = readFileSync(templatePath, "utf8");
      compiled = hb.compile(source, { strict: false, noEscape: true });
      cache.set(templateName, compiled);
    }

    // Template files end with a trailing newline (POSIX-friendly source
    // files); left in place, splicing this into a parent's `{{#each}}` loop
    // (optionally through `{{indent}}`) would leave a whitespace-only line
    // behind after every embedded primitive. Trim it so composition reads
    // as if the child had been hand-inlined.
    return compiled({ ...(node as Record<string, unknown>), spec_path: ctx.specPath }).replace(
      /\n+$/,
      "",
    );
  };
}

type HandlebarsTemplateDelegate = (context: unknown) => string;

/**
 * Register all helpers on a Handlebars instance for one render pass.
 * `renderPrimitiveCtx` is optional — pass it to enable `{{renderPrimitive
 * node}}` for adapters whose parent templates delegate to per-primitive
 * template files; omit it for a compile pass that has no embedded children
 * to delegate to (calling the helper then throws, same as any unknown
 * partial name would).
 */
export function registerHelpers(
  hb: typeof Handlebars,
  slots: SlotRegistry,
  renderPrimitiveCtx?: RenderPrimitiveContext,
): void {
  const helpers = makeHelpers(slots);
  hb.registerHelper("json", helpers.json);
  hb.registerHelper("kebab", helpers.kebab);
  hb.registerHelper("slot", helpers.slot);
  hb.registerHelper("indent", helpers.indent);
  hb.registerHelper("eq", helpers.eq);
  hb.registerHelper(
    "renderPrimitive",
    renderPrimitiveCtx
      ? makeRenderPrimitiveHelper(hb, renderPrimitiveCtx)
      : (): never => {
          throw new Error(
            "renderPrimitive: helper unavailable — no RenderPrimitiveContext was supplied for this render pass",
          );
        },
  );
}
