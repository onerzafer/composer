// T049 — MCP tool: composer.compose

import { compose } from "@composer/core";
import type { ToolDef } from "./types.js";

export const composeTool: ToolDef = {
  name: "composer.compose",
  description:
    "Atomically validate, persist, and emit. If everything succeeds, the spec " +
    "file is saved and the generated source files are written. If anything " +
    "fails, NOTHING is written. This is the only tool that mutates the project.",
  inputSchema: {
    type: "object",
    properties: {
      spec_id: { type: "string" },
      json: { type: "object", additionalProperties: true },
    },
    required: ["spec_id", "json"],
    additionalProperties: false,
  },
  handler: async (cwd: string, args: unknown) => {
    if (typeof args !== "object" || args === null) {
      throw new Error("INVALID_INPUT: compose expects an object");
    }
    const a = args as Record<string, unknown>;
    if (typeof a["spec_id"] !== "string") {
      throw new Error("INVALID_INPUT: compose requires `spec_id` (string)");
    }
    if (typeof a["json"] !== "object" || a["json"] === null) {
      throw new Error("INVALID_INPUT: compose requires `json` (object)");
    }
    return await compose(cwd, a["spec_id"], a["json"], { surface: "mcp" });
  },
};
