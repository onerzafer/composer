import { z } from "zod";
import { CORE_LABEL, CORE_VERSION } from "@/core";

export const Note = z
  .object({
    primitive: z.literal("Note"),
    id: z.string(),
    body: z.string().min(1),
  })
  .strict();

export const NoteMeta = {
  primitive: "Note",
  version: CORE_VERSION,
  intent: `${CORE_LABEL} block.`,
  whenToUse: "A short freeform note.",
  whenNotToUse: [],
  fieldGuidance: { body: "1-2 sentences" },
  examples: [{ primitive: "Note", id: "demo", body: "Hello" }],
} as const;

export const PrimitiveNode = z.discriminatedUnion("primitive", [Note]);
