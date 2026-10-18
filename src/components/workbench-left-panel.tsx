"use client";

import { useTranslation } from "react-i18next";
import { CheckIcon, HistoryIcon } from "@/components/agent/icons";
import { TikzAgentPanel } from "@/components/agent/reagent-panel";
import { type TagSuggestion, TexTagInput } from "@/components/tex-tag-input";
import { TikzEditor } from "@/components/tikz-editor";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VersionBrowser } from "@/components/version-browser";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import type { LeftTab } from "@/lib/workbench-state";

interface Props {
  code: string;
  leftTab: LeftTab;
  busy: boolean;
  agentBridge: EditorMutationBridge;
  nextVersionNo: number | null;
  saveVersionState: "idle" | "saving" | "saved";
  versionsOpen: boolean;
  packages: string[];
  libraries: string[];
  packageSuggestions: TagSuggestion[];
  librarySuggestions: TagSuggestion[];
  onCodeChange: (code: string) => void;
  onLeftTabChange: (tab: LeftTab) => void;
  onRender: () => void;
  onSaveVersion: () => void;
  onVersionsOpenChange: (open: boolean) => void;
  onPackagesChange: (ids: string[]) => void;
  onLibrariesChange: (ids: string[]) => void;
  onRestoreVersion: Parameters<typeof VersionBrowser>[0]["onRestore"];
}

const TAB_PILL =
  "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition duration-150";

export function WorkbenchLeftPanel({
  code,
  leftTab,
  busy,
  agentBridge,
  nextVersionNo,
  saveVersionState,
  versionsOpen,
  packages,
  libraries,
  packageSuggestions,
  librarySuggestions,
  onCodeChange,
  onLeftTabChange,
  onRender,
  onSaveVersion,
  onVersionsOpenChange,
  onPackagesChange,
  onLibrariesChange,
  onRestoreVersion,
}: Props) {
  const { t } = useTranslation();
  const tabs: { id: LeftTab; labelKey: string }[] = [
    { id: "assistant", labelKey: "agent.title" },
    { id: "instruction", labelKey: "workbench.editorLabel" },
  ];

  return (
    <div className="glass-control flex min-h-0 flex-col gap-2 rounded-xl bg-clip-padding p-4">
      <div className="flex h-8 shrink-0 items-center justify-between">
        <div
          role="tablist"
          aria-label={t("workbench.tabsLabel")}
          className="flex items-center gap-0.5 rounded-full border border-border/40 bg-background/50 p-0.5 shadow-sm backdrop-blur-md"
        >
          {tabs.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={leftTab === id}
              onClick={() => onLeftTabChange(id)}
              className={`${TAB_PILL} ${leftTab === id ? "bg-white/15 text-foreground shadow-sm dark:bg-white/15" : "text-muted-foreground hover:bg-neutral-500/10 hover:text-foreground"}`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onVersionsOpenChange(true)}
              aria-label={t("workbench.history")}
              title={t("workbench.history")}
              className="glass-control !border-border/60 flex size-7 items-center justify-center rounded-full bg-clip-padding p-1.5 text-muted-foreground transition duration-150 hover:-translate-y-px hover:brightness-[1.06] hover:text-foreground active:scale-[0.98]"
            >
              <HistoryIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("workbench.history")}</TooltipContent>
        </Tooltip>
      </div>
      <div className={leftTab === "instruction" ? "contents" : "hidden"}>
        <TexTagInput
          label={t("workbench.packages")}
          placeholder={t("workbench.packagesPlaceholder")}
          removeLabel={(id) => t("workbench.packagesRemove", { id })}
          genericDescription=""
          suggestions={packageSuggestions}
          selected={packages}
          onChange={onPackagesChange}
        />
        <TexTagInput
          label={t("workbench.libraries")}
          placeholder={t("workbench.librariesPlaceholder")}
          removeLabel={(id) => t("workbench.librariesRemove", { id })}
          genericDescription={t("workbench.libraryGeneric")}
          suggestions={librarySuggestions}
          selected={libraries}
          onChange={onLibrariesChange}
        />
        <TikzEditor value={code} onChange={onCodeChange} />
        <div className="flex h-9 shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onRender}
              className="glass-control !border-border/60 rounded-lg bg-clip-padding px-4 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("workbench.render")}
            </button>
            <button
              type="button"
              disabled={saveVersionState !== "idle"}
              onClick={onSaveVersion}
              title={t("workbench.saveVersion")}
              className={`glass-control !border-border/60 inline-flex items-center gap-1 rounded-lg bg-clip-padding px-3 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${saveVersionState === "saved" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
            >
              {saveVersionState === "saving" ? (
                <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              {saveVersionState === "saved"
                ? t("workbench.saved")
                : nextVersionNo === null
                  ? t("workbench.saveVersion")
                  : t("workbench.saveVersionNumbered", {
                      number: nextVersionNo,
                    })}
            </button>
          </div>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {t("workbench.hint")}
          </p>
        </div>
      </div>
      <div className={leftTab === "assistant" ? "min-h-0 flex-1" : "hidden"}>
        <TikzAgentPanel agentBridge={agentBridge} className="h-full" />
      </div>
      <VersionBrowser
        open={versionsOpen}
        onOpenChange={onVersionsOpenChange}
        onRestore={onRestoreVersion}
      />
    </div>
  );
}
