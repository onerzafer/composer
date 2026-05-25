// T048 — MCP tool: composer.validate

import { validate } from "@composer/core";
import type { ToolDef } from "./types.js";

export const validateTool: ToolDef = {
  name: "composer.validate",
  description:
    "Dry-run a draft spec without writing anything. Returns the same errors " +
    "compose would surface, plus the file diffs that would result. Use this " +
    "for a cheap reality check before compose.",
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
      throw new Error("INVALID_INPUT: validate expects an object");
    }
    const a = args as Record<string, unknown>;
    if (typeof a["spec_id"] !== "string") {
      throw new Error("INVALID_INPUT: validate requires `spec_id` (string)");
    }
    if (typeof a["json"] !== "object" || a["json"] === null) {
      throw new Error("INVALID_INPUT: validate requires `json` (object)");
    }
    return await validate(cwd, a["spec_id"], a["json"]);
  },
};
