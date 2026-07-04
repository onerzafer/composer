// Minimal hand-rolled stand-in for Zod v4's runtime shape — NOT a real Zod
// implementation. It exists purely to give this fixture's catalog files
// (design/catalog/index.ts — a byte-for-byte copy of
// @sifir/design-system/catalog/index.ts — and design/src/catalog/index.ts,
// this repo's trimmed vocabulary stand-in) a `zod` import that produces
// objects with the *exact* `_def` / `.shape` / `.options` runtime shape the
// real `zod@4.4.3` package produces, verified directly against that real
// package while building this fixture (see ../README.md):
//
//   - `z.discriminatedUnion(key, options)` → `{ _def: { options, discriminator: key },
//     options }` (both the internal `_def.options` @composer/typescript's
//     compile.ts reads, AND the public `.options` getter
//     `catalog/index.ts` itself spreads via `...PageTreeNode.options`).
//   - `z.object(shape).strict().superRefine(fn)` → stays the SAME object,
//     `.shape` intact — real Zod v4 does NOT wrap `.superRefine()` in a
//     separate non-object type the way Zod v3 did, which is exactly why
//     compile.ts's fix walks a live member's `.shape` directly rather than
//     assuming a particular wrapper shape.
//   - `z.literal(value)` → `{ _def: { type: "literal", values: [value] } }`.
//   - `z.enum(values)` → `{ _def: { type: "enum", entries: {...} } }`.
//
// Vendoring the REAL npm package was tried first and rejected: adding Zod
// v4 as an actual workspace dependency (even test-only, even pnpm-aliased)
// fed it into pnpm's whole-workspace peer-dependency resolution and
// silently flipped `packages/mcp`'s `@modelcontextprotocol/sdk` dependency
// from its Zod v3 peer to v4 — an unrelated, unwanted side effect on a real
// package's resolved dependency graph. This shim needs no pnpm/npm install
// at all: the test symlinks `design/node_modules/zod` straight to this
// directory, so it never touches the workspace's dependency graph.
//
// Covers exactly the Zod API surface `design/catalog/index.ts` and
// `design/src/catalog/index.ts` actually call — no more.
// `compileCatalog` itself only ever reads `_def.options` /
// `_def.discriminator` / a member's `.shape` / a literal or enum field's
// `_def.values` / `_def.value` / `_def.entries` (never anything else off a
// real Zod instance — its own `zod` import in compile.ts is type-only), so
// nothing here needs to actually validate data; only that shape matters.

class ZodTypeShim {
  optional() {
    return this;
  }
  default() {
    return this;
  }
  nullable() {
    return this;
  }
  min() {
    return this;
  }
  max() {
    return this;
  }
  int() {
    return this;
  }
  regex() {
    return this;
  }
  strict() {
    return this;
  }
  superRefine() {
    return this;
  }
}

class ZodString extends ZodTypeShim {
  constructor() {
    super();
    this._def = { type: "string" };
  }
}

class ZodNumber extends ZodTypeShim {
  constructor() {
    super();
    this._def = { type: "number" };
  }
}

class ZodBoolean extends ZodTypeShim {
  constructor() {
    super();
    this._def = { type: "boolean" };
  }
}

class ZodLiteral extends ZodTypeShim {
  constructor(value) {
    super();
    this._def = { type: "literal", values: [value] };
  }
}

class ZodEnum extends ZodTypeShim {
  constructor(values) {
    super();
    this._def = { type: "enum", entries: Object.fromEntries(values.map((v) => [v, v])) };
  }
}

class ZodArray extends ZodTypeShim {
  constructor(element) {
    super();
    this._def = { type: "array", element };
  }
}

class ZodLazy extends ZodTypeShim {
  constructor(getter) {
    super();
    this._def = { type: "lazy", getter };
  }
}

class ZodObject extends ZodTypeShim {
  constructor(shape) {
    super();
    this._def = { type: "object", shape };
    this.shape = shape;
  }
}

class ZodDiscriminatedUnion extends ZodTypeShim {
  constructor(discriminator, options) {
    super();
    this._def = { type: "discriminated-union", options, discriminator };
    this.options = options;
  }
}

export const z = {
  object: (shape) => new ZodObject(shape),
  string: () => new ZodString(),
  number: () => new ZodNumber(),
  boolean: () => new ZodBoolean(),
  literal: (value) => new ZodLiteral(value),
  enum: (values) => new ZodEnum(values),
  array: (element) => new ZodArray(element),
  lazy: (getter) => new ZodLazy(getter),
  discriminatedUnion: (discriminator, options) => new ZodDiscriminatedUnion(discriminator, options),
};

export default z;
