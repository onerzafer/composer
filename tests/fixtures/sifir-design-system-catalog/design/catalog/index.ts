/**
 * catalog/index.ts — Composer adapter catalog for @sifir/design-system.
 *
 * Ports the PageSchema STRUCTURAL DOCTRINE from sifir-ai's cli
 * (cli/src/registry/catalog/index.ts) into Composer adapter form, per
 * composer/docs/adapters/authoring.md §1 ("Catalog Is the API"):
 *
 *   - one strict Zod object per primitive, `primitive` literal discriminator
 *   - a `PrimitiveMeta` sidecar per primitive (intent / whenToUse / …)
 *   - a `PrimitiveNode` discriminated union — what Composer's
 *     `structuralValidate` phase parses the agent's JSON against.
 *
 * SCOPE — this file adds ONLY the composer-shaped root envelope. The
 * primitive VOCABULARY (macros, layout, atoms, forms) is NOT redefined
 * here: it's imported from ../src/catalog, this repo's existing
 * byte-for-byte port of cli's registry catalog (see git history: "scaffold
 * design-system repo from cli registry lib and catalog"). That import also
 * carries a required side effect — `_registerPrimitiveNodeForRecursion` —
 * which wires `Section` / `Container` / etc.'s recursive `children` arrays
 * to the real primitive union; without it any page containing a nested
 * primitive throws at parse time (see layout.ts).
 *
 * What's ported here is cli's `PageSchema` — renamed `Page` and given a
 * `primitive: z.literal("Page")` discriminator so it slots into a Composer
 * catalog union — together with EVERY rule its `.superRefine()` enforces:
 *
 *   - hero-first            (C1 — first top-level node must be HeroSection)
 *   - macro-only roots       (every top-level tree node must be a macro)
 *   - CTA cap                (≤2 props.ctas entries per page)
 *   - emphasis cap           (≤3 emphasized Content segments per page)
 *   - section-width rhythm   (≤3 distinct widths, ≥50% anchor majority,
 *                             hero ≥ anchor, no back-to-back interrupts)
 *   - Container-wrap ban     (Card/Form/BentoGrid/Masonry can't be a
 *                             direct Section child — must wrap in Container)
 *   - StickyStack root-only  (must be a page-root peer, never nested)
 *   - Hero-at-root ban       (bare Hero must be wrapped in a Section)
 *   - closer terminal law    (C2 — a page-tier CtaSection must be the
 *                             LAST top-level node; at most one per page)
 *
 * Every rule below is a line-for-line port of cli's implementation —
 * same constants, same helper functions, same error messages — so a page
 * that's valid/invalid under cli's PageSchema is valid/invalid here too.
 * See tests/catalog/ for the negative-fixture suite that pins this down.
 *
 * `@composer/adapter-kit` is NOT a published/installable dependency (it's
 * workspace-only inside the composer monorepo — `npm view` 404s), so the
 * `PrimitiveMeta` shape is declared locally below, structurally identical
 * to composer/packages/adapter-kit/src/types.ts. Swap the local type for
 * the real import once the package ships to a registry this repo can
 * install from.
 *
 * Deliberately NOT built here (out of scope for this port): templates/,
 * output.map.ts, bootstrap.ts, and the `defineAdapter(...)` aggregate
 * `index.ts` authoring.md describes for a publishable adapter package.
 * This file is the catalog layer only — see ./audit.ts (sibling file,
 * same directory) for the audit-chain layer: it assembles every ported
 * rule under ../src/audits into the single `AuditRule` a `defineAdapter`
 * call will eventually wire in as `audit`.
 */

import { z } from "zod";

import {
  PrimitiveNode as PageTreeNode,
  catalog as sifirCatalog,
  type CatalogEntry,
} from "../src/catalog";
import { MACRO_SLOTS } from "../src/slots";
import type { SlotRegistry } from "@composer/adapter-kit";

// ---------------------------------------------------------------------------
// Local mirror of @composer/adapter-kit's public PrimitiveMeta (see file
// header). Kept structurally identical so swapping in the real dependency
// later is a type-only no-op.
// ---------------------------------------------------------------------------

export interface PrimitiveMeta {
  primitive: string;
  version: string;
  intent: string;
  whenToUse: string;
  whenNotToUse: string[];
  fieldGuidance: Record<string, string>;
  examples: unknown[];
  pure?: boolean;
  effects?: string[];
}

