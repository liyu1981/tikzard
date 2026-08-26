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
import {
  SUPPORTED_LIBRARY_IDS,
  SUPPORTED_PACKAGE_IDS,
  validateLibraryIds,
  validatePackageIds,
} from "@/lib/tikz-packages";
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
      "Replace the entire TikZ source in the workbench editor; the preview recompiles automatically. If the compile fails, the host forwards the compiler output as a follow-up message so you can fix the source. Always send the complete updated tikzpicture, never a fragment.",
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
      ed.setCode(source);
      return textBlocks(
        "Source replaced in the editor; the preview is recompiling. You will be notified if compilation fails.",
      );
    },
  });

  const saveVersion = tool({
    name: "save_tikz_version",
    label: "Save a version snapshot",
    description:
      "Persist the current TikZ source as a new version snapshot of the open document (its version number increments). Call this BEFORE set_tikz_source to checkpoint the user's current drawing before you change it — unless you are fixing a compilation bug, in which case do NOT create a snapshot of a broken state. Optionally pass a short note describing the snapshot (e.g. the change you are about to make).",
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

  const getPackages = tool({
    name: "get_tikz_packages",
    label: "Read TikZ packages",
    description:
      "Report the optional LaTeX packages currently selected for the open diagram. Use to check which packages are enabled before drawing.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireBridge(bridge);
      const ids = ed.getPackages();
      return textBlocks(
        ids.length > 0
          ? `enabledPackages: ${ids.join(", ")}`
          : "enabledPackages: (none — core TikZ/PGF only)",
      );
    },
  });

  const setPackages = tool({
    name: "set_tikz_packages",
    label: "Set TikZ packages",
    description: `Select which optional LaTeX packages the current diagram needs. Pass the exact package ids; the preview recompiles automatically. Use this instead of writing \\usepackage in the source. Supported ids: ${[...SUPPORTED_PACKAGE_IDS].join(", ")}.`,
    parameters: Type.Object({
      packages: Type.Array(
        Type.String({
          description:
            'Package ids to enable, e.g. ["circuitikz"] or ["chemfig","tkz-tab"]. Pass an empty array to use core TikZ/PGF only.',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const ed = requireBridge(bridge);
      const { valid, invalid } = validatePackageIds(args.packages);
      if (invalid.length > 0) {
        throw new Error(
          `Unsupported package ids: ${invalid.join(", ")}. Supported: ${[...SUPPORTED_PACKAGE_IDS].join(", ")}.`,
        );
      }
      ed.setPackages(valid);
      return textBlocks(
        `Enabled packages: ${valid.length > 0 ? valid.join(", ") : "(none — core TikZ/PGF only)"}. The preview is recompiling.`,
      );
    },
  });

  const getLibraries = tool({
    name: "get_tikz_libraries",
    label: "Read TikZ libraries",
    description:
      "Report the TikZ/PGF libraries currently selected for the open diagram. Use to check which libraries are enabled before drawing.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireBridge(bridge);
      const ids = ed.getLibraries();
      return textBlocks(
        ids.length > 0
          ? `enabledLibraries: ${ids.join(", ")}`
          : "enabledLibraries: (none)",
      );
    },
  });

  const setLibraries = tool({
    name: "set_tikz_libraries",
    label: "Set TikZ libraries",
    description: `Select which TikZ/PGF libraries the current diagram needs (replaces \\usetikzlibrary in the source). Pass exact library ids; the preview recompiles automatically. Supported ids include: arrows.meta, positioning, calc, fit, automata, quotes, decorations.pathmorphing, decorations.markings, shapes.geometric, matrix, patterns, shadows. Call get_tikz_libraries or ask the user for the full bundled list.`,
    parameters: Type.Object({
      libraries: Type.Array(
        Type.String({
          description:
            'Library ids to enable, e.g. ["arrows.meta","positioning"]. Pass an empty array to disable all.',
        }),
      ),
    }),
    execute: async (_id, args) => {
      const ed = requireBridge(bridge);
      const { valid, invalid } = validateLibraryIds(args.libraries);
      if (invalid.length > 0) {
        throw new Error(
          `Unsupported library ids: ${invalid.join(", ")}. Use ids exactly as TikZ names them, e.g. "${[...SUPPORTED_LIBRARY_IDS].slice(0, 12).join('", "')}".`,
        );
      }
      ed.setLibraries(valid);
      return textBlocks(
        `Enabled libraries: ${valid.length > 0 ? valid.join(", ") : "(none)"}. The preview is recompiling.`,
      );
    },
  });

  return [
    getSource,
    getRenderStatus,
    setSource,
    saveVersion,
    loadSkill,
    getPackages,
    setPackages,
    getLibraries,
    setLibraries,
  ] as unknown as AgentTool[];
}
