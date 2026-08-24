import type {
  AgentMessage,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";

export interface AgentSession {
  id: string;
  /** Document this conversation belongs to; history is isolated per doc. */
  docId: string;
  title: string;
  providerId: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
}

export type AgentSessionSummary = Omit<AgentSession, "messages">;

const DB_NAME = "tikzard-agent";
const DB_VERSION = 1;
const STORE = "sessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}

/** All sessions for one document, newest first. Records from before
 * per-document isolation (no docId) never match and stay invisible. */
export async function listSessionsForDoc(
  docId: string,
): Promise<AgentSession[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const request = tx.objectStore(STORE).getAll() as IDBRequest<AgentSession[]>;
  const sessions = await txResult(request);
  await txDone(tx);
  db.close();
  return sessions
    .filter((session) => session.docId === docId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(
  id: string,
): Promise<AgentSession | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const request = tx.objectStore(STORE).get(id) as IDBRequest<
    AgentSession | undefined
  >;
  const session = await txResult(request);
  await txDone(tx);
  db.close();
  return session;
}

export async function saveSession(session: AgentSession): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(session);
  await txDone(tx);
  db.close();
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  db.close();
}

/** Drop every conversation belonging to a document (used on doc delete). */
export async function deleteSessionsByDoc(docId: string): Promise<void> {
  const sessions = await listSessionsForDoc(docId);
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  for (const session of sessions) {
    tx.objectStore(STORE).delete(session.id);
  }
  await txDone(tx);
  db.close();
}
