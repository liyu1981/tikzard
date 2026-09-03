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

export const DB_NAME = "tikzard";
const DB_VERSION = 3;
export const DOCUMENTS_STORE_NAME = "documents";
export const VERSIONS_STORE_NAME = "versions";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise !== null) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE_NAME)) {
        const store = db.createObjectStore(DOCUMENTS_STORE_NAME, {
          keyPath: "id",
        });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(VERSIONS_STORE_NAME)) {
        db.createObjectStore(VERSIONS_STORE_NAME, { keyPath: "docId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | IDBRequest<T>[],
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
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
  return withStore(DOCUMENTS_STORE_NAME, "readwrite", (store) => {
    store.put(document);
    return store.get(document.id);
  }).then(() => undefined);
}

export function listDocuments(): Promise<TikzDocumentMeta[]> {
  return withStore<TikzDocumentMeta[]>(
    DOCUMENTS_STORE_NAME,
    "readonly",
    (store) => {
      const index = store.index("updatedAt");
      const request = index.getAll();
      return request;
    },
  ).then((docs) =>
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
  return withStore<TikzDocument | undefined>(
    DOCUMENTS_STORE_NAME,
    "readonly",
    (store) => store.get(id),
  );
}

export function deleteDocument(id: string): Promise<void> {
  return withStore(DOCUMENTS_STORE_NAME, "readwrite", (store) => {
    store.delete(id);
    return store.get(id);
  }).then(() => undefined);
}

/**
 * Which document was last opened (localStorage pointer). Documents always
 * stay in the store; only the pointer is cleared when one is closed, which
 * is what makes the app boot back to the welcome page.
 */
const LAST_OPENED_KEY = "tikzard-last-opened";

export function getLastOpenedDocId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const id = window.localStorage.getItem(LAST_OPENED_KEY);
  return id !== null && id !== "" ? id : null;
}

export function setLastOpenedDocId(id: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (id === null) {
    window.localStorage.removeItem(LAST_OPENED_KEY);
  } else {
    window.localStorage.setItem(LAST_OPENED_KEY, id);
  }
}
