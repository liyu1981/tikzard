"use client";

import { useAtomValue, useSetAtom } from "jotai";
import type * as React from "react";
import { useEffect, useState } from "react";
import { EditableTitle } from "@/components/editable-title";
import { OpenDocumentMenu } from "@/components/open-document-menu";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TikzWorkbench } from "@/components/tikz-workbench";
import { WelcomePage } from "@/components/welcome-page";
import { listDocuments } from "@/lib/documents";
import { currentDocIdAtom, entryGateAtom } from "@/lib/workbench-state";

export default function Home() {
  const entryGate = useAtomValue(entryGateAtom);
  const setEntryGate = useSetAtom(entryGateAtom);
  const currentDocId = useAtomValue(currentDocIdAtom);
  const [checkKey, setCheckKey] = useState(0);

  // Decide the landing view from the document store exactly once per
  // mount: zero stored documents -> welcome page, otherwise workbench.
  // Storage failures fall through to the workbench so the app stays usable.
  // Re-checked whenever documents change (e.g. the last one was deleted):
  // an in-progress unsaved document (currentDocId set by the workbench)
  // always keeps the workbench visible.
  // biome-ignore lint/correctness/useExhaustiveDependencies: checkKey is a deliberate re-trigger bumped when documents change on disk
  useEffect(() => {
    let cancelled = false;
    void listDocuments()
      .then((docs) => {
        if (!cancelled) {
          setEntryGate(
            docs.length > 0 || currentDocId !== null ? "workbench" : "welcome",
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntryGate("workbench");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setEntryGate, checkKey, currentDocId]);

  // Documents can be removed from the header menu; listen for that so the
  // empty-store state is picked up without a manual reload.
  useEffect(() => {
    const onDocsChanged = () => setCheckKey((key) => key + 1);
    window.addEventListener("tikzard:docs-changed", onDocsChanged);
    return () =>
      window.removeEventListener("tikzard:docs-changed", onDocsChanged);
  }, []);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col px-6 pt-16">
      <header className="fixed inset-x-0 top-0 z-20">
        <div className="apple-panel">
          <div className="mx-auto flex h-12 max-w-[1920px] items-center gap-2 px-6">
            <OpenDocumentMenu />
            <EditableTitle />
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
        <span className="text-carved font-medium tracking-wide">TikZard</span>
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
