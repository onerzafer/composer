// Note → src/notes/<id>.ts. A plain default export — this is the module whose
// default gets double-wrapped by the tsx→CommonJS interop in a CJS host.
import type { OutputMap } from "@composer/adapter-kit";

const outputMap: OutputMap = {
  byPrimitive: {
    Note: (node) => [
      { path: `src/notes/${node["id"] as string}.ts`, language: "ts", policy: "overwrite" },
    ],
  },
  specsDir: "specs",
};

export default outputMap;
