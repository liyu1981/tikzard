/**
 * Bridge from the agent's write tools into the live TikzWorkbench UI state.
 *
 * The agent has NO backend write tools. It mutates the open workbench's
 * source through this interface only — changes land in the editor and the
 * preview immediately but live in React state, so nothing outlives the page
 * unless the user keeps it. Writes apply directly, without a confirmation
 * gate, by product decision.
 */
export interface RenderStatusSnapshot {
  status: "booting" | "ready" | "rendering" | "done" | "timeout" | "loadError";
  durationMs: number | null;
}

export interface EditorMutationBridge {
  getCode: () => string;
  setCode: (code: string) => void;
  /** Currently enabled optional LaTeX package ids (see tikz-packages). */
  getPackages: () => string[];
  /** Replace the enabled optional LaTeX package ids for the open diagram. */
  setPackages: (ids: string[]) => void;
  /** Currently enabled TikZ/PGF library ids (see tikz-packages). */
  getLibraries: () => string[];
  /** Replace the enabled TikZ/PGF library ids for the open diagram. */
  setLibraries: (ids: string[]) => void;
  getRenderStatus: () => RenderStatusSnapshot;
  /**
   * Persist the current editor source as a new version snapshot for the open
   * document, tagged as saved by the agent. Resolves with the created version
   * number, or rejects when no document is open.
   */
  saveVersion: (note?: string) => Promise<number>;
  /**
   * Resolves once a compile triggered after this call reaches a terminal
   * state ("done" | "timeout" | "loadError"), or on timeout — whichever
   * comes first. Lets write tools report the real compile outcome.
   */
  waitForRender: (timeoutMs?: number) => Promise<RenderStatusSnapshot>;
}
