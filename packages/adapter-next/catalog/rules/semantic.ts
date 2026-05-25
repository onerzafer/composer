// T053 — adapter-next semantic rules.
//
// Project-wide constraints beyond per-primitive Zod validation. v0.1 carries
// one rule as an example; more land as adapter-next matures.

// Re-export a refinement-equipped variant of the discriminator that adds
// cross-primitive checks. v0.1 rule: a Section's first card cannot duplicate
// the section title verbatim (would feel redundant). This is purely a taste
// guideline — illustrative of the layer's purpose.

export interface SemanticIssue {
  path: string;
  message: string;
}

export function checkSemantic(_node: unknown): SemanticIssue[] {
  // v0.1: structural rules ride inside per-primitive Zod schemas
  // (e.g., Section requires cards.length >= 1 enforced in Section schema).
  // Cross-cutting taste rules land here as the adapter matures.
  return [];
}
