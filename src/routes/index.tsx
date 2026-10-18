import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { GithubIcon, XIcon } from "@/components/agent/icons";
import { EditableTitle } from "@/components/editable-title";
import { OpenDocumentMenu } from "@/components/open-document-menu";
import {
  SettingsDialog,
  settingsRequestAtom,
} from "@/components/settings-dialog";
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
  librariesAtom,
  packagesAtom,
} from "@/lib/workbench-state";

function Home() {
  const { t } = useTranslation();
  const entryGate = useAtomValue(entryGateAtom);
  const setEntryGate = useSetAtom(entryGateAtom);
  const setCode = useSetAtom(codeAtom);
  const setDocTitle = useSetAtom(docTitleAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const setPackages = useSetAtom(packagesAtom);
  const setLibraries = useSetAtom(librariesAtom);
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
          setPackages(doc.packages ?? []);
          setLibraries(doc.libraries ?? []);
          setCurrentDocId(doc.id);
          setEntryGate("workbench");
        } else {
          setLastOpenedDocId(null);
          setPackages([]);
          setLibraries([]);
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
  }, [
    setCode,
    setCurrentDocId,
    setDocTitle,
    setEntryGate,
    setLibraries,
    setPackages,
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col px-6 pt-16">
      <header className="fixed inset-x-0 top-0 z-20">
        <div className="apple-panel">
          <div className="mx-auto flex h-12 max-w-[1920px] items-center gap-2 px-6">
            <OpenDocumentMenu />
            {/* The title is always mounted so the settings button stays
                pinned right; with no document open it is empty and
                non-editable. The close button is document-scoped only.
                Theme and language live in Settings → System. */}
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

export const Route = createFileRoute("/")({
  component: Home,
});
