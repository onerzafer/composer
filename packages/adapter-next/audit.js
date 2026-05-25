// T059 — adapter-next audit rules.
//
// Cross-spec checks beyond per-primitive Zod validation. v0.1 ships a
// placeholder that always passes — real adapter-wide rules (e.g., "exactly
// one Page named 'index'", "no two specs with the same slug") arrive when
// the reference adapter has been dogfooded on real projects.
export const audit = (_workspace) => {
    return { ok: true, errors: [], warnings: [] };
};
export default audit;
//# sourceMappingURL=audit.js.map