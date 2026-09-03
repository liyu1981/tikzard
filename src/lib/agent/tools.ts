/**
 * Host-app agent tools for tikzard. Each tool is a plain object with a
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
import type { EditorMutationBridge } from "./editor-mutations";
import { formatSkillPayload, getSkillByName } from "./skills";

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
    throw new Error(
      "The JSXGraph workbench is not open — this tool requires it.",
    );
  }
  return bridge;
}

export function buildAgentTools(bridge?: EditorMutationBridge): AgentTool[] {
  const getSource = tool({
    name: "get_source",
    label: "Read source",
    description:
      "Read the JSXGraph JavaScript source currently open in the workbench editor. Use before editing to see what the user is working on.",
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
      "Report the current render status of the JSXGraph preview (ready/rendering/done/error) and the last render duration in milliseconds. Use to check whether a drawing rendered successfully.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireBridge(bridge);
      const snapshot = ed.getRenderStatus();
      return textBlocks(
        `status: ${snapshot.status}\nlastRenderMs: ${snapshot.durationMs ?? "unknown"}`,
      );
    },
  });

  const setSource = tool({
    name: "set_source",
    label: "Write source",
    description:
      "Replace the entire JSXGraph source in the workbench editor; the preview re-renders automatically. If the render fails, the host forwards the error as a follow-up message so you can fix the source. Always send the complete updated source, never a fragment.",
    parameters: Type.Object({
      source: Type.String({
        description:
          "Complete JSXGraph JavaScript source to place in the editor. The source is executed as `new Function('board', 'JXG', source)(board, JXG)` where board is a live JSXGraph board.\n\nExample:\nboard.create('axis', [[0, 0], [1, 0]], { name: 'x', withLabel: true });\nboard.create('point', [1, 1], { name: 'A' });",
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireBridge(bridge);
      const source = args.source.trim();
      if (source === "") {
        throw new Error("Refusing to set an empty source.");
      }
      ed.setCode(source);
      return textBlocks(
        "Source replaced in the editor; the preview is re-rendering. You will be notified if rendering fails.",
      );
    },
  });

  const verifyInvariants = tool({
    name: "verify_invariants",
    label: "Verify invariants",
    description:
      "Execute JavaScript on the live JSXGraph board to check geometric relationships. The code expression must evaluate to a boolean. Returns the result. Use this to verify that your construction maintains its properties (e.g. angles, distances, collinearity) after creating it.",
    parameters: Type.Object({
      code: Type.String({
        description:
          "JavaScript expression that evaluates to a boolean, executed with `board` and `JXG` in scope. Examples:\n- `Math.abs(JXG.Math.rad(A, B, C) * 180 / Math.PI - 90) < 0.001` (angle ABC is 90°)\n- `Math.abs(A.X() - B.X()) < 0.001 && Math.abs(A.Y() - B.Y()) < 0.001` (A equals B)\n- `board.objects.A.visProp.visible === true` (point A is visible)",
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireBridge(bridge);
      const board = ed.getBoard();
      if (board === null) {
        throw new Error("No board is currently rendered.");
      }
      // Dynamically import JXG to access the full namespace
      const { JXG } = await import("@/lib/jsxgraph");
      const result = new Function("board", "JXG", `return (${args.code})`)(
        board,
        JXG,
      );
      return textBlocks(`result: ${String(result)}`);
    },
  });

  const saveVersion = tool({
    name: "save_version",
    label: "Save a version snapshot",
    description:
      "Persist the current source as a new version snapshot of the open document (its version number increments). Call this BEFORE set_source to checkpoint the user's current drawing before you change it — unless you are fixing a rendering bug, in which case do NOT create a snapshot of a broken state. Optionally pass a short note describing the snapshot (e.g. the change you are about to make).",
    parameters: Type.Object({
      note: Type.Optional(
        Type.String({
          description:
            "Short description of this snapshot, e.g. what the user is drawing before your change.",
        }),
      ),
    }),
    execute: async (_id, args) => {
      const ed = requireBridge(bridge);
      const number = await ed.saveVersion(args.note);
      return textBlocks(`Saved version v${number} of the current source.`);
    },
  });

  const loadSkill = tool({
    name: "load_skill",
    label: "Load skill",
    description:
      "Load the full instructions of a named skill (specialized drawing guides listed in the system prompt under <available_skills>). Call this BEFORE attempting a task that matches one of the skill descriptions, and follow the returned instructions.",
    parameters: Type.Object({
      name: Type.String({
        description: "Skill name exactly as listed in <available_skills>.",
      }),
    }),
    execute: async (_id, args) => {
      const skill = getSkillByName(args.name.trim());
      if (skill === undefined) {
        throw new Error(
          `Unknown skill "${args.name}". Call load_skill with one of the exact names listed in <available_skills>.`,
        );
      }
      return textBlocks(formatSkillPayload(skill));
    },
  });

  return [
    getSource,
    getRenderStatus,
    setSource,
    verifyInvariants,
    saveVersion,
    loadSkill,
  ] as unknown as AgentTool[];
}
