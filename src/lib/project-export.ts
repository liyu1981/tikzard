"use client";

import { loadDocument } from "@/lib/documents";
import { downloadBlob, toFileSlug } from "@/lib/image-export";
import { getVersions, type TikzVersion } from "@/lib/versions";

export interface ProjectExportDocument {
  title: string;
  code: string;
  updatedAt: number;
}

export interface ProjectExportPayload {
  app: "tikzard";
  exportVersion: 1;
  exportedAt: number;
  document: ProjectExportDocument;
  versions: {
    number: number;
    code: string;
    createdAt: number;
    source: TikzVersion["source"];
    note?: string;
  }[];
}

/** Build the JSON payload for a document and trigger a browser download.
 *  Thumbnails are binary blobs and deliberately excluded. Returns the file
 *  name that was downloaded. */
export function downloadProjectJson(
  document: ProjectExportDocument,
  versions: TikzVersion[],
): string {
  const payload: ProjectExportPayload = {
    app: "tikzard",
    exportVersion: 1,
    exportedAt: Date.now(),
    document,
    versions: versions.map((v) => ({
      number: v.number,
      code: v.code,
      createdAt: v.createdAt,
      source: v.source,
      note: v.note,
    })),
  };
  const filename = `${toFileSlug(document.title)}.tikzard.json`;
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
    filename,
  );
  return filename;
}

/** Load a document from storage (plus its versions) and export it as JSON. */
export async function exportDocumentById(docId: string): Promise<string> {
  const doc = await loadDocument(docId);
  if (doc === undefined) {
    throw new Error("Document not found.");
  }
  const versions = await getVersions(docId).catch(() => []);
  return downloadProjectJson(
    { title: doc.title, code: doc.code, updatedAt: doc.updatedAt },
    versions,
  );
}
