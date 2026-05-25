// T058 — adapter-next output map.
//
// Only Page emits a file (src/app/<slug>/page.tsx). Hero, Section, Card, CTA
// are embedded primitives — Page's template renders them inline.
const outputMap = {
    byPrimitive: {
        Page: (node) => [
            {
                path: `src/app/${node["slug"]}/page.tsx`,
                language: "tsx",
                policy: "overwrite",
            },
        ],
        // Hero, Section, Card, CTA → no entry. They render inline via Page template.
    },
    specsDir: "specs",
};
export default outputMap;
//# sourceMappingURL=output.map.js.map