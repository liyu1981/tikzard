export type Status =
  | "booting"
  | "ready"
  | "rendering"
  | "done"
  | "timeout"
  | "loadError";

export type RightTab = "preview" | "logs";

export const STATUS_KEY: Record<Status, string> = {
  booting: "workbench.statusBooting",
  ready: "workbench.statusReady",
  rendering: "workbench.statusRendering",
  done: "workbench.statusDone",
  timeout: "workbench.statusTimeout",
  loadError: "workbench.statusLoadError",
};

export const STATUS_DOT: Record<Status, string> = {
  booting: "bg-neutral-400",
  ready: "bg-emerald-500",
  rendering: "animate-pulse bg-amber-500",
  done: "bg-emerald-500",
  timeout: "bg-red-500",
  loadError: "bg-red-500",
};

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export const TAB_PILL =
  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition duration-150";
