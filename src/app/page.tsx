"use client";

import { useAtomValue, useSetAtom } from "jotai";
import type * as React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@/components/agent/icons";
import { EditableTitle } from "@/components/editable-title";
import { OpenDocumentMenu } from "@/components/open-document-menu";
import {
  SettingsDialog,
  settingsRequestAtom,
} from "@/components/settings-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TikzWorkbench } from "@/components/tikz-workbench";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WelcomePage } from "@/components/welcome-page";
import {
  getLastOpenedDocId,
  loadDocument,
  setLastOpenedDocId,
} from "@/lib/documents";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
  entryGateAtom,
} from "@/lib/workbench-state";

export default function Home() {
  const { t } = useTranslation();
  const entryGate = useAtomValue(entryGateAtom);
  const setEntryGate = useSetAtom(entryGateAtom);
  const setCode = useSetAtom(codeAtom);
  const setDocTitle = useSetAtom(docTitleAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const setSettingsRequest = useSetAtom(settingsRequestAtom);

  // Leaving an open document: its latest state is already autosaved to
  // IndexedDB, so closing clears the last-opened pointer and swaps back to
  // the welcome page (the workbench remounts fresh when a document opens).
  function closeDocument() {
    setLastOpenedDocId(null);
    setEntryGate("welcome");
  }

  // Landing view is decided by the last-opened pointer, not by store size:
  // if one exists (and still resolves) we open it, otherwise we show the
  // welcome page. A stale pointer is dropped so the app doesn't boot to a
  // workbench for a deleted document. Storage failures fall through to the
  // welcome page so the app stays usable.
  useEffect(() => {
    let cancelled = false;
    const lastId = getLastOpenedDocId();
    if (lastId === null) {
      setEntryGate("welcome");
      return () => {
        cancelled = true;
      };
    }
    void loadDocument(lastId)
      .then((doc) => {
        if (cancelled) {
          return;
        }
        if (doc !== undefined) {
          setCode(doc.code);
          setDocTitle(doc.title);
          setCurrentDocId(doc.id);
          setEntryGate("workbench");
        } else {
          setLastOpenedDocId(null);
          setEntryGate("welcome");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLastOpenedDocId(null);
          setEntryGate("welcome");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setCode, setCurrentDocId, setDocTitle, setEntryGate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col px-6 pt-16">
      <header className="fixed inset-x-0 top-0 z-20">
        <div className="apple-panel">
          <div className="mx-auto flex h-12 max-w-[1920px] items-center gap-2 px-6">
            <OpenDocumentMenu />
            {/* The title is always mounted so the settings and theme buttons
                stay pinned to the right; with no document open it is empty
                and non-editable. The close button is document-scoped only. */}
            <EditableTitle disabled={entryGate === "welcome"} />
            {entryGate === "workbench" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("documents.close")}
                    onClick={closeDocument}
                    className="glass-control flex size-9 items-center justify-center rounded-full bg-clip-padding p-2 text-muted-foreground transition duration-150 hover:text-foreground active:scale-[0.95]"
                  >
                    <XIcon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("documents.close")}</TooltipContent>
              </Tooltip>
            )}
            <div className="flex items-center gap-2">
              <SettingsDialog />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>
      {/* Fixed app shell: the workbench (or welcome page) gets exactly the
          space below the fixed header, so the page itself never scrolls —
          panels scroll internally instead. While the store check is pending,
          render nothing to avoid flashing the wrong landing view. */}
      <div className="h-[calc(100dvh-7rem)] min-h-0 w-full py-6">
        {entryGate === "workbench" && <TikzWorkbench />}
        {entryGate === "welcome" && <WelcomePage />}
      </div>
      <footer className="flex h-12 shrink-0 items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setSettingsRequest({ open: true, tab: "about" })}
          title={t("settings.tabAbout")}
          className="text-carved inline-flex items-center rounded-md px-1 py-0.5 font-medium tracking-wide transition-colors hover:text-foreground"
        >
          TikZard
        </button>
        <span aria-hidden="true" className="text-border">
          ·
        </span>
        <a
          href="https://github.com/liyu1981/tikzard"
          target="_blank"
          rel="noreferrer"
          className="text-carved inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
        >
          <GithubIcon className="size-3.5" />
          GitHub
        </a>
      </footer>
    </main>
  );
}

function GithubIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.405 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