// ---------------------------------------------------------------------------
// Meta for the whole existing vocabulary — mechanically derived from
// ../src/catalog's `CatalogEntry` records (58 primitives: macros, layout,
// atoms, forms) rather than hand-authored, so this stays in sync with the
// registry automatically. `PageMeta` (below) is the one hand-authored
// entry — it describes the primitive this file actually adds.
// ---------------------------------------------------------------------------

function toPrimitiveMeta(entry: CatalogEntry): PrimitiveMeta {
  return {
    primitive: entry.primitive,
    version: "1.0.0",
    intent: entry.intent,
    whenToUse: entry.whenToUse,
    // cli's CatalogEntry carries a single whenNotToUse string; Composer's
    // PrimitiveMeta wants an array — wrap it rather than reshape the
    // source data.
    whenNotToUse: [entry.whenNotToUse],
    fieldGuidance: entry.fieldGuidance,
    examples: entry.examples.map((e) => e.value),
  };
}

export const VOCABULARY_META: Readonly<Record<string, PrimitiveMeta>> =
  Object.freeze(
    Object.fromEntries(sifirCatalog.map((e) => [e.primitive, toPrimitiveMeta(e)])),
  );

// ---------------------------------------------------------------------------
// Doctrine constants — verbatim from cli/src/registry/catalog/index.ts.
// ---------------------------------------------------------------------------

// Cap on inline emphasis treatments per page. Emphasis is a focal-point
// device — too many on one page dilutes hierarchy and overwhelms the reader.
// 3 is the working ceiling: one in the hero, optionally one in body, one
// in a CTA. Beyond that, the page is asking for a re-think, not more
// markup. Enforced via Page's superRefine.
const EMPHASIS_LIMIT_PER_PAGE = 3;

// CTA is the page's call-to-action — focal-point primitive, not a generic
// button. 2 is the ceiling: typically a hero CTA + a closing CTA (footer or
// mid-page conversion). Form submits, nav links, "Read more" stay as Button
// and don't count toward this cap.
const CTA_LIMIT_PER_PAGE = 2;

// Count emphasis segments inside a single `Content` value (shared.ts).
// Content is `string | ContentSegment[]`, where each segment is either a
// plain string or an `{ text, emphasis }` object. Only the object form
// carries an emphasis treatment. A plain-string Content (the common case)
// contributes 0.
function countEmphasisInContent(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  let count = 0;
  for (const seg of content) {
    if (seg !== null && typeof seg === "object" && "emphasis" in seg) {
      count++;
    }
  }
  return count;
}

function countEmphasizedSegments(node: unknown): number {
  if (node === null || typeof node !== "object") return 0;
  let count = 0;
  // Atoms with content arrays carry their segments at the node root.
  count += countEmphasisInContent((node as { content?: unknown }).content);
  // Macros keep emphasis under Content-typed props (notably `heading` on
  // HeroSection / CtaSection). Macro nodes have no `content`, no
  // `children` — scan props for Content-typed entries. `content` is read
  // at the node root above; skip it here so a node carrying both isn't
  // double-counted.
  const props = (node as { props?: unknown }).props;
  if (props !== null && typeof props === "object") {
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (key === "content") continue;
      // Multi-hero HeroSection keeps per-slide headings under
      // props.slides[].heading — each a Content value. slides is an
      // array of slide OBJECTS, not segments, so the generic
      // countEmphasisInContent below would find no top-level `emphasis`
      // key. Descend into each slide's heading instead.
      if (key === "slides" && Array.isArray(value)) {
        for (const slide of value) {
          if (slide !== null && typeof slide === "object") {
            count += countEmphasisInContent((slide as { heading?: unknown }).heading);
          }
        }
        continue;
      }
      count += countEmphasisInContent(value);
    }
  }
  // Recurse into children.
  if ("children" in node && Array.isArray((node as { children?: unknown }).children)) {
    for (const child of (node as { children: unknown[] }).children) {
      count += countEmphasizedSegments(child);
    }
  }
  return count;
}

