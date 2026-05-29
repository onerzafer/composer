// Minimal self-contained catalog for the CommonJS-host regression fixture.
// One `Note` primitive — enough to drive a compose. The key property of this
// fixture is the *host* package.json: it has no "type":"module", and there is
// no design/package.json, so tsx transpiles these workspace modules to CommonJS
// (reproducing the double-wrapped-default bug this feature fixes).

import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const Note = z
  .object({
    primitive: z.literal("Note"),
    id: z.string(),
    text: z.string().min(1),
  })
  .strict();

export const NoteMeta: PrimitiveMeta = {
  primitive: "Note",
  version: "0.1.0",
  intent: "A trivial note primitive used by the CommonJS-host regression test.",
  whenToUse: "Tests only.",
  whenNotToUse: [],
  fieldGuidance: { text: "Any non-empty string." },
  examples: [{ primitive: "Note", id: "demo", text: "hi" }],
};

export const PrimitiveNode = z.discriminatedUnion("primitive", [Note]);
