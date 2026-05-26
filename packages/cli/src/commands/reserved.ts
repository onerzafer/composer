// T091 — Reserved namespace stubs (FR-022).
//
// `composer ingest`, `composer promote`, `composer migrate` are reserved for
// v1.x. v0.1 prints a one-line "not implemented" message and exits 99.
// The bin wrapper iterates RESERVED_COMMANDS and registers each.

export const RESERVED_COMMANDS = ["ingest", "promote", "migrate"] as const;
export type ReservedCommand = (typeof RESERVED_COMMANDS)[number];

export function reservedNotImplemented(name: ReservedCommand): never {
  throw new ReservedNotImplementedError(name);
}

export class ReservedNotImplementedError extends Error {
  readonly exitCode = 99;
  constructor(public readonly command: ReservedCommand) {
    super(`composer ${command}: not implemented in v0.1 — reserved for v1.x.`);
    this.name = "ReservedNotImplementedError";
  }
}
