// Minimal hand-authored catalog for the keyvalue adapter.
// Single primitive `Config` — a name + a list of key/value pairs that emit as
// `KEY=value` lines, sufficient to prove the layering rules end-to-end.

import { z } from "zod";

export const Config = z.object({
  primitive: z.literal("Config"),
  id: z.string(),
  name: z.string().min(1),
  values: z
    .array(
      z.object({
        key: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "keys must be SCREAMING_SNAKE_CASE"),
        value: z.string(),
      }),
    )
    .min(1),
}).strict();

import type { PrimitiveMeta } from "@composer/adapter-kit";

export const ConfigMeta: PrimitiveMeta = {
  primitive: "Config",
  version: "0.1.0",
  intent: "Emit a flat .env-style key=value file.",
  whenToUse: "Use for static runtime configuration shipped alongside code.",
  whenNotToUse: ["Use a secrets manager for credentials"],
  fieldGuidance: {
    name: "Logical name; becomes the emitted filename.",
    values: "All keys SCREAMING_SNAKE_CASE; values are written verbatim.",
  },
  examples: [
    {
      primitive: "Config",
      id: "demo",
      name: "demo",
      values: [{ key: "PORT", value: "3000" }],
    },
  ],
};

export const PrimitiveNode = z.discriminatedUnion("primitive", [Config]);
