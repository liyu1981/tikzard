"use client";

import { VERSIONS_STORE_NAME, withStore } from "@/lib/documents";

export type VersionSource = "manual" | "agent";

/** A single saved snapshot of a document's TikZ source. */
export interface TikzVersion {
  /** 1-based, monotonically increasing per document. */
  number: number;
  code: string;
  createdAt: number;
  source: VersionSource;
  /** Optional short description (e.g. the agent's planned change). */
  note?: string;
  /** Optional preview of the rendered drawing at snapshot time. */
  thumbnail?: Blob;
}

export interface TikzVersionsRecord {
  docId: string;
  versions: TikzVersion[];
}

const MAX_VERSIONS_KEY = "workbench.maxVersions";

export const DEFAULT_MAX_VERSIONS = 99;

export function getMaxVersions(): number {
  try {
    const raw = Number.parseInt(
      window.localStorage.getItem(MAX_VERSIONS_KEY) ?? "",
      10,
    );
    if (!Number.isFinite(raw)) {
      return DEFAULT_MAX_VERSIONS;
    }
    return Math.max(1, Math.min(999, raw));
  } catch {
    return DEFAULT_MAX_VERSIONS;
  }
}

export function setMaxVersions(value: number): void {
  try {
    window.localStorage.setItem(
      MAX_VERSIONS_KEY,
      String(Math.max(1, Math.min(999, Math.round(value)))),
    );
  } catch {
    return;
  }
}

function recordWith(
  record: TikzVersionsRecord | undefined,
  docId: string,
): TikzVersionsRecord {
  return record ?? { docId, versions: [] };
}

/** All saved versions for a document, oldest first. */
export function getVersions(docId: string): Promise<TikzVersion[]> {
  return withStore<TikzVersionsRecord | undefined>(
    VERSIONS_STORE_NAME,
    "readonly",
    (store) => store.get(docId),
  ).then((record) => recordWith(record, docId).versions);
}

/**
 * Save a snapshot of the given source as the next version of the document.
 * The version number is always max(existing) + 1, so re-saving identical
 * snapshots still advances the counter. Records are pruned from the oldest
 * side once they exceed getMaxVersions(). Returns the created version.
 */
export async function saveNewVersion(
  docId: string,
  code: string,
  source: VersionSource,
  options?: { note?: string; thumbnail?: Blob },
): Promise<TikzVersion> {
  const existing = await getVersions(docId);
  const next: TikzVersion = {
    number: (existing.at(-1)?.number ?? 0) + 1,
    code,
    createdAt: Date.now(),
    source,
    note: options?.note,
    thumbnail: options?.thumbnail,
  };
  const max = getMaxVersions();
  const kept = existing.concat(next).slice(-max);
  await withStore<IDBValidKey>(VERSIONS_STORE_NAME, "readwrite", (store) =>
    store.put({ docId, versions: kept }),
  );
  return next;
}

/** Drop every version a document owns (e.g. when the document is deleted). */
export function deleteVersions(docId: string): Promise<void> {
  return withStore(VERSIONS_STORE_NAME, "readwrite", (store) => {
    store.delete(docId);
    return store.get(docId);
  }).then(() => undefined);
}
