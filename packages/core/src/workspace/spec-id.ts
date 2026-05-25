// T015 — Spec ID validator (research R13).

const SPEC_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidSpecId(id: string): boolean {
  return typeof id === "string" && SPEC_ID_PATTERN.test(id);
}

export function assertValidSpecId(id: string): void {
  if (!isValidSpecId(id)) {
    throw new Error(
      `Invalid spec_id "${id}": must match ${SPEC_ID_PATTERN.source} ` +
        `(lowercase alphanumeric + hyphens, 1–63 chars, starts with alphanumeric)`,
    );
  }
}
