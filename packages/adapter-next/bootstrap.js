// T060 — adapter-next bootstrap.
//
// Invoked once by `composer init --extends @composer/adapter-next` after the
// adapter's catalog/templates/output.map have been copied into the workspace.
// Writes a starter `specs/home.json` so the immediately-following sample
// `compose home` invocation produces a working src/app/page.tsx.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
export const bootstrap = (ctx) => {
    const homeSpec = {
        primitive: "Page",
        slug: "home",
        title: "Welcome to Composer",
        tree: [
            {
                primitive: "Hero",
                id: "home-hero",
                variant: "centered",
                title: "Welcome to Composer",
                subtitle: "Schema-Compiled Composition for any Next.js project.",
            },
            {
                primitive: "CTA",
                id: "home-cta",
                label: "Read the quickstart",
                href: "/docs/quickstart",
                variant: "primary",
            },
        ],
    };
    const specPath = join(ctx.workspaceRoot, "specs", "home.json");
    mkdirSync(dirname(specPath), { recursive: true });
    writeFileSync(specPath, JSON.stringify(homeSpec, null, 2) + "\n", "utf8");
};
export default bootstrap;
//# sourceMappingURL=bootstrap.js.map