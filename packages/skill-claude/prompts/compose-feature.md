# Composing a feature

The agent loop:

```
discover() → scaffold(primitive | spec) → (compose in your context) → [validate?] → compose(spec_id, json)
```

1. **Discover** (one call) — light catalog overview.
2. **Scaffold** (one call per primitive you'll use) — full schema, examples, field guidance, whenNotToUse.
3. **Compose the JSON** in your context using the catalog's schema as the contract.
4. **Validate** *(optional)* — cheap dry-run for confidence before paying the full compose cost.
5. **Compose** (one call) — atomic: validates, persists the spec, emits the generated files. All-or-nothing.

If `compose` fails:
- Read the error's `phase` and `errors[]`.
- Fix the JSON. Call `compose` again.
- If the fix requires a structural change that doesn't fit the catalog, ESCALATE to the human — don't try to work around it.
