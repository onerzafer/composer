// T053 — adapter-next semantic rules.
//
// Project-wide constraints beyond per-primitive Zod validation. v0.1 carries
// one rule as an example; more land as adapter-next matures.
export function checkSemantic(_node) {
    // v0.1: structural rules ride inside per-primitive Zod schemas
    // (e.g., Section requires cards.length >= 1 enforced in Section schema).
    // Cross-cutting taste rules land here as the adapter matures.
    return [];
}
//# sourceMappingURL=semantic.js.map