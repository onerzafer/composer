// T021 — Prep sandbox using Node's built-in `vm` (research R3).
//
// Enforces FR-011 and FR-017: prep MUST NOT have filesystem, network, or
// dynamic-eval access. Only `node`, `slots`, `tokens`, and frozen helpers are
// exposed via the sandbox globalThis.
//
// v0.2 deferral #2 additions (design "Prep Loader — Minimal Design" §3):
//   - PrepStageError: a single tagged error carrying which pipeline stage
//     failed (load / unsafe / shape / exec / timeout), so callers (render.ts)
//     can format a stage-annotated RenderFailedError without string-sniffing.
//   - Async timeout: the vm `timeout` option only bounds the synchronous
//     slice of executing the prep call; an async prep that never resolves
//     (e.g. `new Promise(() => {})`) would otherwise hang the compose. We
//     race the resolved value against a host-side timer.
//   - Result-shape guard: reject anything that isn't a plain object
//     (null, arrays, primitives, class instances) after resolve.

import { createContext, runInNewContext } from "node:vm";
import type { PrepFn, SlotRegistry } from "@composer/adapter-kit";

/** Identifiers banned via static check before sandboxed execution. */
const BANNED_IDENTIFIERS =
  /\b(require|import|process|globalThis|eval|Function|fetch|XMLHttpRequest|setTimeout|setInterval|setImmediate)\b/;

export interface SandboxContext {
  slots: SlotRegistry;
  tokens: Record<string, unknown>;
}

/** Which stage of the prep pipeline produced a failure. Mirrors the design's
 * error-surface table (§4): each stage gets a distinct, stable label baked
 * into the outer `RenderFailedError` message. */
export type PrepFailureStage = "load" | "unsafe" | "shape" | "exec" | "timeout";

/**
 * Single tagged error type for every prep-pipeline failure that the loader or
 * sandbox itself detects (as opposed to an error thrown *by* prep-authored
 * code, which propagates untouched and is reported at stage "exec").
 */
export class PrepStageError extends Error {
  readonly stage: PrepFailureStage;
  public override readonly cause?: unknown;
  constructor(stage: PrepFailureStage, message: string, cause?: unknown) {
    super(message);
    this.name = "PrepStageError";
    this.stage = stage;
    if (cause !== undefined) this.cause = cause;
  }
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

/** Node's vm module raises this specific `code` when a script exceeds its
 * `timeout` budget — a stable, realm-independent signal (unlike `instanceof`,
 * which fails across vm context boundaries; see module doc above). */
function isVmTimeoutError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}

/** Detect V8's standard "X is not a function" TypeError text. Errors thrown
 * *inside* the vm realm are not `instanceof` the host's Error/TypeError (each
 * vm context has its own intrinsics), so message-sniffing is the only
 * realm-agnostic signal available here. Used only to upgrade a raw call
 * failure into a clearer "shape" stage error; a false negative just falls
 * back to the generic "exec" stage, which is still an accurate report. */
function looksLikeNotCallable(err: unknown): boolean {
  const message = (err as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && /is not a function/.test(message);
}

/**
 * Cross-realm-safe "is this a plain object" check. Values returned from
 * `runInNewContext` belong to a different vm realm, so `Object.prototype`
 * identity comparisons never match even for an ordinary `{}` literal —
 * instead we check that the value's prototype is either `null` or itself
 * one hop from `null` (i.e. *some* realm's bare `Object.prototype`). A class
 * instance's prototype chain is two-plus hops from `null` and is rejected.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto === null) return true;
  return Object.getPrototypeOf(proto) === null;
}

/** Race a (possibly cross-realm) promise against a host-side timer so an
 * async prep that never settles cannot hang the compose indefinitely. */
async function raceAsyncTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new PrepStageError(
              "timeout",
              `Prep exceeded the ${ms}ms asynchronous execution budget.`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Execute a prep function in a fresh vm context with a restricted globalThis.
 * Times out at 1 second, both for the synchronous call itself (vm's native
 * `timeout` option) and for an async prep whose returned promise never
 * settles (host-side race — see `raceAsyncTimeout`).
 *
 * Known, accepted limitation: `runInNewContext` realms carry their own
 * intrinsics (`Function`, `Promise`, realm `eval`), so `assertPrepSourceSafe`
 * is defense-in-depth, not a hard security boundary. Prep is trusted-adjacent
 * authored code, not hostile input; the sandbox's job is preventing
 * *accidental* IO/nondeterminism, not withstanding a malicious author.
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

  let raw: unknown;
  try {
    raw = runInNewContext(wrapped, ctx, { timeout: 1000 });
  } catch (err) {
    if (isVmTimeoutError(err)) {
      throw new PrepStageError(
        "timeout",
        "Prep exceeded the 1000ms synchronous execution budget.",
        err,
      );
    }
    if (looksLikeNotCallable(err)) {
      throw new PrepStageError(
        "shape",
        "Prep export must be a function: (node, ctx) => renderContext",
        err,
      );
    }
    throw err;
  }

  const result = await raceAsyncTimeout(Promise.resolve(raw), 1000);

  if (!isPlainObject(result)) {
    throw new PrepStageError("shape", "Prep must return a plain object render context.");
  }
  return result;
}
