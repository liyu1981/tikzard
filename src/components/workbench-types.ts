export type Status = "ready" | "rendering" | "done" | "error";

export type RightTab = "preview" | "logs";

export const STATUS_KEY: Record<Status, string> = {
  ready: "workbench.statusReady",
  rendering: "workbench.statusRendering",
  done: "workbench.statusDone",
  error: "workbench.statusError",
};

export const STATUS_DOT: Record<Status, string> = {
  ready: "bg-emerald-500",
  rendering: "animate-pulse bg-amber-500",
  done: "bg-emerald-500",
  error: "bg-red-500",
};

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export const TAB_PILL =
  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition duration-150";
