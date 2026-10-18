import { useAtomValue, useSetAtom } from "jotai";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageIcon, TrashIcon } from "@/components/agent/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deleteDocument,
  listDocuments,
  loadDocument,
  saveDocument,
  setLastOpenedDocId,
  type TikzDocument,
  type TikzDocumentMeta,
} from "@/lib/documents";
import {
  exportDocumentById,
  type ProjectExportPayload,
} from "@/lib/project-export";
import { deleteVersions, importVersions } from "@/lib/versions";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
  entryGateAtom,
  librariesAtom,
  NEW_DOCUMENT_CODE,
  packagesAtom,
} from "@/lib/workbench-state";

/** Documents shown per page in the 3×3 gallery grid. */
const PAGE_SIZE = 9;

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

function PlusIcon(props: React.ComponentProps<"svg">) {
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
      {...props}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CopyIcon(props: React.ComponentProps<"svg">) {
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
      {...props}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function ImportIcon(props: React.ComponentProps<"svg">) {
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
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function ChevronLeftIcon() {
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
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
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
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ImagePlaceholderIcon() {
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
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
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

interface DocumentRow extends TikzDocumentMeta {
  thumbUrl?: string;
}

/** Thumbnail slot: the stored snapshot, or a placeholder when missing. */
function DocThumb({ url }: { url?: string }) {
  if (!url) {
    return (
      <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/50 text-muted-foreground/50 shadow-sm">
        <ImagePlaceholderIcon />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-32 w-32 shrink-0 rounded-xl border border-border/40 bg-white object-contain shadow-md"
    />
  );
}

/** Dropdown document browser anchored to the header's folder button. */
export function OpenDocumentMenu() {
  const { t } = useTranslation();
  const setCode = useSetAtom(codeAtom);
  const setPackages = useSetAtom(packagesAtom);
  const setLibraries = useSetAtom(librariesAtom);
  const setDocTitle = useSetAtom(docTitleAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const currentDocId = useAtomValue(currentDocIdAtom);
  const setEntryGate = useSetAtom(entryGateAtom);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const thumbUrlsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      for (const url of thumbUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  async function refresh() {
    try {
      const metas = await listDocuments();
      for (const url of thumbUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      thumbUrlsRef.current = [];
      setDocs(
        metas.map((meta) => {
          if (!meta.thumbnail) {
            return meta;
          }
          const url = URL.createObjectURL(meta.thumbnail);
          thumbUrlsRef.current.push(url);
          return { ...meta, thumbUrl: url };
        }),
      );
    } catch {
      setDocs([]);
    }
  }

  // Start a fresh document: seed the starter source and clear the id so the
  // workbench autosave mints a brand-new record (and last-opened pointer)
  // on its next tick. Also dismiss the welcome page if it was showing.
  function handleNew() {
    setCode(NEW_DOCUMENT_CODE);
    setPackages([]);
    setLibraries([]);
    setDocTitle(t("documents.untitled"));
    setCurrentDocId(null);
    setLastOpenedDocId(null);
    setEntryGate("workbench");
  }

  async function handleOpen(id: string) {
    const doc = await loadDocument(id);
    if (doc === undefined) {
      return;
    }
    setCode(doc.code);
    setPackages(doc.packages ?? []);
    setLibraries(doc.libraries ?? []);
    setDocTitle(doc.title);
    setCurrentDocId(doc.id);
    setLastOpenedDocId(doc.id);
    setEntryGate("workbench");
    setOpen(false);
  }

  async function handleDelete(id: string) {
    await deleteDocument(id);
    await deleteVersions(id).catch(() => undefined);
    setDocs((prev) => prev.filter((doc) => doc.id !== id));
    // Deleting the currently-open document also clears the last-opened
    // pointer so the next boot lands on the welcome page.
    if (id === currentDocId) {
      setLastOpenedDocId(null);
    }
  }

  /** Clone a stored document under a fresh id; versions/sessions are not
   *  copied — the duplicate starts as a clean, independent document. */
  async function handleDuplicate(id: string) {
    const doc = await loadDocument(id);
    if (doc === undefined) {
      return;
    }
    const copy: TikzDocument = {
      ...doc,
      id: crypto.randomUUID(),
      title: t("documents.duplicatedName", { title: doc.title }),
      updatedAt: Date.now(),
    };
    await saveDocument(copy);
    await refresh();
  }

  async function handleImportFiles(files: FileList | null) {
    if (files === null || files.length === 0) {
      return;
    }
    const imported: TikzDocument[] = [];
    let failed = false;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const isJson =
          /\.json$/i.test(file.name) || file.type === "application/json";
        if (isJson) {
          const payload = JSON.parse(text) as ProjectExportPayload;
          if (
            payload?.app !== "tikzard" ||
            typeof payload.document?.code !== "string"
          ) {
            failed = true;
            continue;
          }
          const doc: TikzDocument = {
            id: crypto.randomUUID(),
            title:
              payload.document.title ||
              file.name
                .replace(/\.tikzard\.json$/i, "")
                .replace(/\.[^.]+$/, ""),
            code: payload.document.code,
            updatedAt: Date.now(),
          };
          await saveDocument(doc);
          if (Array.isArray(payload.versions) && payload.versions.length > 0) {
            await importVersions(doc.id, payload.versions).catch(
              () => undefined,
            );
          }
          imported.push(doc);
        } else {
          // Raw TikZ source (.tex/.txt/…): the filename stem becomes the title.
          const doc: TikzDocument = {
            id: crypto.randomUUID(),
            title: file.name.replace(/\.[^.]+$/, ""),
            code: text,
            updatedAt: Date.now(),
          };
          await saveDocument(doc);
          imported.push(doc);
        }
      } catch {
        failed = true;
      }
    }
    setImportFailed(failed);
    await refresh();
    // Land in the newest import so the user can keep working immediately.
    const last = imported.at(-1);
    if (last !== undefined) {
      setCode(last.code);
      setPackages(last.packages ?? []);
      setLibraries(last.libraries ?? []);
      setDocTitle(last.title);
      setCurrentDocId(last.id);
      setLastOpenedDocId(last.id);
      setEntryGate("workbench");
      setOpen(false);
    }
  }

  async function handleExport(id: string) {
    try {
      await exportDocumentById(id);
    } catch {
      // A stale card (document already gone) simply does nothing.
    }
  }

  const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = docs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPage(0);
          void refresh();
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label={t("documents.open")}
            className="glass-control flex size-9 items-center justify-center rounded-full bg-clip-padding p-2 text-muted-foreground transition duration-150 hover:text-foreground active:scale-[0.95]"
          >
            <FolderOpenIcon />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("documents.open")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-[20rem] p-1 text-xs">
        <div className="flex items-center justify-end gap-2 px-1 pb-1 pt-0.5">
          <DropdownMenuItem
            onSelect={handleNew}
            className="glass-control !border-border/60 m-0 h-auto w-fit shrink-0 rounded-full bg-clip-padding px-2.5 py-1.5 text-xs font-medium text-foreground/90 shadow-sm transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
          >
            <PlusIcon className="size-3.5" />
            {t("documents.new")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setImportFailed(false);
              fileInputRef.current?.click();
            }}
            className="glass-control !border-border/60 m-0 h-auto w-fit shrink-0 rounded-full bg-clip-padding px-2.5 py-1.5 text-xs font-medium text-foreground/90 shadow-sm transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
          >
            <ImportIcon className="size-3.5" />
            {t("documents.import")}
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator />
        {/* Hidden picker behind the Import pill: TikZard project exports plus
            raw .tex/.txt sources. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.tex,.txt,.latex"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleImportFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {importFailed && (
          <p className="px-2 pb-1 text-[0.65rem] text-red-500">
            {t("documents.importFailed")}
          </p>
        )}
        {/* Up to 9 documents per page; the list scrolls internally when a
            full page is taller than the viewport allows. */}
        <div className="flex max-h-[32rem] flex-col gap-1.5 overflow-y-auto px-1 pb-1">
          {pageRows.map((doc) => {
            const active = doc.id === currentDocId;
            return (
              <div
                key={doc.id}
                className="group relative flex items-center gap-2 rounded-xl bg-foreground/[0.04] p-2 transition duration-150 hover:-translate-y-px hover:bg-foreground/[0.07] active:scale-[0.99]"
              >
                <button
                  type="button"
                  onClick={() => void handleOpen(doc.id)}
                  title={doc.title}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <DocThumb url={doc.thumbUrl} />
                  <span className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 overflow-hidden border-l border-border/30 pl-2">
                    <span
                      className={`block w-full truncate text-xs ${
                        active
                          ? "font-semibold text-foreground"
                          : "font-medium text-foreground/90"
                      }`}
                    >
                      {doc.title}
                    </span>
                    <span className="block w-full truncate text-[0.65rem] text-muted-foreground tabular-nums">
                      {t("documents.editedAgo", {
                        time: formatRelative(doc.updatedAt),
                      })}
                    </span>
                  </span>
                </button>
                <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition duration-150 focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => void handleDuplicate(doc.id)}
                    aria-label={t("documents.duplicate")}
                    title={t("documents.duplicate")}
                    className="rounded-md bg-background/80 p-1 text-muted-foreground shadow-sm backdrop-blur-sm transition duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.95]"
                  >
                    <CopyIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExport(doc.id)}
                    aria-label={t("documents.exportProject")}
                    title={t("documents.exportProject")}
                    className="rounded-md bg-background/80 p-1 text-muted-foreground shadow-sm backdrop-blur-sm transition duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.95]"
                  >
                    <PackageIcon className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(doc.id)}
                    aria-label={t("documents.delete")}
                    title={t("documents.delete")}
                    className="rounded-md bg-background/80 p-1 text-muted-foreground shadow-sm backdrop-blur-sm transition duration-150 hover:bg-foreground/[0.06] hover:text-red-500 active:scale-[0.95]"
                  >
                    <TrashIcon className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {docs.length === 0 && (
            <p className="self-center py-10 text-center text-muted-foreground">
              {t("documents.empty")}
            </p>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/40 px-2 pt-1 pb-0.5">
            <button
              type="button"
              aria-label={t("documents.prevPage")}
              title={t("documents.prevPage")}
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              className="rounded-full p-1 text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeftIcon />
            </button>
            <span className="text-muted-foreground tabular-nums">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              aria-label={t("documents.nextPage")}
              title={t("documents.nextPage")}
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
              className="rounded-full p-1 text-muted-foreground transition duration-150 hover:bg-foreground/[0.08] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRightIcon />
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
