// T036 — Pipeline phase: render to in-memory RenderedFile[].
//
// Walks the spec tree, resolves output paths via OutputMap, compiles each
// primitive's Handlebars template, and prepends the DO-NOT-EDIT banner +
// per-block source-map comment.
//
// Prep support (optional <primitive>.prep.ts) is a TODO for v0.2 — gated
// behind a clear error so adopters know the limitation rather than getting
// silently-incorrect output.

import Handlebars from "handlebars";
type HandlebarsTemplateDelegate = (context: unknown) => string;
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { CompiledCatalog } from "@composer/typescript";
import type { OutputMap, OutputPath, SlotRegistry } from "@composer/adapter-kit";
import type { EffectiveWorkspace } from "../../workspace/layer.js";
import { registerHelpers } from "../../render/helpers.js";
import { buildBanner, buildBlockComment } from "../../render/banner.js";
import type { FileEntry } from "../../sourcemap/persist.js";

export interface RenderInput {
  workspace: EffectiveWorkspace;
  catalog: CompiledCatalog;
  outputMap: OutputMap;
  slotRegistry: SlotRegistry;
  specId: string;
  /** Workspace-relative path used in banner + source-map comments. */
  specRelPath: string;
  json: unknown;
}

export interface RenderedFile {
  path: string;
  content: string;
  language: string;
  policy: "overwrite" | "one-shot";
  sourceMap: FileEntry[];
}

export class RenderFailedError extends Error {
  readonly code = "RENDER_FAILED" as const;
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "RenderFailedError";
    if (cause !== undefined) this.cause = cause;
  }
}

interface PrimitiveNode {
  primitive: string;
  id?: string;
  [key: string]: unknown;
}

function isPrimitiveNode(value: unknown): value is PrimitiveNode {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as PrimitiveNode).primitive === "string"
  );
}

export async function renderSpec(input: RenderInput): Promise<RenderedFile[]> {
  const out: RenderedFile[] = [];
  await renderNode(input, input.json, out);
  return out;
}

async function renderNode(
  input: RenderInput,
  node: unknown,
  out: RenderedFile[],
): Promise<void> {
  if (!isPrimitiveNode(node)) return;
  const primitive = node.primitive;
  const nodeId = (node.id as string | undefined) ?? "unknown";

  const outputs = resolveOutputs(input.outputMap, primitive, node);
  for (const op of outputs) {
    const file = await renderOne(input, node, primitive, nodeId, op);
    out.push(file);
  }

  // Recurse into nested children (e.g., Page.tree[])
  const tree = (node as Record<string, unknown>)["tree"];
  if (Array.isArray(tree)) {
    for (const child of tree) {
      await renderNode(input, child, out);
    }
  }
}

function resolveOutputs(map: OutputMap, primitive: string, node: unknown): OutputPath[] {
  const resolver = map.byPrimitive[primitive];
  // A primitive without an output mapping is an *embedded* primitive — its
  // parent's template is responsible for rendering it inline. Return [] so
  // the engine skips file emission for this node and lets recursion proceed
  // (children may have their own mappings).
  if (!resolver) return [];
  return resolver(node as Record<string, unknown>);
}

async function renderOne(
  input: RenderInput,
  node: PrimitiveNode,
  primitive: string,
  nodeId: string,
  outputPath: OutputPath,
): Promise<RenderedFile> {
  const templateName = `${primitive.toLowerCase()}.${outputPath.language}.hbs`;
  const templatePath = input.workspace.templatePaths.get(templateName);
  if (!templatePath) {
    throw new RenderFailedError(
      `Template not found: ${templateName} (in ${input.workspace.root}/templates/)`,
    );
  }
  const templateSource = readFileSync(templatePath, "utf8");

  // v0.2 will support <name>.prep.ts; for v0.1 raise if a prep file is present.
  const prepName = templateName.replace(/\.[^.]+\.hbs$/, ".prep.ts");
  if (input.workspace.prepPaths.has(prepName)) {
    throw new RenderFailedError(
      `Prep file ${prepName} detected — prep support is deferred to v0.2 (Composer v0.1 supports Handlebars-only templates).`,
    );
  }

  const renderCtx: Record<string, unknown> = { ...node, spec_path: input.specRelPath };

  const hb = Handlebars.create();
  registerHelpers(hb, input.slotRegistry);
  let compiled: HandlebarsTemplateDelegate;
  try {
    compiled = hb.compile(templateSource, { strict: false, noEscape: true });
  } catch (err) {
    throw new RenderFailedError(
      `Template compile failed for ${templateName}: ${(err as Error).message}`,
      err,
    );
  }

  let rendered: string;
  try {
    rendered = compiled(renderCtx);
  } catch (err) {
    throw new RenderFailedError(
      `Template render failed for ${templateName}: ${(err as Error).message}`,
      err,
    );
  }

  const ext = outputPath.language || extname(outputPath.path).slice(1) || "";
  const banner = buildBanner(input.specRelPath, outputPath.path, ext);
  const blockComment = buildBlockComment(input.specRelPath, ext, {
    specLine: 1, // v0.1 source map is per-file; per-line is v0.2.
    primitive,
    nodeId,
  });

  const content = banner + blockComment + "\n" + rendered;
  const lineCount = content.split("\n").length;

  return {
    path: outputPath.path,
    content,
    language: outputPath.language,
    policy: outputPath.policy ?? "overwrite",
    sourceMap: [
      {
        line_start: 1,
        line_end: lineCount,
        spec_id: input.specId,
        spec_line: 1,
        primitive,
        node_id: nodeId,
      },
    ],
  };
}
