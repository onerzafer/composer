// T036 — Pipeline phase: render to in-memory RenderedFile[].
//
// Walks the spec tree, resolves output paths via OutputMap, compiles each
// primitive's Handlebars template, and prepends the DO-NOT-EDIT banner +
// per-block source-map comment.
//
// Prep support (v0.2 deferral #2 — optional <primitive>.prep.ts): when a
// prep file exists for a primitive, it is bundled (`loadPrep`) and executed
// in a sandboxed vm (`runPrepInSandbox`); its return value is merged over
// the node before templating. See design "Prep Loader — Minimal Design".

import Handlebars from "handlebars";
type HandlebarsTemplateDelegate = (context: unknown) => string;
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { CompiledCatalog } from "@composer/typescript";
import type { OutputMap, OutputPath, SlotRegistry } from "@composer/adapter-kit";
import type { EffectiveWorkspace } from "../../workspace/layer.js";
import { registerHelpers } from "../../render/helpers.js";
import { buildBanner, buildBlockComment } from "../../render/banner.js";
import { loadPrep } from "../../render/prep-loader.js";
import { PrepStageError, runPrepInSandbox } from "../../render/sandbox.js";
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

/**
 * Resolve the provenance id a node is recorded under in the banner,
 * per-block comment, and sourcemap entry. Most primitives carry an explicit
 * `id`; top-level primitives like `Page` identify themselves by `slug`
 * instead (there is no separate `id` field). Falling back to `slug` keeps
 * that provenance out of "unknown" — only nodes with neither field land there.
 */
function resolveNodeId(node: PrimitiveNode): string {
  if (typeof node.id === "string" && node.id.length > 0) return node.id;
  const slug = node["slug"];
  if (typeof slug === "string" && slug.length > 0) return slug;
  return "unknown";
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
  const nodeId = resolveNodeId(node);

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

  const prepName = templateName.replace(/\.[^.]+\.hbs$/, ".prep.ts");
  const prepPath = input.workspace.prepPaths.get(prepName);

  let renderCtx: Record<string, unknown> = { ...node, spec_path: input.specRelPath };
  if (prepPath) {
    try {
      const { source } = await loadPrep(prepPath);
      const prepResult = await runPrepInSandbox(source, node, {
        slots: input.slotRegistry,
        tokens: input.workspace.tokens ?? {},
      });
      // Prep keys win over node keys; spec_path is reserved and always
      // engine-set, so it is applied last regardless of what prep returns.
      renderCtx = { ...node, ...prepResult, spec_path: input.specRelPath };
    } catch (err) {
      const stage = err instanceof PrepStageError ? err.stage : "exec";
      const innerMessage =
        typeof (err as { message?: unknown } | null | undefined)?.message === "string"
          ? (err as { message: string }).message
          : String(err);
      throw new RenderFailedError(
        `Prep failed for ${primitive} (node ${nodeId}) in ${prepName} [${stage}]: ${innerMessage}`,
        err,
      );
    }
  }

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
