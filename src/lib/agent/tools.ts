/**
 * Host-app agent tools for prompt-tikz. Each tool is a plain object with a
 * TypeBox parameter schema; execute() returns text blocks or throws.
 *
 * Two tool classes:
 * - Read-only: backed by the host workbench state. No side effects.
 * - Bridge writes: mutate live workbench UI state through the mutation bridge
 *   (see editor-mutations.ts). NEVER call backend APIs — changes land in the
 *   UI immediately but persist only within the open page.
 */
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type TSchema, Type } from "@earendil-works/pi-ai";
import { requestConfirm } from "./confirm";
import type { EditorMutationBridge } from "./editor-mutations";

const MAX_SOURCE_CHARS = 20000;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}

function textBlocks(...texts: string[]) {
  return {
    content: texts
      .filter((t) => t !== "")
      .map((text) => ({ type: "text" as const, text })),
    details: {},
  };
}

function tool<S extends TSchema>(t: AgentTool<S>): AgentTool<S> {
  return t;
}

function requireBridge(
  bridge: EditorMutationBridge | undefined,
): EditorMutationBridge {
  if (bridge === undefined) {
    throw new Error("The TikZ workbench is not open — this tool requires it.");
  }
  return bridge;
}

export function buildAgentTools(bridge?: EditorMutationBridge): AgentTool[] {
  const getSource = tool({
    name: "get_tikz_source",
    label: "Read TikZ source",
    description:
      "Read the TikZ/LaTeX source currently open in the workbench editor. Use before editing to see what the user is working on.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireBridge(bridge);
      return textBlocks(truncate(ed.getCode(), MAX_SOURCE_CHARS));
    },
  });

  const getRenderStatus = tool({
    name: "get_render_status",
    label: "Get render status",
    description:
      "Report the current compile status of the TikZ preview (booting/ready/rendering/done/timeout/loadError) and the last compile duration in milliseconds. Use to check whether a drawing compiled successfully.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireBridge(bridge);
      const snapshot = ed.getRenderStatus();
      return textBlocks(
        `status: ${snapshot.status}\nlastCompileMs: ${snapshot.durationMs ?? "unknown"}`,
      );
    },
  });

  const setSource = tool({
    name: "set_tikz_source",
    label: "Write TikZ source",
    description:
      "Replace the entire TikZ source in the workbench editor. The change appears immediately in the editor and re-renders the preview, but only lives in the open page's state. Always read the current source first and send the complete updated document, never a fragment.",
    parameters: Type.Object({
      source: Type.String({
        description:
          "Complete tikzpicture LaTeX source to place in the editor, e.g.\n\\begin{tikzpicture}\n  \\draw[->] (0,0) -- (1,1);\n\\end{tikzpicture}",
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireBridge(bridge);
      const source = args.source.trim();
      if (source === "") {
        throw new Error("Refusing to set an empty source.");
      }
      const lines = source.split("\n").length;
      const ok = await requestConfirm(
        "setSource",
        `${lines} ${lines === 1 ? "line" : "lines"} · ${source.length} chars`,
        source,
      );
      if (!ok) {
        throw new Error("The user declined this edit.");
      }
      ed.setCode(source);
      return textBlocks(
        "Source replaced in the editor and sent to the preview renderer (page-state only).",
      );
    },
  });

  return [getSource, getRenderStatus, setSource] as unknown as AgentTool[];
}
