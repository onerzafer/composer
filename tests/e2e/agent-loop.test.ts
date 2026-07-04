// T066 — End-to-end agent loop against the @composer/adapter-next reference.
//
// Covers spec.md US1 Acceptance scenarios #1–#5 and SC-001 (wall-clock ≤ 60s).
// Uses the MCP server's in-process API (createServer + callTool) to simulate
// the discover → scaffold → compose loop an LLM coding agent would drive.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeNextProjectFixture, type Fixture } from "../helpers/fixture.js";

interface DiscoverResult {
  project: { name: string; engine: string; adapter: string | null; version: string };
  primitives: { name: string; intent: string; whenToUse: string }[];
  specs: { id: string }[];
  guidelines: string;
  tokens: Record<string, unknown> | null;
  catalog_version: string;
  suggested_next: string;
}

interface ScaffoldPrimResult {
  spec_id: string;
  skeleton: unknown;
  schema: Record<string, unknown>;
  field_guidance: Record<string, string>;
  when_not_to_use: string[];
  examples: unknown[];
  suggested_next: string;
}

interface ScaffoldSpecResult {
  spec_id: string;
  json: { primitive: string; slug: string; title: string };
  suggested_next: string;
}

interface ComposeResult {
  spec_saved: string;
  files_written: { path: string; kind: "created" | "updated"; hash: string }[];
  audit: { ok: boolean };
  log: string;
  suggested_next: string;
}

// E2E tests pay a cold-start cost per fixture: tsx transpiles the adapter-next
// catalog + output.map fresh in each tempdir. Per-test budget = 60s to absorb
// that on slower hardware (matches SC-001's wall-clock spec).
const E2E_TIMEOUT_MS = 60_000;

