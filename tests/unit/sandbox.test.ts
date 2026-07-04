// v0.2 deferral #2 — Prep sandbox (design "Prep Loader — Minimal Design" §3).
//
// Verifies the two additions on top of the existing vm-based sandbox:
//   - async timeout: an async prep whose promise never settles is bounded by
//     a host-side race, not just the vm's sync `timeout` option.
//   - result-shape guard: anything that isn't a plain object (null, array,
//     Map, class instance) is rejected after resolve.
// Plus: sync timeout still fires, a non-function default export is reported
// as a "shape" error, and a rich error thrown by prep-authored code (the
// sifir OKLCH/aspect-ratio guard shape) propagates verbatim.

import { describe, expect, it } from "vitest";
import { PrepStageError, runPrepInSandbox } from "@composer/core";

describe("runPrepInSandbox (v0.2 deferral #2)", () => {
  it("returns the prep function's plain-object result, with tokens flowing through ctx", async () => {
    const result = await runPrepInSandbox(
      "(node, ctx) => ({ title: node.title, color: ctx.tokens.brand })",
      { title: "hi" },
      { slots: {}, tokens: { brand: "indigo" } },
    );

    expect(result).toEqual({ title: "hi", color: "indigo" });
  });

  it("bounds a runaway synchronous prep with a timeout-stage error", async () => {
    const err = await runPrepInSandbox(
      "(node, ctx) => { while (true) {} }",
      {},
      { slots: {}, tokens: {} },
    ).catch((e: unknown) => e as PrepStageError);

    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("timeout");
  }, 10_000);

  it("bounds an async prep whose promise never settles with a timeout-stage error", async () => {
    const err = await runPrepInSandbox(
      "(node, ctx) => new Promise(() => {})",
      {},
      { slots: {}, tokens: {} },
    ).catch((e: unknown) => e as PrepStageError);

    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("timeout");
  }, 10_000);

  it("reports a non-function default export as a shape-stage error", async () => {
    const err = await runPrepInSandbox("({ notAFunction: true })", {}, {
      slots: {},
      tokens: {},
    }).catch((e: unknown) => e as PrepStageError);

    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("shape");
    expect(err.message).toMatch(/must be a function/);
  });

  it.each([
    ["an array", "(node, ctx) => ([1, 2, 3])"],
    ["null", "(node, ctx) => (null)"],
    ["a Map instance", "(node, ctx) => (new Map())"],
    [
      "a class instance",
      "(() => { class Foo { constructor() { this.x = 1; } } return (node, ctx) => new Foo(); })()",
    ],
  ])("rejects a return value that is %s as a shape-stage error", async (_label, source) => {
    const err = await runPrepInSandbox(source, {}, { slots: {}, tokens: {} }).catch(
      (e: unknown) => e as PrepStageError,
    );

    expect(err).toBeInstanceOf(PrepStageError);
    expect(err.stage).toBe("shape");
    expect(err.message).toMatch(/plain object/);
  });

  it("propagates a synchronous prep-thrown error verbatim (not wrapped in PrepStageError)", async () => {
    const rich = "Rich Designer-facing message: try maxInGamutChroma=0.15";
    const err = await runPrepInSandbox(
      `(node, ctx) => { throw new Error(${JSON.stringify(rich)}); }`,
      {},
      { slots: {}, tokens: {} },
    ).catch((e: unknown) => e as Error);

    expect(err).not.toBeInstanceOf(PrepStageError);
    expect(err.message).toBe(rich);
  });

  it("propagates an asynchronous prep-thrown error verbatim", async () => {
    const err = await runPrepInSandbox(
      `async (node, ctx) => { throw new Error("async boom"); }`,
      {},
      { slots: {}, tokens: {} },
    ).catch((e: unknown) => e as Error);

    expect(err).not.toBeInstanceOf(PrepStageError);
    expect(err.message).toBe("async boom");
  });
});
