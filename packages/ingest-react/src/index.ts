// @composer/ingest-react — derive Composer primitive drafts from React (.tsx)
// components via the TypeScript-compiler backend.
//
// MVP (003 T008): handle the common prop-type shapes — required and optional
// string/number/boolean, string-literal unions (enums) — for components shaped
// as `export function Name(props: PropsType)` or `export const Name = (props: PropsType) => ...`.
// Less common shapes (generics, Omit/Pick/intersections, complex refs, arrays
// of objects, function props) are explicitly marked TODO and fall back to
// `z.unknown()` so the human reviewer sees what needs hand-finishing.

import { basename, relative } from "node:path";
import ts from "typescript";

import {
  defineIngester,
  typescriptBackend,
  type CandidateDraft,
  type ParsedSource,
  type TsParsedSource,
} from "@composer/ingest-kit";

interface FieldInfo {
  name: string;
  zodExpr: string; // e.g. `z.string()`, `z.enum(["a","b"]).optional()`
  guidance: string; // short description for fieldGuidance metadata
}

interface ComponentInfo {
  name: string;
  propsType: ts.Type;
}

// Authored via the `defineIngester` SDK (003 US2 / T013): the codec is the
// type-aware TS backend + an `extract` step that derives a draft from a
// component's prop types. `defineIngester` synthesizes the `ingest()` the CLI
// calls (parse → extract), so the plugin stays a pure declaration.
export const reactIngester = defineIngester({
  name: "react",
  backend: typescriptBackend,
  extract(parsed: ParsedSource<TsParsedSource>): CandidateDraft[] {
    const { checker, sourceFile } = parsed.tree;
    const sourcePath = parsed.path;

    const component = findExportedReactComponent(sourceFile, checker);
    if (!component) {
      throw new Error(
        `@composer/ingest-react: no exported React component (function with a typed props parameter) found in ${sourcePath}`,
      );
    }

    const fields = extractFields(component.propsType, checker);
    const sourceRel = relative(process.cwd(), sourcePath) || basename(sourcePath);

    const schemaSource = renderSchemaSource(component.name, sourceRel, fields);
    const templateSource = renderTemplateStub(component.name, sourceRel, fields);

    const draft: CandidateDraft = {
      name: component.name,
      source: sourcePath,
      schemaSource,
      templateSource,
      templateLanguage: "tsx",
      meta: {
        primitive: component.name,
        version: "0.1.0",
        intent: `TODO: describe what ${component.name} is for.`,
        whenToUse: "TODO",
        whenNotToUse: ["TODO"],
        fieldGuidance: Object.fromEntries(fields.map((f) => [f.name, f.guidance])),
        examples: [],
      },
    };

    return [draft];
  },
});

export default reactIngester;

// ── component discovery ─────────────────────────────────────────────────────

function findExportedReactComponent(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ComponentInfo | null {
  for (const stmt of sourceFile.statements) {
    // `export function Foo(props: PropsType) { ... }`
    if (ts.isFunctionDeclaration(stmt) && stmt.name && hasExportModifier(stmt)) {
      const propsType = getPropsTypeFromParam(stmt.parameters[0], checker);
      if (propsType) return { name: stmt.name.text, propsType };
    }
    // `export const Foo = (props: PropsType) => ...` / `function expression`
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const init = decl.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          const propsType = getPropsTypeFromParam(init.parameters[0], checker);
          if (propsType) return { name: decl.name.text, propsType };
        }
      }
    }
  }
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function getPropsTypeFromParam(
  param: ts.ParameterDeclaration | undefined,
  checker: ts.TypeChecker,
): ts.Type | null {
  if (!param || !param.type) return null;
  return checker.getTypeFromTypeNode(param.type);
}

// ── field extraction ────────────────────────────────────────────────────────

function extractFields(propsType: ts.Type, checker: ts.TypeChecker): FieldInfo[] {
  const fields: FieldInfo[] = [];
  for (const prop of propsType.getProperties()) {
    const decl = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!decl) continue;
    const type = checker.getTypeOfSymbolAtLocation(prop, decl);
    const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0;
    const stripped = optional ? stripUndefinedAndNull(type) : type;
    let zodExpr = tsTypeToZod(stripped, checker);
    if (optional) zodExpr += ".optional()";
    const guidance = humanReadableTypeSummary(stripped, checker);
    fields.push({ name: prop.name, zodExpr, guidance });
  }
  return fields;
}

