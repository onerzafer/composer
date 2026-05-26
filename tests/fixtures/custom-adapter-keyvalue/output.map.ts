// Config → config/<name>.env
import type { OutputMap } from "@composer/adapter-kit";

const outputMap: OutputMap = {
  byPrimitive: {
    Config: (node) => [
      { path: `config/${node["name"] as string}.env`, language: "env", policy: "overwrite" },
    ],
  },
  specsDir: "specs",
};

export default outputMap;
