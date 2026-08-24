"use client";

/**
 * IndexedDB-backed document store for the workbench. Documents live entirely
 * on-device: { id, title, code, updatedAt, thumbnail? }. The API is
 * promise-based so the UI never blocks on storage.
 */

export interface TikzDocument {
  id: string;
  title: string;
  code: string;
  updatedAt: number;
  /** Downscaled PNG snapshot of the rendered result (≤640px longest side). */
  thumbnail?: Blob;
}

export interface TikzDocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
  thumbnail?: Blob;
}

const DB_NAME = "prompt-tikz";
const DB_VERSION = 1;
const STORE_NAME = "documents";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise !== null) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[],
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = run(store);
        const requests = Array.isArray(request) ? request : [request];
        let remaining = requests.length;
        const results: unknown[] = [];
        for (const req of requests) {
          req.onsuccess = () => {
            results.push(req.result);
            remaining -= 1;
            if (remaining === 0) {
              resolve(results[0] as T);
            }
          };
          req.onerror = () => reject(req.error);
        }
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export function saveDocument(document: TikzDocument): Promise<void> {
  return withStore("readwrite", (store) => {
    store.put(document);
    return store.get(document.id);
  }).then(() => undefined);
}

export function listDocuments(): Promise<TikzDocumentMeta[]> {
  return withStore<TikzDocumentMeta[]>("readonly", (store) => {
    const index = store.index("updatedAt");
    const request = index.getAll();
    return request;
  }).then((docs) =>
    docs
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt,
        thumbnail: doc.thumbnail,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

export function loadDocument(id: string): Promise<TikzDocument | undefined> {
  return withStore<TikzDocument | undefined>("readonly", (store) =>
    store.get(id),
  );
}

export function deleteDocument(id: string): Promise<void> {
  return withStore("readwrite", (store) => {
    store.delete(id);
    return store.get(id);
  }).then(() => undefined);
}

export function loadMostRecentDocument(): Promise<TikzDocument | undefined> {
  return listDocuments().then((docs) =>
    docs.length > 0 ? loadDocument(docs[0].id) : undefined,
  );
}
