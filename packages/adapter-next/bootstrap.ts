// T060 — adapter-next bootstrap.
//
// Invoked once by `composer init --extends @composer/adapter-next` after the
// adapter's catalog/templates/output.map have been copied into the workspace.
// Writes a starter `specs/home.json` so the immediately-following sample
// `compose home` invocation produces a working src/app/page.tsx.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BootstrapFn } from "@composer/adapter-kit";

export const bootstrap: BootstrapFn = (ctx) => {
  const homeSpec = {
    primitive: "Page" as const,
    slug: "home",
    title: "Welcome to Composer",
    tree: [
      {
        primitive: "Hero" as const,
        id: "home-hero",
        variant: "centered" as const,
        title: "Welcome to Composer",
        subtitle: "Schema-Compiled Composition for any Next.js project.",
      },
      {
        primitive: "CTA" as const,
        id: "home-cta",
        label: "Read the quickstart",
        href: "/docs/quickstart",
        variant: "primary" as const,
      },
    ],
  };
  const specPath = join(ctx.workspaceRoot, "specs", "home.json");
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, JSON.stringify(homeSpec, null, 2) + "\n", "utf8");
};

export default bootstrap;
