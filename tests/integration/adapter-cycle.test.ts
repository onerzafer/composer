// T075 — extends cycle detection (FR-008).
//
// A → B → A must be rejected with a clear chain in the error message.
// Tests the resolver directly because cycle detection has no runtime path
// (it'd be triggered by the orchestrator on the next compose).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeFakePkg(nm: string, name: string, extendsName: string | null): void {
  const pkgRoot = join(nm, ...name.split("/"));
  mkdirSync(pkgRoot, { recursive: true });
  writeFileSync(
    join(pkgRoot, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        type: "module",
        exports: { "./package.json": "./package.json" },
      },
      null,
      2,
    ),
    "utf8",
  );
  if (extendsName) {
    writeFileSync(
      join(pkgRoot, "composer.json"),
      JSON.stringify(
        {
          workspace: "./design",
          engine: "@composer/typescript@1",
          extends: `${extendsName}@1`,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

describe("extends cycle detection (US3, FR-008)", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "composer-cycle-"));
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({ name: "cycle-test", version: "0.0.0", type: "module" }),
      "utf8",
    );
    mkdirSync(join(projectRoot, "node_modules"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("rejects a direct cycle A → B → A with a chain in the error", async () => {
    const nm = join(projectRoot, "node_modules");
    makeFakePkg(nm, "@cycle/alpha", "@cycle/beta");
    makeFakePkg(nm, "@cycle/beta", "@cycle/alpha");

    const { walkExtendsChain, ExtendsCycleError } = await import("@composer/core");
    expect(() => walkExtendsChain(projectRoot, "@cycle/alpha@1")).toThrow(ExtendsCycleError);

    let caught: InstanceType<typeof ExtendsCycleError> | null = null;
    try {
      walkExtendsChain(projectRoot, "@cycle/alpha@1");
    } catch (e) {
      caught = e as InstanceType<typeof ExtendsCycleError>;
    }
    expect(caught).not.toBeNull();
    expect(caught!.chain).toEqual(["@cycle/alpha", "@cycle/beta", "@cycle/alpha"]);
    expect(caught!.message).toContain("@cycle/alpha");
    expect(caught!.message).toContain("@cycle/beta");
  });

  it("walks a non-cyclic chain to its terminal", async () => {
    const nm = join(projectRoot, "node_modules");
    makeFakePkg(nm, "@chain/leaf", null);
    makeFakePkg(nm, "@chain/middle", "@chain/leaf");
    makeFakePkg(nm, "@chain/root", "@chain/middle");

    const { walkExtendsChain } = await import("@composer/core");
    expect(walkExtendsChain(projectRoot, "@chain/root@1")).toEqual([
      "@chain/root",
      "@chain/middle",
      "@chain/leaf",
    ]);
  });

  it("handles a single adapter with no parent composer.json (terminal at depth 1)", async () => {
    const nm = join(projectRoot, "node_modules");
    makeFakePkg(nm, "@solo/only", null);

    const { walkExtendsChain } = await import("@composer/core");
    expect(walkExtendsChain(projectRoot, "@solo/only@1")).toEqual(["@solo/only"]);
  });

  it("emits an ExtendsResolutionError when the adapter package is missing", async () => {
    const { walkExtendsChain, ExtendsResolutionError } = await import("@composer/core");
    expect(() => walkExtendsChain(projectRoot, "@missing/adapter@1")).toThrow(
      ExtendsResolutionError,
    );
  });

  it("rejects an indirect cycle A → B → C → A", async () => {
    const nm = join(projectRoot, "node_modules");
    makeFakePkg(nm, "@deep/a", "@deep/b");
    makeFakePkg(nm, "@deep/b", "@deep/c");
    makeFakePkg(nm, "@deep/c", "@deep/a");

    const { walkExtendsChain, ExtendsCycleError } = await import("@composer/core");
    let caught: InstanceType<typeof ExtendsCycleError> | null = null;
    try {
      walkExtendsChain(projectRoot, "@deep/a@1");
    } catch (e) {
      caught = e as InstanceType<typeof ExtendsCycleError>;
    }
    expect(caught).not.toBeNull();
    expect(caught!.chain).toEqual(["@deep/a", "@deep/b", "@deep/c", "@deep/a"]);
  });

  // Make sure the file isn't reported as empty by tooling.
  it("(sanity) cycle test fixture symbols are imported correctly", () => {
    expect(typeof projectRoot).toBe("string");
    expect(existsSync(projectRoot)).toBe(true);
  });
});
