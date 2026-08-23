"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TrashIcon } from "@/components/agent/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteDocument,
  listDocuments,
  loadDocument,
  type TikzDocumentMeta,
} from "@/lib/documents";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
} from "@/lib/workbench-state";

function FolderOpenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function formatRelative(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/** Dropdown document browser anchored to the header's folder button. */
export function OpenDocumentMenu() {
  const { t } = useTranslation();
  const setCode = useSetAtom(codeAtom);
  const setDocTitle = useSetAtom(docTitleAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const currentDocId = useAtomValue(currentDocIdAtom);
  const [docs, setDocs] = useState<TikzDocumentMeta[]>([]);

  async function refresh() {
    try {
      setDocs(await listDocuments());
    } catch {
      setDocs([]);
    }
  }

  async function handleOpen(id: string) {
    const doc = await loadDocument(id);
    if (doc === undefined) {
      return;
    }
    setCode(doc.code);
    setDocTitle(doc.title);
    setCurrentDocId(doc.id);
  }

  async function handleDelete(id: string) {
    await deleteDocument(id);
    setDocs((prev) => prev.filter((doc) => doc.id !== id));
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          void refresh();
        }
      }}
    >
      <DropdownMenuTrigger
        aria-label={t("documents.open")}
        className="glass-control flex size-9 items-center justify-center rounded-full bg-clip-padding p-2 text-muted-foreground transition duration-150 hover:text-foreground active:scale-[0.95]"
      >
        <FolderOpenIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1 text-xs">
        <DropdownMenuLabel className="px-2 py-1.5">
          {t("documents.open")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto px-1 pb-1">
          {docs.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground">
              {t("documents.empty")}
            </p>
          ) : (
            <div className="space-y-0.5">
              {docs.map((doc) => {
                const active = doc.id === currentDocId;
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-1 rounded-lg ${
                      active ? "bg-primary/10" : "hover:bg-foreground/[0.06]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void handleOpen(doc.id)}
                      className="min-w-0 flex-1 px-2 py-1.5 text-left"
                    >
                      <span className="block truncate font-medium text-foreground/90">
                        {doc.title}
                      </span>
                      <span className="block text-[0.65rem] text-muted-foreground tabular-nums">
                        {t("documents.editedAgo", {
                          time: formatRelative(doc.updatedAt),
                        })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(doc.id)}
                      aria-label={t("documents.delete")}
                      title={t("documents.delete")}
                      className="mr-1 rounded-md p-1 text-muted-foreground transition duration-150 hover:bg-foreground/[0.06] hover:text-red-500 active:scale-[0.95]"
                    >
                      <TrashIcon className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
