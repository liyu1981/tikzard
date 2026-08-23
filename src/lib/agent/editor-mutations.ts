/**
 * Bridge from the agent's write tools into the live TikzWorkbench UI state.
 *
 * The agent has NO backend write tools. It mutates the open workbench's
 * source through this interface only — changes land in the editor and the
 * preview immediately but live in React state, so nothing outlives the page
 * unless the user keeps it. Every write is routed through requestConfirm().
 */
export interface RenderStatusSnapshot {
  status: "booting" | "ready" | "rendering" | "done" | "timeout" | "loadError";
  durationMs: number | null;
}

export interface EditorMutationBridge {
  getCode: () => string;
  setCode: (code: string) => void;
  getRenderStatus: () => RenderStatusSnapshot;
}