function stripUndefinedAndNull(type: ts.Type): ts.Type {
  if (!type.isUnion()) return type;
  const kept = type.types.filter(
    (t) => !(t.flags & ts.TypeFlags.Undefined) && !(t.flags & ts.TypeFlags.Null),
  );
  if (kept.length === 1) return kept[0]!;
  // Reconstruct: union-with-undefined-stripped — represent as a synthetic
  // union by returning the original type minus the nullish branches. Easiest
  // way: return one of them and rely on tsTypeToZod's union handling reading
  // the rest via getUnion (we don't have a constructor for synthetic unions).
  // For MVP, return the first kept; tsTypeToZod's union path handles UnionType
  // by reading `.types`, so falling back to the original type is fine when
  // optional handling only needs to strip one undefined.
  return type;
}

function tsTypeToZod(type: ts.Type, checker: ts.TypeChecker): string {
  // Union handling first — covers enums and general unions.
  if (type.isUnion()) {
    const members = type.types.filter(
      (t) => !(t.flags & ts.TypeFlags.Undefined) && !(t.flags & ts.TypeFlags.Null),
    );
    if (members.length === 0) return "z.unknown()";
    if (members.length === 1) return tsTypeToZod(members[0]!, checker);

    if (members.every((t) => (t.flags & ts.TypeFlags.StringLiteral) !== 0)) {
      const values = (members as ts.StringLiteralType[]).map((t) => t.value);
      return `z.enum([${values.map((v) => JSON.stringify(v)).join(", ")}])`;
    }

    // Boolean is represented as the union (true | false). Detect and collapse.
    if (
      members.length === 2 &&
      members.every((t) => (t.flags & ts.TypeFlags.BooleanLiteral) !== 0)
    ) {
      return "z.boolean()";
    }

    const subs = members.map((t) => tsTypeToZod(t, checker));
    return `z.union([${subs.join(", ")}])`;
  }

  if (type.flags & ts.TypeFlags.String) return "z.string()";
  if (type.flags & ts.TypeFlags.Number) return "z.number()";
  if (type.flags & ts.TypeFlags.Boolean) return "z.boolean()";
  if (type.flags & ts.TypeFlags.StringLiteral) {
    return `z.literal(${JSON.stringify((type as ts.StringLiteralType).value)})`;
  }
  if (type.flags & ts.TypeFlags.NumberLiteral) {
    return `z.literal(${(type as ts.NumberLiteralType).value})`;
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return `z.literal(${checker.typeToString(type)})`;
  }

  // TODO: handle Array<T>, Record<K,V>, intersections, generics, JSX children,
  // function props, and component refs. v0 returns z.unknown() so the human
  // reviewer sees the gap explicitly in the draft.
  return "z.unknown()";
}

function humanReadableTypeSummary(type: ts.Type, checker: ts.TypeChecker): string {
  const s = checker.typeToString(type);
  return `Derived from TS type: ${s}. Review and refine.`;
}

// ── output renderers ────────────────────────────────────────────────────────

function renderSchemaSource(
  name: string,
  sourceRel: string,
  fields: FieldInfo[],
): string {
  const fieldLines = fields
    .map((f) => `  ${f.name}: ${f.zodExpr},`)
    .join("\n");
  const guidanceLines = fields
    .map((f) => `    ${JSON.stringify(f.name)}: ${JSON.stringify(f.guidance)},`)
    .join("\n");

  return `// DRAFT — derived from ${sourceRel} by @composer/ingest-react.
// Review the metadata (intent / whenToUse / whenNotToUse / fieldGuidance)
// and edit any \`z.unknown()\` fallbacks before \`composer promote\`.

import { z } from "zod";
import type { PrimitiveMeta } from "@composer/adapter-kit";

export const ${name} = z
  .object({
    primitive: z.literal(${JSON.stringify(name)}),
    id: z.string(),
${fieldLines}
  })
  .strict();

export const ${name}Meta: PrimitiveMeta = {
  primitive: ${JSON.stringify(name)},
  version: "0.1.0",
  intent: ${JSON.stringify(`TODO: describe what ${name} is for.`)},
  whenToUse: "TODO",
  whenNotToUse: ["TODO"],
  fieldGuidance: {
${guidanceLines}
  },
  examples: [],
};
`;
}

function renderTemplateStub(
  name: string,
  sourceRel: string,
  fields: FieldInfo[],
): string {
  const fieldAttrs = fields.map((f) => `${f.name}={{{json ${f.name}}}}`).join(" ");
  return `{{!-- DRAFT template — derived from ${sourceRel} by @composer/ingest-react.
     Edit before \`composer promote\`: decide whether ${name} is a top-level
     (file-emitting) primitive or an inline child of a parent template, and
     adjust this body accordingly. The placeholders below substitute spec JSON
     fields directly into JSX attributes. --}}
<${name} ${fieldAttrs} />
`;
}
