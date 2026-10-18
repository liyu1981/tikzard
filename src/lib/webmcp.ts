"use client";

/**
 * WebMCP bridge: expose the workbench's agent tools to the page through the
 * `document.modelContext` API so ReAgent auto-discovers them (no
 * `extraDescriptors` needed) and lists them in Settings → WebMCP.
 *
 * WebMCP is an emerging standard; browsers without native support are
 * polyfilled with `@mcp-b/webmcp-polyfill`'s `installWebMCP()`. The polyfill is
 * installed at module load, before the ReAgent provider mounts, so its mount
 * check sees a live model context. The panel keeps a host-descriptor fallback
 * for contexts where WebMCP stays unavailable (e.g. insecure origin).
 */
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { installWebMCP, type WebMCP } from "@mcp-b/webmcp-polyfill";

let installed = false;

/** Install the WebMCP runtime once (a native implementation wins). */
export function ensureWebMcpInstalled(): void {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;
  try {
    installWebMCP();
  } catch {
    // Non-secure context or unsupported engine: WebMCP stays unavailable and
    // the caller falls back to host-provided tool descriptors.
  }
}

/** Whether the page currently exposes a WebMCP model context. */
export function hasWebMcp(): boolean {
  return typeof document !== "undefined" && document.modelContext !== undefined;
}

/** Adapt one host `AgentTool` to the WebMCP tool shape. */
function toWebMcpTool(tool: AgentTool): WebMCP.ModelContextTool {
  return {
    name: tool.name,
    title: tool.label,
    description: tool.description,
    inputSchema: tool.parameters as object,
    execute: async (input, { signal }) => {
      const result = await tool.execute(
        `webmcp:${tool.name}`,
        (input ?? {}) as Record<string, unknown>,
        signal,
      );
      const text = result.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .filter((value) => value !== "")
        .join("\n");
      if (result.isError) {
        throw new Error(text === "" ? `${tool.name} failed` : text);
      }
      return text;
    },
  };
}

/**
 * Register host tools with the page's WebMCP context. Returns an unsubscribe
 * function that unregisters them (and is a no-op when WebMCP is unavailable).
 */
export function registerWebMcpTools(tools: AgentTool[]): () => void {
  const context =
    typeof document === "undefined" ? undefined : document.modelContext;
  if (context === undefined) {
    return () => undefined;
  }
  const controller = new AbortController();
  for (const tool of tools) {
    void context
      .registerTool(toWebMcpTool(tool), { signal: controller.signal })
      .catch(() => undefined);
  }
  return () => controller.abort();
}

ensureWebMcpInstalled();