function countCTAs(node: unknown): number {
  if (node === null || typeof node !== "object") return 0;
  let count = 0;
  // Real CTAs live in `props.ctas: CtaSpec[]` arrays on macro nodes
  // (HeroSection.props.ctas, CtaSection.props.ctas). Count those entries.
  const props = (node as { props?: { ctas?: unknown; slides?: unknown } }).props;
  if (props !== null && typeof props === "object" && Array.isArray(props.ctas)) {
    count += props.ctas.length;
  }
  // Multi-hero HeroSection (presentation "carousel"/"scroll-stack") carries
  // its CTAs per-slide on props.slides[].ctas — mutually exclusive with the
  // inline props.ctas path above, so this is purely additive (no
  // double-count). Macro nodes have no `children`, so the recursion below
  // never reaches slides; count them here.
  if (props !== null && typeof props === "object" && Array.isArray(props.slides)) {
    for (const slide of props.slides) {
      if (slide !== null && typeof slide === "object" && Array.isArray((slide as { ctas?: unknown }).ctas)) {
        count += (slide as { ctas: unknown[] }).ctas.length;
      }
    }
  }
  if ("children" in node && Array.isArray((node as { children?: unknown }).children)) {
    for (const child of (node as { children: unknown[] }).children) {
      count += countCTAs(child);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Section-width rhythm checker — derived from award-winning page composition
// (cli: docs/raw/research/2026-04-17-award-winning-layout-pattern-research.md):
//
//   1. Top pages use ≤3 distinct section widths. More than 3 reads as
//      chaotic — the page lacks a primary frame.
//   2. ≥50% of body sections share one "anchor" width. The anchor is the
//      page's home width; everything else is a deliberate exception.
//   3. Heroes establish the outermost frame. A hero that's narrower than
//      the body majority inverts hierarchy and reads as a mis-staged page.
//   4. Interrupts (sections at non-anchor widths) should not stack. Two
//      consecutive non-anchor sections look like two unrelated breaks
//      back-to-back; alternating with a return to the anchor preserves
//      rhythm.
//
// Smallest-to-largest order: narrow < default < wide < full.
// ---------------------------------------------------------------------------

const SECTION_WIDTH_ORDER: Readonly<Record<string, number>> = {
  narrow: 0,
  default: 1,
  wide: 2,
  full: 3,
};
const MAX_DISTINCT_WIDTHS = 3;
const ANCHOR_MAJORITY_THRESHOLD = 0.5;

function topLevelSectionWidths(tree: unknown[]): string[] {
  const widths: string[] = [];
  for (const node of tree) {
    if (node === null || typeof node !== "object") continue;
    if ((node as { primitive?: unknown }).primitive !== "Section") continue;
    const props = (node as { props?: { width?: unknown } }).props;
    const w = typeof props?.width === "string" ? props.width : "default";
    widths.push(w);
  }
  return widths;
}

// ---------------------------------------------------------------------------
// Tree-placement check — primitives in this list hook page-level scroll
// triggers and MUST live at the page root. Nesting them inside any other
// primitive breaks the scroll context. Walks each top-level entry's
// subtree and rejects any nested occurrence.
// ---------------------------------------------------------------------------

const ROOT_ONLY_PRIMITIVES = ["StickyStack"] as const;

function subtreeHasPrimitive(node: unknown, target: string): boolean {
  if (node === null || typeof node !== "object") return false;
  const obj = node as { primitive?: unknown; children?: unknown };
  if (obj.primitive === target) return true;
  if (Array.isArray(obj.children)) {
    for (const c of obj.children) {
      if (subtreeHasPrimitive(c, target)) return true;
    }
  }
  return false;
}

function findNestedRootOnly(tree: unknown[]): string[] {
  const found: string[] = [];
  for (const top of tree) {
    if (typeof top !== "object" || top === null) continue;
    const obj = top as { children?: unknown };
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) {
        for (const target of ROOT_ONLY_PRIMITIVES) {
          if (subtreeHasPrimitive(child, target) && !found.includes(target)) {
            found.push(target);
          }
        }
      }
    }
  }
  return found;
}

interface RhythmIssue { message: string; }

function checkSectionRhythm(widths: string[]): RhythmIssue[] {
  const issues: RhythmIssue[] = [];
  // Pages with 0-1 sections are exempt — no rhythm to evaluate.
  if (widths.length < 2) return issues;

  const counts: Record<string, number> = {};
  for (const w of widths) counts[w] = (counts[w] ?? 0) + 1;
  const distinct = Object.keys(counts);
  const total = widths.length;

  // Rule 1 — Max 3 distinct widths per page.
  if (distinct.length > MAX_DISTINCT_WIDTHS) {
    issues.push({
      message:
        `Too many distinct section widths on this page (${distinct.length}: ${distinct.join(", ")}). ` +
        `Award-winning pages use ≤${MAX_DISTINCT_WIDTHS} widths to preserve frame rhythm. ` +
        `Consolidate to a primary anchor width with 1-2 deliberate exceptions.`,
    });
  }

  // Determine anchor: the most-used width (ties broken by arbitrary first
  // — they're equally valid anchors in a 50-50 split).
  const anchor = distinct.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  const anchorShare = counts[anchor] / total;

  // Rule 2 — Anchor must hold ≥50% of sections.
  if (anchorShare < ANCHOR_MAJORITY_THRESHOLD) {
    const formatted = distinct
      .map((w) => `${w}×${counts[w]}`)
      .join(", ");
    issues.push({
      message:
        `No clear anchor width — sections are scattered: ${formatted}. ` +
        `Award-winning pages have one width holding ≥${Math.round(ANCHOR_MAJORITY_THRESHOLD * 100)}% of sections (the page's "home"); the rest are exceptions. ` +
        `Pick one anchor and converge the body to it.`,
    });
  }

  // Rule 3 — Hero (first section) should be at least as wide as the anchor.
  // Heroes establish the outermost frame; narrower-than-body heroes invert
  // hierarchy. Skipped if the hero IS the anchor or if there are 0 sections.
  const heroWidth = widths[0];
  const heroOrder = SECTION_WIDTH_ORDER[heroWidth] ?? -1;
  const anchorOrder = SECTION_WIDTH_ORDER[anchor] ?? -1;
  if (heroOrder < anchorOrder) {
    issues.push({
      message:
        `Hero section width "${heroWidth}" is narrower than the page's anchor width "${anchor}". ` +
        `Heroes establish the page's outermost frame — a hero narrower than the body reads as inverted hierarchy. ` +
        `Match the hero to the anchor or go wider.`,
    });
  }

  // Rule 4 — No two consecutive non-anchor sections.
  // An exception followed immediately by another exception reads as two
  // disconnected interrupts; the page never "returns home". Excludes the
  // hero (position 0) since heroes are expected to differ from the body.
  for (let i = 1; i < widths.length - 1; i++) {
    if (widths[i] !== anchor && widths[i + 1] !== anchor) {
      issues.push({
        message:
          `Sections ${i + 1} and ${i + 2} are both non-anchor widths (${widths[i]} → ${widths[i + 1]}) back-to-back. ` +
          `Award-winning pages alternate: an exception section is paired with a return to the anchor (${anchor}) before the next exception. ` +
          `Insert a "${anchor}"-width section between, or change one of the two to "${anchor}".`,
      });
      break; // surface only the first violation to avoid noise
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Page — the composer-shaped root primitive. Structurally cli's PageSchema
// (slug/title/navLabel/navOrder/metadata/tree) plus a `primitive: "Page"`
// discriminator so it slots into this catalog's discriminated union.
// `tree` accepts the FULL existing vocabulary via `PageTreeNode` (imported
// from ../src/catalog) — not redefined here.
// ---------------------------------------------------------------------------

export const Page = z.object({
  primitive: z.literal("Page"),
  slug: z.string().regex(/^\/([a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*)?$/, {
    message: "Page slug must be a Next.js route path starting with '/' (e.g. '/', '/iletisim', '/blog/post').",
  }),
  title: z.string().min(1).max(120),
  // Short label for nav menus + footer links — distinct from `title` (SEO/tab).
  navLabel: z.string().min(1).max(30),
  // Position in nav menus (header + footer). Lower number = earlier.
  navOrder: z.number().int().min(0).max(99).default(99).optional(),
  // Per-page SEO surface. Optional — same shape as cli's PageSchema.
  metadata: z.object({
    description: z.string().min(50).max(160).optional(),
    ogImage: z.string().regex(
      /^\/images\/[a-z0-9][a-z0-9-]*$/,
      "metadata.ogImage must be /images/<slug> in lowercase-kebab — no extension",
    ).optional(),
    keywords: z.array(z.string().min(2).max(40)).max(10).optional(),
    noIndex: z.boolean().optional(),
  }).strict().optional(),
  tree: z.array(PageTreeNode).min(1, {
    message: "Page tree must contain at least one primitive (a Section).",
  }),
}).strict().superRefine((page, ctx) => {
  let emphasisTotal = 0;
  let ctaTotal = 0;
  for (const node of page.tree) {
    emphasisTotal += countEmphasizedSegments(node);
    ctaTotal += countCTAs(node);
  }
  if (emphasisTotal > EMPHASIS_LIMIT_PER_PAGE) {
    ctx.addIssue({
      code: "custom",
      path: ["tree"],
      message: `Too many emphasis treatments on this page: ${emphasisTotal} found, max ${EMPHASIS_LIMIT_PER_PAGE} allowed. Emphasis is a focal-point device — pick the words that truly carry the page.`,
    });
  }
  if (ctaTotal > CTA_LIMIT_PER_PAGE) {
    ctx.addIssue({
      code: "custom",
      path: ["tree"],
      message: `Too many CTAs on this page: ${ctaTotal} found, max ${CTA_LIMIT_PER_PAGE} allowed. CTA is the page's call-to-action — for form submits, nav, or 'Read more', use Button instead.`,
    });
  }

  // Section-width rhythm — runs the four-rule checker (max distinct,
  // anchor majority, hero hierarchy, no consecutive interrupts).
  const widths = topLevelSectionWidths(page.tree);
  for (const issue of checkSectionRhythm(widths)) {
    ctx.addIssue({ code: "custom", path: ["tree"], message: issue.message });
  }

  // Root-only primitives — they hook page-level scroll triggers; nesting
  // breaks the scroll context.
  for (const prim of findNestedRootOnly(page.tree)) {
    ctx.addIssue({
      code: "custom",
      path: ["tree"],
      message:
        `${prim} must be at the page root (peer to Section), not nested inside another ` +
        `primitive. It hooks page-level scroll triggers — nesting breaks the scroll context. ` +
        `Move it out and let each step be a child Section directly.`,
    });
  }

  // Hero-at-root ban — Hero is content inside the first Section, not a
  // top-level peer.
  for (let i = 0; i < page.tree.length; i++) {
    const node = page.tree[i];
    if (node !== null && typeof node === "object" && (node as { primitive?: unknown }).primitive === "Hero") {
      ctx.addIssue({
        code: "custom",
        path: ["tree", i, "primitive"],
        message:
          `Hero must be wrapped in a Section, not placed at the page tree root. ` +
          `Section provides the semantic wrapper, scroll-spy, entrance machinery, and ` +
          `codegen-resolved data-header-theme. Wrap as: ` +
          `Section { id: "hero", width: "full", spacing: "none", background: "none", children: [Hero{...}] }.`,
      });
    }
  }

  // Macro-only top level — every top-level tree node MUST be a macro
  // primitive. Macros hide structural decisions (Section wrap, Container
  // wrap, slot rules) and make audits invariant-by-construction.
  const MACRO_PRIMITIVES = new Set<string>([
    "HeroSection", "MenuSection", "FaqSection",
    "ContactSection", "StorySection", "TrustStripSection",
    "GallerySection", "TeamSection", "CtaSection",
    "TestimonialsSection", "LogoWallSection", "PricingSection",
    "ProcessSection", "OfferingsSection", "BeforeAfterSection",
    "LocationsSection", "ProjectsSection",
  ]);
  for (let i = 0; i < page.tree.length; i++) {
    const node = page.tree[i];
    if (node === null || typeof node !== "object") continue;
    const prim = (node as { primitive?: unknown }).primitive;
    if (typeof prim !== "string") continue;
    if (!MACRO_PRIMITIVES.has(prim)) {
      ctx.addIssue({
        code: "custom",
        path: ["tree", i, "primitive"],
        message:
          `Top-level tree nodes must be macro primitives. Got "${prim}". ` +
          `Macros (HeroSection, MenuSection, FaqSection, ContactSection, ` +
          `StorySection, TrustStripSection, GallerySection, TeamSection, CtaSection, ` +
          `TestimonialsSection, LogoWallSection, PricingSection, ProcessSection, ` +
          `OfferingsSection, BeforeAfterSection, LocationsSection, ProjectsSection) ` +
          `hide structural wrapping and make audits invariant-by-construction. ` +
          `If no macro fits the gesture, escalate via .sifir/notes/structural-gaps.md — ` +
          `do NOT compose Section/Container/etc. at the page root.`,
      });
    }
  }

  // Section direct-children ban — content primitives that bring their own
  // width/spacing concerns (Card, Form, BentoGrid, Masonry) MUST live
  // inside a Container child, not directly under a Section.
  const FORBIDDEN_AS_SECTION_CHILD = ["Card", "Form", "BentoGrid", "Masonry"] as const;
  type ForbiddenChild = typeof FORBIDDEN_AS_SECTION_CHILD[number];
  function checkSectionChildren(node: unknown, path: ReadonlyArray<string | number>): void {
    if (!node || typeof node !== "object") return;
    const n = node as { primitive?: unknown; children?: unknown[] };
    if (n.primitive === "Section" && Array.isArray(n.children)) {
      for (let i = 0; i < n.children.length; i++) {
        const child = n.children[i];
        if (child === null || typeof child !== "object") continue;
        const childPrim = (child as { primitive?: unknown }).primitive;
        if (typeof childPrim !== "string") continue;
        if (FORBIDDEN_AS_SECTION_CHILD.includes(childPrim as ForbiddenChild)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "children", i, "primitive"],
            message:
              `${childPrim} cannot be a direct child of Section. ` +
              `Wrap it in a Container so the section's width/spacing chrome ` +
              `applies. Canonical: Section { children: [Container { children: [${childPrim}{...}] }] }.`,
          });
        }
      }
    }
    if (Array.isArray(n.children)) {
      for (let i = 0; i < n.children.length; i++) {
        checkSectionChildren(n.children[i], [...path, "children", i]);
      }
    }
  }
  for (let i = 0; i < page.tree.length; i++) {
    checkSectionChildren(page.tree[i], ["tree", i]);
  }

  // C1 — Page-level composition rule. Every page must open with
  // HeroSection (the page-opener contract).
  if (page.tree.length > 0) {
    const first = page.tree[0];
    const firstPrim = first !== null && typeof first === "object"
      ? (first as { primitive?: unknown }).primitive
      : undefined;
    if (firstPrim !== "HeroSection") {
      ctx.addIssue({
        code: "custom",
        path: ["tree", 0, "primitive"],
        message:
          `First top-level node must be HeroSection (got "${String(firstPrim)}"). Every page opens with a hero — ` +
          `home gets tier:"page" (full viewport); sub-pages get tier:"sub" (banner). Codegen infers tier from slug if unset.`,
      });
    }
  }

  // C2 — Closer terminal law (mirror of C1). A page-tier CtaSection is the
  // page's structural CLOSER — a position, not a component. If present it
  // must be the LAST top-level node, and a page carries at most one. `tier`
  // unset resolves to "page" (same default the cross-page audits use), so
  // an untiered CtaSection counts as page-tier here.
  const pageTierCloserIndices: number[] = [];
  for (let i = 0; i < page.tree.length; i++) {
    const node = page.tree[i];
    if (node === null || typeof node !== "object") continue;
    const n = node as { primitive?: unknown; props?: { tier?: unknown } };
    if (n.primitive !== "CtaSection") continue;
    const tier = (n.props?.tier as string | undefined) ?? "page";
    if (tier === "page") pageTierCloserIndices.push(i);
  }
  if (pageTierCloserIndices.length > 1) {
    for (const i of pageTierCloserIndices.slice(0, -1)) {
      ctx.addIssue({
        code: "custom",
        path: ["tree", i, "primitive"],
        message:
          `At most ONE page-tier CtaSection per page — found ${pageTierCloserIndices.length} ` +
          `(tier unset counts as "page"). The closer is a structural position, not a reusable ` +
          `band: keep the final CtaSection as THE closer and remove this one, or set ` +
          `tier:"sub" here if a quieter mid-page CTA band is truly intended.`,
      });
    }
  }
  const terminalCloser = pageTierCloserIndices[pageTierCloserIndices.length - 1];
  if (terminalCloser !== undefined && terminalCloser !== page.tree.length - 1) {
    ctx.addIssue({
      code: "custom",
      path: ["tree", terminalCloser, "primitive"],
      message:
        `A page-tier CtaSection is the page's CLOSER — it must be the LAST top-level node ` +
        `(found at tree[${terminalCloser}] with ${page.tree.length - 1 - terminalCloser} section(s) after it; ` +
        `tier unset counts as "page"). A page that keeps going after its closer reads as a ` +
        `shuffled deck. Move this CtaSection to the end of \`tree\`, or set tier:"sub" if it ` +
        `is meant as a quieter mid-page band rather than the closer.`,
    });
  }
});
export type Page = z.infer<typeof Page>;

export const PageMeta: PrimitiveMeta = {
  primitive: "Page",
  version: "1.0.0",
  intent:
    "Top-level Composer document — one per route. Carries the page's SEO " +
    "surface and its tree of macro sections, structurally validated against " +
    "the full sifir composition doctrine (hero-first, macro-only roots, " +
    "CTA/emphasis caps, section-width rhythm, Container-wrap rules, " +
    "StickyStack root-only, closer terminal law).",
  whenToUse: "Every distinct route (specs/<slug>.json). Each Page is a self-contained composition of macro sections.",
  whenNotToUse: [
    "Legal / utility pages generated from layout.legal — those are static, outside the JSON authoring path.",
    "A sub-tree fragment shared across pages — author it as a macro, not a second Page nested in tree (tree's vocabulary does not include Page).",
  ],
  fieldGuidance: {
    slug: "Next.js route path starting with '/' (e.g. '/', '/iletisim', '/blog/post').",
    title: "1-120 chars — SEO <title> / tab text.",
    navLabel: "1-30 chars — the short nav/footer menu word (distinct from `title`).",
    navOrder: "0-99, default 99 ('appear last'). Home ('/') always renders first regardless.",
    tree: "Ordered list of macro primitives (HeroSection first, optional page-tier CtaSection last). ≥1 entry.",
  },
  examples: [
    {
      primitive: "Page",
      slug: "/",
      title: "Örnek Kahve — Ana Sayfa",
      navLabel: "Ana Sayfa",
      tree: [
        {
          primitive: "HeroSection",
          props: {
            variant: "standard",
            heading: "Mahallenin üçüncü mekânı.",
            ctas: [{ label: "Menüyü Gör", href: "/menu" }],
          },
        },
        {
          primitive: "CtaSection",
          props: {
            variant: "standard",
            heading: "Bir sonraki molanız burada olsun.",
            ctas: [{ label: "Yol Tarifi Al", href: "/iletisim" }],
          },
        },
      ],
    },
  ],
  pure: true,
};

// ---------------------------------------------------------------------------
// PrimitiveNode — the composer catalog's top-level discriminated union:
// `Page` plus every embeddable primitive `Page.tree` accepts. Matches
// composer/packages/adapter-next/catalog/index.ts's shape (`Page` is a
// member of its own catalog's index, while `Page.tree` itself references
// the narrower embeddable-only union so a Page can never nest inside a
// Page's own tree).
// ---------------------------------------------------------------------------

export const PrimitiveNode = z.discriminatedUnion("primitive", [
  Page,
  ...PageTreeNode.options,
]);
export type PrimitiveNode = z.infer<typeof PrimitiveNode>;

// Full meta record — the derived vocabulary meta plus the one hand-authored
// entry this file adds.
export const PRIMITIVE_META: Readonly<Record<string, PrimitiveMeta>> =
  Object.freeze({ ...VOCABULARY_META, Page: PageMeta });

// ---------------------------------------------------------------------------
// SLOT_REGISTRY — the "Macro" slot family composer's engine resolves the
// `{{slot "Macro" primitive}}` template helper against (see
// packages/core/src/render/helpers.ts's `slot` helper and
// pipeline/orchestrator.ts's `extractSlotRegistry`, which reads this exact
// export name off the CATALOG module — not off the ./index.ts
// `defineAdapter` aggregate). One row per agent-facing macro primitive —
// `../src/slots.ts`'s `MACRO_SLOTS` already carries the
// `{importPath, exportName}` pair per macro (17 entries); this just nests
// it one level under the "Macro" family key `SlotRegistry` expects
// (family → variant → SlotEntry, here variant = the primitive name itself,
// since a macro node has no separate "variant" axis at the Page-tree
// level — HeroSection/CtaSection's own internal `variant` field is a
// PROP, resolved at runtime by the macro component, not a codegen-time
// substitution axis).
export const SLOT_REGISTRY: SlotRegistry = Object.freeze({
  Macro: MACRO_SLOTS,
});

// Re-export so the top-level `index.ts` `defineAdapter` aggregate can build
// its `catalog.primitives` map (name → {schema, meta}) without redundantly
// re-importing ../src/catalog itself.
export { sifirCatalog };
