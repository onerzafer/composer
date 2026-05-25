// T021 — Prep sandbox using Node's built-in `vm` (research R3).
//
// Enforces FR-011 and FR-017: prep MUST NOT have filesystem, network, or
// dynamic-eval access. Only `node`, `slots`, `tokens`, and frozen helpers are
// exposed via the sandbox globalThis.

import { createContext, runInNewContext } from "node:vm";
import type { PrepFn, SlotRegistry } from "@composer/adapter-kit";

/** Identifiers banned via static check before sandboxed execution. */
const BANNED_IDENTIFIERS =
  /\b(require|import|process|globalThis|eval|Function|fetch|XMLHttpRequest|setTimeout|setInterval|setImmediate)\b/;

export interface SandboxContext {
  slots: SlotRegistry;
  tokens: Record<string, unknown>;
}

/**
 * Validate that a prep source string contains no banned identifiers.
 * Coarse-grained guard — defense in depth alongside the vm context isolation.
 */
export function assertPrepSourceSafe(source: string): void {
  if (BANNED_IDENTIFIERS.test(source)) {
    throw new Error(
      "Prep source contains a disallowed identifier (require/import/process/eval/Function/fetch/timers). " +
        "Prep is sandboxed: only `node`, `slots`, `tokens`, and helpers are available.",
    );
  }
}

/**
 * Statically validate that a prep value is a function (the export shape).
 */
export function assertPrepShape(prep: unknown): asserts prep is PrepFn {
  if (typeof prep !== "function") {
    throw new Error("Prep export must be a function: (node, ctx) => renderContext");
  }
}

/**
 * Execute a prep function in a fresh vm context with a restricted globalThis.
 * Times out at 1 second to bound runaway computation.
 */
export async function runPrepInSandbox(
  prepSource: string,
  node: Record<string, unknown>,
  context: SandboxContext,
): Promise<Record<string, unknown>> {
  assertPrepSourceSafe(prepSource);

  const sandbox = Object.freeze({
    node,
    slots: context.slots,
    tokens: context.tokens,
    // Frozen standard built-ins only:
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    RegExp,
    Map,
    Set,
  });

  const ctx = createContext(sandbox);
  const wrapped = `(${prepSource})(node, { slots, tokens })`;
  const result = runInNewContext(wrapped, ctx, { timeout: 1000 });
  return await Promise.resolve(result as Record<string, unknown>);
}
