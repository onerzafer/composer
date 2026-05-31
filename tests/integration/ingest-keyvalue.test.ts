// T016 / 003 US3 — a second ingester, for a non-TypeScript source, authored
// against the @composer/ingest-kit SDK with a format-native parser backend
// (SC-005). Asserts `composer ingest`'s codec uses that backend rather than the
// TypeScript compiler.

import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SAMPLE_ENV = join(
  COMPOSER_ROOT,
  "tests",
  "fixtures",
  "ingest-keyvalue",
  "sample.env",
);

describe("keyvalue ingester — pluggable non-TS parse layer (003 US3 / SC-005)", () => {
  it("declares the format-native backend, not the TypeScript compiler", async () => {
    const { keyvalueIngester } = await import("../fixtures/ingest-keyvalue/index.js");
    // The ingester reads through the alternate backend (US3 Acceptance #1).
    expect(keyvalueIngester.backend.name).toBe("keyvalue");
    expect(keyvalueIngester.backend.name).not.toBe("typescript");
  });

  it("ingest() derives a Config draft from a `.env` source via that backend", async () => {
    const { keyvalueIngester } = await import("../fixtures/ingest-keyvalue/index.js");

    // `.env` is not valid TypeScript — only a non-TS backend can parse it. The
    // SDK-synthesized ingest() runs backend.parse → extract.
    const drafts = await keyvalueIngester.ingest(SAMPLE_ENV, {
      projectRoot: COMPOSER_ROOT,
      quarantineDir: join(COMPOSER_ROOT, "tmp-unused"),
    });

    expect(drafts).toHaveLength(1);
    const draft = drafts[0]!;
    expect(draft.name).toBe("Config");
    expect(draft.templateLanguage).toBe("env");
    expect(draft.schemaSource).toContain('z.literal("Config")');
  });

  it("decode() recovers the JSON instance through the format-native parser", async () => {
    const keyvalueIngester = (await import("../fixtures/ingest-keyvalue/index.js"))
      .default;
    if (!keyvalueIngester.decode) {
      throw new Error("keyvalue ingester must implement decode() for the bijection");
    }

    const parsed = keyvalueIngester.backend.parse(SAMPLE_ENV);
    const nodes = await keyvalueIngester.decode(parsed);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      primitive: "Config",
      id: "sample",
      name: "sample",
      values: [
        { key: "PORT", value: "3000" },
        { key: "HOST", value: "0.0.0.0" },
        { key: "LOG_LEVEL", value: "info" },
      ],
    });
  });
});
