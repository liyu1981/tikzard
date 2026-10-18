/**
 * Host-app agent tools for tikzard, packaged as ReAgent tool descriptors.
 * Each descriptor appears in ReAgent's Tools settings panel (so users can
 * switch it off) and is built lazily through the mutation bridge.
 *
 * All tools are backed by the host workbench state through the mutation
 * bridge (see editor-mutations.ts). They NEVER call backend APIs — changes
 * land in the live editor/preview immediately.
 */
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type TSchema, Type } from "@earendil-works/pi-ai";
import type { AgentToolDescriptor } from "@liyu1981/reagent";
import {
  COMPILE_FAILURE_PATTERN,
  getCompileLogsSince,
  getLastCompileLogId,
} from "@/lib/compile-logs";
import {
  SUPPORTED_LIBRARY_IDS,
  SUPPORTED_PACKAGE_IDS,
  validateLibraryIds,
  validatePackageIds,
} from "@/lib/tikz-packages";
import type { EditorMutationBridge } from "./editor-mutations";

const MAX_SOURCE_CHARS = 20000;
/** Compiler output embedded in a tool result is truncated to this. */
const MAX_COMPILE_OUTPUT_CHARS = 4000;

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

export function buildTikzTools(bridge?: EditorMutationBridge): AgentTool[] {
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
      "Replace the entire TikZ source in the workbench editor and wait for the preview to recompile. Returns the compile result. If compilation fails, the result contains the compiler output — fix the source and call set_tikz_source again with the complete corrected tikzpicture. Always send the complete updated tikzpicture, never a fragment.",
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
      if (source === ed.getCode().trim()) {
        return textBlocks(
          "The editor already contains exactly this source; nothing changed.",
        );
      }
      const marker = getLastCompileLogId();
      ed.setCode(source);
      const result = await ed.waitForRender();
      if (result.status === "done") {
        return textBlocks(
          "Source replaced in the editor and the preview compiled successfully.",
        );
      }
      const output = getCompileLogsSince(marker)
        .filter(
          (entry) =>
            entry.level === "error" || COMPILE_FAILURE_PATTERN.test(entry.text),
        )
        .map((entry) => entry.text)
        .join("\n");
      return textBlocks(
        `Compilation FAILED. Fix the source and call set_tikz_source again with the complete corrected tikzpicture.\n\nCompiler output:\n${truncate(output || "(no compiler output captured)", MAX_COMPILE_OUTPUT_CHARS)}`,
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
    getPackages,
    setPackages,
    getLibraries,
    setLibraries,
  ] as unknown as AgentTool[];
}

/**
 * The tikzard tool descriptors handed to ReAgent's `extraDescriptors` prop.
 * ReAgent builds their instances (via `build`) when a session starts and lists
 * them in Settings → Tools, where each can be switched off.
 */
export function buildTikzToolDescriptors(
  bridge?: EditorMutationBridge,
): AgentToolDescriptor[] {
  return buildTikzTools(bridge).map((instance) => ({
    id: instance.name,
    name: instance.name,
    label: instance.label,
    description: instance.description,
    group: "editor",
    defaultEnabled: true,
    build: () => instance,
  }));
}
