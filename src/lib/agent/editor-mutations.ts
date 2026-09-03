"use client";

/**
 * Bridge from the agent's write tools into the live Workbench UI state.
 *
 * The agent has NO backend write tools. It mutates the open workbench's
 * source through this interface only — changes land in the editor and the
 * preview immediately but live in React state, so nothing outlives the page
 * unless the user keeps it. Writes apply directly, without a confirmation
 * gate, by product decision.
 */
export interface RenderStatusSnapshot {
  status: "ready" | "rendering" | "done" | "error";
  durationMs: number | null;
}

export interface EditorMutationBridge {
  getCode: () => string;
  setCode: (code: string) => void;
  getRenderStatus: () => RenderStatusSnapshot;
  /**
   * Get the live JSXGraph board instance, or null if no board is rendered.
   * Used by the verify_invariants tool to test geometric relationships.
   */
  getBoard: () => unknown | null;
  /**
   * Persist the current editor source as a new version snapshot for the open
   * document, tagged as saved by the agent. Resolves with the created version
   * number, or rejects when no document is open.
   */
  saveVersion: (note?: string) => Promise<number>;
  /**
   * Resolves once a render triggered after this call reaches a terminal
   * state ("done" | "error"), or on timeout — whichever comes first. Lets
   * write tools report the real render outcome.
   */
  waitForRender: (timeoutMs?: number) => Promise<RenderStatusSnapshot>;
}