describe("E2E — agent composes a real Next.js page (US1 SC-001)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeNextProjectFixture();
  });

  afterEach(() => fixture.cleanup());

  it("full loop: discover → scaffold → compose produces a real Next.js page in ≤ 60s (SC-001, US1 #1–#3)", async () => {
    const start = Date.now();
    const { createServer } = await import("@composer/mcp");
    const server = createServer({ cwd: fixture.projectRoot });

    // US1 Acceptance #1 — discover
    const overview = (await server.callTool("composer.discover")) as DiscoverResult;
    expect(overview.suggested_next).toBe("scaffold");
    expect(overview.primitives.map((p) => p.name).sort()).toEqual([
      "CTA",
      "Card",
      "Hero",
      "Page",
      "Section",
    ]);
    // Light-overview check — no schemas in discover
    for (const p of overview.primitives) {
      expect(p).not.toHaveProperty("schema");
      expect(typeof p.intent).toBe("string");
    }
    // SC-009 — discover response ≤ 5000 tokens (chars/4 estimate)
    const overviewTokens = Math.ceil(JSON.stringify(overview).length / 4);
    expect(overviewTokens).toBeLessThanOrEqual(5000);

    // US1 Acceptance #2 — scaffold
    const scaffolded = (await server.callTool("composer.scaffold", {
      kind: "primitive",
      primitive: "Page",
      intent: "pricing page with hero, feature cards, and a CTA",
    })) as ScaffoldPrimResult;
    expect(scaffolded.suggested_next).toBe("compose");
    expect(scaffolded.skeleton).toBeDefined();
    expect(scaffolded.schema).toBeDefined();
    expect(Array.isArray(scaffolded.examples)).toBe(true);

    // US1 Acceptance #3 — compose
    const result = (await server.callTool("composer.compose", {
      spec_id: "pricing",
      json: {
        primitive: "Page",
        slug: "pricing",
        title: "Pricing",
        tree: [
          {
            primitive: "Hero",
            id: "pricing-hero",
            variant: "centered",
            title: "Pricing built for teams",
            subtitle: "Pay only for what you ship.",
          },
          {
            primitive: "Section",
            id: "features",
            title: "Why Composer",
            cards: [
              { primitive: "Card", id: "c-fast", title: "Fast", description: "Compose in ms." },
              { primitive: "Card", id: "c-safe", title: "Safe", description: "Drift detection." },
            ],
          },
          {
            primitive: "CTA",
            id: "pricing-cta",
            label: "Start free trial",
            href: "/signup",
            variant: "primary",
          },
        ],
      },
    })) as ComposeResult;

    expect(result.spec_saved).toBe("design/specs/pricing.json");
    expect(result.files_written).toHaveLength(1);
    expect(result.files_written[0]!.path).toBe("src/app/pricing/page.tsx");
    expect(result.audit.ok).toBe(true);
    expect(result.suggested_next).toBe("done");

    // SC-001 — wall-clock budget
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThanOrEqual(60_000);

    // Generated file is well-formed TSX with banner + content from spec
    const generated = readFileSync(
      join(fixture.projectRoot, result.files_written[0]!.path),
      "utf8",
    );
    expect(generated).toMatch(/DO NOT EDIT.*Composer/s);
    expect(generated).toContain("export default function pricingPage()");
    expect(generated).toContain("Pricing built for teams");
    expect(generated).toContain("Pay only for what you ship.");
    expect(generated).toContain("Why Composer");
    expect(generated).toContain("Compose in ms.");
    expect(generated).toContain("Drift detection.");
    expect(generated).toContain("/signup");
    expect(generated).toContain("Start free trial");
  }, 60_000);

  it(
    "US1 #4 — invalid composition aborts atomically; no spec saved, no output",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
    const { createServer } = await import("@composer/mcp");
    const server = createServer({ cwd: fixture.projectRoot });

    await expect(
      server.callTool("composer.compose", {
        spec_id: "broken",
        // Missing required `tree` field on Page
        json: { primitive: "Page", slug: "broken", title: "Broken" },
      }),
    ).rejects.toThrow();

    expect(existsSync(join(fixture.projectRoot, "design/specs/broken.json"))).toBe(false);
    expect(existsSync(join(fixture.projectRoot, "src/app/broken/page.tsx"))).toBe(false);
    },
  );

  it(
    "US1 #5 — scaffold({kind: 'spec'}) reads an existing spec back",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
    const { createServer } = await import("@composer/mcp");
    const server = createServer({ cwd: fixture.projectRoot });

    await server.callTool("composer.compose", {
      spec_id: "existing-page",
      json: {
        primitive: "Page",
        slug: "existing-page",
        title: "Existing",
        tree: [
          { primitive: "Hero", id: "h", variant: "centered", title: "Hello world" },
        ],
      },
    });

    const scaffolded = (await server.callTool("composer.scaffold", {
      kind: "spec",
      spec_id: "existing-page",
    })) as ScaffoldSpecResult;

    expect(scaffolded.suggested_next).toBe("compose");
    expect(scaffolded.json.primitive).toBe("Page");
    expect(scaffolded.json.slug).toBe("existing-page");
    expect(scaffolded.json.title).toBe("Existing");
    },
  );

  // v0.2 catalog caching (deferred item #1): the second compose in this test
  // hits the process-local compiled-catalog cache (keyed by content hash of
  // the catalog sources), so it no longer pays the ~30s tsx cold-start twice.
  it(
    "idempotence on adapter-next — composing same spec twice produces byte-identical output",
    { timeout: E2E_TIMEOUT_MS },
    async () => {
    const { createServer } = await import("@composer/mcp");
    const server = createServer({ cwd: fixture.projectRoot });

    const spec = {
      primitive: "Page",
      slug: "idem",
      title: "Idem",
      tree: [
        { primitive: "Hero", id: "h", variant: "centered", title: "Same input, same output" },
      ],
    };

    const r1 = (await server.callTool("composer.compose", { spec_id: "idem", json: spec })) as ComposeResult;
    const f1 = readFileSync(join(fixture.projectRoot, r1.files_written[0]!.path), "utf8");

    const r2 = (await server.callTool("composer.compose", { spec_id: "idem", json: spec })) as ComposeResult;
    const f2 = readFileSync(join(fixture.projectRoot, r2.files_written[0]!.path), "utf8");

    expect(f2).toEqual(f1);
    },
  );
});
