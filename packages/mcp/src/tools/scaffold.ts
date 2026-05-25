// T047 — MCP tool: composer.scaffold

import { scaffold, type ScaffoldInput } from "@composer/core";
import type { ToolDef } from "./types.js";

export const scaffoldTool: ToolDef = {
  name: "composer.scaffold",
  description:
    "Either: (kind='primitive') return the full schema, examples, and field " +
    "guidance for one primitive, plus a starter JSON skeleton; OR (kind='spec') " +
    "return the full JSON content of an existing spec for editing. This is the " +
    "only way to read catalog details or workspace specs.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["primitive", "spec"] },
      primitive: { type: "string", description: "Primitive name (when kind='primitive')" },
      intent: { type: "string", description: "Free-form feature description (when kind='primitive')" },
      spec_id: { type: "string", description: "Existing spec ID (when kind='spec')" },
    },
    required: ["kind"],
    additionalProperties: false,
  },
  handler: async (cwd: string, args: unknown) => {
    return await scaffold(cwd, normalizeScaffoldInput(args));
  },
};

function normalizeScaffoldInput(args: unknown): ScaffoldInput {
  if (typeof args !== "object" || args === null) {
    throw new Error("INVALID_INPUT: scaffold expects an object");
  }
  const a = args as Record<string, unknown>;
  if (a["kind"] === "primitive") {
    if (typeof a["primitive"] !== "string") {
      throw new Error("INVALID_INPUT: scaffold kind=primitive requires `primitive` (string)");
    }
    const out: ScaffoldInput = { kind: "primitive", primitive: a["primitive"] };
    if (typeof a["intent"] === "string") out.intent = a["intent"];
    return out;
  }
  if (a["kind"] === "spec") {
    if (typeof a["spec_id"] !== "string") {
      throw new Error("INVALID_INPUT: scaffold kind=spec requires `spec_id` (string)");
    }
    return { kind: "spec", spec_id: a["spec_id"] };
  }
  throw new Error(
    `INVALID_INPUT_KIND: scaffold requires kind='primitive' or kind='spec' (got ${JSON.stringify(a["kind"])})`,
  );
}
