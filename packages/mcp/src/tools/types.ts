// Internal: tool definition shape shared by tool modules and server.ts.
//
// A `ToolDef` is transport-agnostic: same shape used by the in-process
// `createServer` dispatcher (tests) and by the stdio MCP-SDK server
// (production agent attach).

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (cwd: string, args: unknown) => Promise<unknown>;
}
