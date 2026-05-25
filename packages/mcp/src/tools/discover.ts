// T046 — MCP tool: composer.discover

import { discover } from "@composer/core";
import type { ToolDef } from "./types.js";

export const discoverTool: ToolDef = {
  name: "composer.discover",
  description:
    "List the project's primitives (names + intents only), existing specs " +
    "(ids + summaries), composition guidelines, and design tokens. CALL THIS " +
    "FIRST whenever you attach to a Composer-instrumented project; the " +
    "response is light (no schemas). Use scaffold() to get full primitive " +
    "details.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  handler: async (cwd: string, _args: unknown) => {
    return await discover(cwd);
  },
};
