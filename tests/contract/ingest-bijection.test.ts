// T014 / 003 US2 — Bijection: ingest → compose → re-ingest round-trips the JSON
// (FR-009 / SC-003 / design §15.5).
//
// The keyvalue *adapter* (tests/fixtures/custom-adapter-keyvalue) is the forward
// codec (Config JSON → `.env` code). The keyvalue *ingester*
// (tests/fixtures/ingest-keyvalue) is its inverse (`.env` code → Config JSON).
// Because they are paired (one `Config` primitive shape), the round-trip is
// meaningful: decode a source `.env` → compose the recovered JSON → decode the
// emitted `.env` → the JSON must reproduce.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPOSER_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const KV_ADAPTER_DIR = join(COMPOSER_ROOT, "tests", "fixtures", "custom-adapter-keyvalue");
const TESTS_NODE_MODULES = join(COMPOSER_ROOT, "tests", "node_modules");
const SAMPLE_ENV = join(COMPOSER_ROOT, "tests", "fixtures", "ingest-keyvalue", "sample.env");

/** A project that `extends:` the keyvalue adapter (so `compose` can run). */
function makeProjectWithKvAdapter(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = mkdtempSync(join(tmpdir(), "composer-bijection-"));
  writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify(
      { name: "bijection-fixture", version: "0.0.0", private: true, type: "module" },
      null,
      2,
    ),
    "utf8",
  );
  symlinkSync(TESTS_NODE_MODULES, join(projectRoot, "node_modules"), "dir");

  // Install the kv adapter where `extends:` resolves it (same as custom-adapter.test.ts).
  const kvInstalledAt = join(TESTS_NODE_MODULES, "@composer-test", "adapter-keyvalue");
  if (!existsSync(kvInstalledAt)) {
    mkdirSync(dirname(kvInstalledAt), { recursive: true });
    cpSync(KV_ADAPTER_DIR, kvInstalledAt, { recursive: true, dereference: true });
  }

  mkdirSync(join(projectRoot, "design", "specs"), { recursive: true });
  writeFileSync(
    join(projectRoot, "composer.json"),
    JSON.stringify(
      {
        workspace: "./design",
        engine: "@composer/typescript@1",
        extends: "@composer-test/adapter-keyvalue@0",
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

describe("Bijection — paired keyvalue adapter + ingester (003 / FR-009 / SC-003)", () => {
  let project: { projectRoot: string; cleanup: () => void };

  beforeEach(() => {
    project = makeProjectWithKvAdapter();
  });

  afterEach(() => project.cleanup());

  it(
    "ingest → compose → re-ingest reproduces the JSON",
    { timeout: 60_000 },
    async () => {
      const keyvalueIngester = (
        await import("../fixtures/ingest-keyvalue/index.js")
      ).default;
      const { compose } = await import("@composer/core");
      if (!keyvalueIngester.decode) {
        throw new Error("keyvalue ingester must implement decode() for the bijection");
      }

      // 1. INGEST: decode the source `.env` → a Config JSON instance.
      const firstParse = keyvalueIngester.backend.parse(SAMPLE_ENV);
      const [instance1] = await keyvalueIngester.decode(firstParse);
      expect(instance1).toBeDefined();
      expect(instance1!.primitive).toBe("Config");

      // 2. COMPOSE: lower the recovered JSON to `.env` code via the paired adapter.
      const result = await compose(project.projectRoot, instance1!.id, instance1, {
        surface: "cli",
      });
      expect(result.audit.ok).toBe(true);
      const emittedPath = join(project.projectRoot, result.files_written[0]!.path);
      expect(existsSync(emittedPath)).toBe(true);

      // 3. RE-INGEST: decode the engine-emitted `.env` → a Config JSON instance.
      const secondParse = keyvalueIngester.backend.parse(emittedPath);
      const [instance2] = await keyvalueIngester.decode(secondParse);

      // 4. The round-trip reproduces the JSON.
      expect(instance2).toEqual(instance1);
    },
  );
});
