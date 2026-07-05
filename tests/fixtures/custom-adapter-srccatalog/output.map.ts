// Widget → widgets/<id>.txt
import type { OutputMap } from "@composer/adapter-kit";

const outputMap: OutputMap = {
  byPrimitive: {
    Widget: (node) => [
      { path: `widgets/${node["id"] as string}.txt`, language: "txt", policy: "overwrite" },
    ],
  },
  specsDir: "specs",
};

export default outputMap;
