// Golden fixture (004 US1 / T007): the draft `grammar.author` is expected to
// produce from vocabulary-brief.md. The deterministic tests stage THIS draft
// (via @composer/grammar-kit's stageDraft) and assert inertness, the quality
// gate, and promote → compose. It is a quality-passing, composable `Greeting`
// primitive (real metadata, ≤30-line template, declarative, coherent).

import type { CandidateDraft } from "@composer/ingest-kit";

/** The Zod schema module the author phase drafts (schema + metadata). */
export const GREETING_SCHEMA_SOURCE = `import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const Greeting = z
  .object({
    primitive: z.literal("Greeting"),
    id: z.string(),
    name: z.string().min(1),
  })
  .strict();

export const GreetingMeta: PrimitiveMeta = {
  primitive: "Greeting",
  version: "0.1.0",
  intent: "Emit a typed greeting function for a named audience.",
  whenToUse: "When a module needs a simple, named greeting export.",
  whenNotToUse: ["Use a full i18n primitive for localized, pluralized copy."],
  fieldGuidance: { name: "The audience being greeted; becomes the export suffix." },
  examples: [{ primitive: "Greeting", id: "world", name: "World" }],
};
`;

/** The Handlebars template the author phase drafts (≤30 lines). */
export const GREETING_TEMPLATE_SOURCE = `// from: spec={{spec_path}} primitive=Greeting id={{id}}
export const greeting_{{id}} = (): string => \`Hello, {{name}}!\`;
`;

/** The full draft, ready to hand to stageDraft(). */
export const greetingDraft: CandidateDraft = {
  name: "Greeting",
  source: "tests/fixtures/grammar-kit/vocabulary-brief.md",
  schemaSource: GREETING_SCHEMA_SOURCE,
  templateSource: GREETING_TEMPLATE_SOURCE,
  templateLanguage: "ts",
  meta: {
    primitive: "Greeting",
    version: "0.1.0",
    intent: "Emit a typed greeting function for a named audience.",
    whenToUse: "When a module needs a simple, named greeting export.",
    whenNotToUse: ["Use a full i18n primitive for localized, pluralized copy."],
    fieldGuidance: { name: "The audience being greeted; becomes the export suffix." },
    examples: [{ primitive: "Greeting", id: "world", name: "World" }],
  },
};
