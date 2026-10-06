/**
 * IndexedDB cache for Convex query results (last-known data for offline UI).
 */

const DB_NAME = "pretium-offline-v1";
const DB_VERSION = 2;
const STORE_CACHE = "queryCache";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("jobs")) {
        db.createObjectStore("jobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
    };
  });
}

export type CachedQueryRecord<T = unknown> = {
  key: string;
  value: T;
  updatedAt: number;
};

export function makeCacheKey(queryName: string, args: unknown): string {
  return `${queryName}:${JSON.stringify(args)}`;
}

export async function setCachedQuery<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readwrite");
    const rec: CachedQueryRecord<T> = { key, value, updatedAt: Date.now() };
    const req = tx.objectStore(STORE_CACHE).put(rec);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function getCachedQuery<T>(key: string): Promise<CachedQueryRecord<T> | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CACHE, "readonly");
    const req = tx.objectStore(STORE_CACHE).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as CachedQueryRecord<T> | undefined) ?? null);
    };
  });
}
