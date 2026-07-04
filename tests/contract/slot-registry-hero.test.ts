// Slot registry — Hero primitive contract test.
//
// Proves design/catalog/slot-registry.ts + the `{{slot}}` template helper are
// actually exercised end-to-end: composing a Page with a Hero must emit an
// `import` of the slot-resolved external component and render that component
// by name — never inline `<section className="hero...">` markup. Registered
// variants (centered, overlay) each resolve to their own import path +
// export name (adapter-next's catalog/slot-registry.ts), so only the variant
// actually used in the tree gets imported.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeNextProjectFixture, type Fixture } from "../helpers/fixture.js";

interface ComposeResult {
  files_written: { path: string }[];
}

describe("Slot registry — Hero primitive renders via {{slot}}, not inlined markup", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeNextProjectFixture();
  });

  afterEach(() => fixture.cleanup());

  it("centered variant: imports CenteredHero from the registry's importPath and renders it by name", async () => {
    const { compose } = await import("@composer/core");

    const result = (await compose(fixture.projectRoot, "centered-page", {
      primitive: "Page",
      slug: "centered-page",
      title: "Centered",
      tree: [
        {
          primitive: "Hero",
          id: "hero-1",
          variant: "centered",
          title: "Ship faster",
          subtitle: "Compose, don't hand-write.",
        },
      ],
    })) as ComposeResult;

    const generated = readFileSync(join(fixture.projectRoot, result.files_written[0]!.path), "utf8");

    // Imports the external component from the slot registry's importPath.
    expect(generated).toContain('import { CenteredHero } from "@/components/heroes";');
    // Renders the composed component by its resolved export name.
    expect(generated).toMatch(/<CenteredHero\b/);
    expect(generated).toContain('title="Ship faster"');
    expect(generated).toContain('subtitle="Compose, don\'t hand-write."');

    // Never falls back to inlining Hero markup directly in the page.
    expect(generated).not.toContain("hero hero--");
    expect(generated).not.toMatch(/<section[^>]*className="hero/);
    // Only the variant actually used gets imported.
    expect(generated).not.toContain("OverlayHero");
  });

  it("overlay variant: imports OverlayHero from the registry — a different variant, different import", async () => {
    const { compose } = await import("@composer/core");

    const result = (await compose(fixture.projectRoot, "overlay-page", {
      primitive: "Page",
      slug: "overlay-page",
      title: "Overlay",
      tree: [
        {
          primitive: "Hero",
          id: "hero-1",
          variant: "overlay",
          title: "Built on a real image",
        },
      ],
    })) as ComposeResult;

    const generated = readFileSync(join(fixture.projectRoot, result.files_written[0]!.path), "utf8");

    expect(generated).toContain('import { OverlayHero } from "@/components/heroes";');
    expect(generated).toMatch(/<OverlayHero\b/);
    expect(generated).not.toContain("CenteredHero");
    expect(generated).not.toContain("hero hero--");
    expect(generated).not.toMatch(/<section[^>]*className="hero/);
  });

  it("Hero.cta renders as a valid JSX object-expression prop (double-braced, not inlined)", async () => {
    const { compose } = await import("@composer/core");

    const result = (await compose(fixture.projectRoot, "cta-page", {
      primitive: "Page",
      slug: "cta-page",
      title: "With CTA",
      tree: [
        {
          primitive: "Hero",
          id: "hero-1",
          variant: "centered",
          title: "Ship faster",
          cta: { label: "Get started", href: "/start", variant: "primary" },
        },
      ],
    })) as ComposeResult;

    const generated = readFileSync(join(fixture.projectRoot, result.files_written[0]!.path), "utf8");

    // JSX requires an object-valued prop to be double-braced: the outer pair
    // is the JSX expression container, the inner pair is the object literal.
    // A single brace pair here would be a syntax error, not a valid prop.
    expect(generated).toContain(
      'cta={ {"label":"Get started","href":"/start","variant":"primary"} }',
    );
  });
});
