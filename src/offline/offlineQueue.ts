/**
 * IndexedDB-backed offline job queue + blob storage for sync replay.
 */

const DB_NAME = "pretium-offline-v1";
const DB_VERSION = 2;
const STORE_JOBS = "jobs";
const STORE_BLOBS = "blobs";
const STORE_QUERY_CACHE = "queryCache";
const PROCESSING_STALE_MS = 2 * 60 * 1000;

export type JobStatus = "pending" | "processing" | "failed" | "completed";

export type OfflineJob =
  | {
      id: string;
      type: "dailyReportCreate";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        projectId: string;
        title: string;
        description?: string;
        dueDate: number;
        weatherSummary?: string;
        subtradeIdsOnSite?: string[];
        dailyReportFolderId?: string;
        /** Already uploaded to Convex before queueing (e.g. staged while online). */
        photoStorageIds?: string[];
        docStorageIds?: string[];
        photoBlobIds: string[];
        docBlobIds: string[];
      };
    }
  | {
      id: string;
      type: "dailyReportUpdate";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        taskId: string;
        projectId?: string;
        title?: string;
        description?: string;
        dueDate?: number;
        weatherSummary?: string;
        subtradeIdsOnSite?: string[];
        photoUrls?: string[];
        documentUrls?: string[];
        newPhotoBlobIds: string[];
        newDocBlobIds: string[];
        /** Staged uploads while still online (Convex storage ids). */
        newPhotoStorageIds?: string[];
        newDocStorageIds?: string[];
        /** Target folder for new doc copies; `null` clears the report’s folder (show on main list). */
        editDailyReportFolderId?: string | null;
      };
    }
  | {
      id: string;
      type: "sitePhotosUpload";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        projectId: string;
        fileBlobIds: string[];
        /** Backward compatibility with already-queued older jobs. */
        imageBlobIds?: string[];
        originalFileNames?: (string | undefined)[];
        mimeTypes?: (string | undefined)[];
        captions?: (string | undefined)[];
        sitePhotoFolderId?: string;
        areaOnSite?: string;
        subtradeId?: string;
        taggedDate?: number;
        photoCategory?: "deficiency" | "progress" | "safety_issue" | "close_out";
        notes?: string;
      };
    }
  | {
      id: string;
      type: "safetyAttendance";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        projectId: string;
        subtradeId: string;
        workerName: string;
        action: "in" | "out";
        signedAt: number;
      };
    }
  | {
      id: string;
      type: "incidentAdd";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        projectId: string;
        title: string;
        description: string;
        date: number;
        reportType: "near_miss" | "notice_of_violation" | "first_aid_log" | "incident_report";
        severity: "low" | "medium" | "high" | "critical";
      };
    }
  | {
      id: string;
      type: "incidentStatusUpdate";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        reportId: string;
        status: "open" | "investigating" | "resolved";
      };
    }
  | {
      id: string;
      type: "inventoryCheckout";
      status: JobStatus;
      createdAt: number;
      lastError?: string;
      payload: {
        equipmentId: string;
        projectId: string;
        takenOutByName?: string;
        dateTaken?: number;
      };
    };

export type OfflineJobNew =
  | Omit<Extract<OfflineJob, { type: "dailyReportCreate" }>, "id" | "status" | "createdAt">
  | Omit<Extract<OfflineJob, { type: "dailyReportUpdate" }>, "id" | "status" | "createdAt">
  | Omit<Extract<OfflineJob, { type: "sitePhotosUpload" }>, "id" | "status" | "createdAt">
  | Omit<Extract<OfflineJob, { type: "safetyAttendance" }>, "id" | "status" | "createdAt">
  | Omit<Extract<OfflineJob, { type: "incidentAdd" }>, "id" | "status" | "createdAt">
  | Omit<Extract<OfflineJob, { type: "incidentStatusUpdate" }>, "id" | "status" | "createdAt">
  | Omit<Extract<OfflineJob, { type: "inventoryCheckout" }>, "id" | "status" | "createdAt">;

type ProcessingTrackedJob = OfflineJob & { processingStartedAt?: number };

function isReplayableJob(job: OfflineJob): boolean {
  if (job.status === "completed") return false;
  if (job.status === "pending" || job.status === "failed") return true;
  if (job.status !== "processing") return false;
  const startedAt = (job as ProcessingTrackedJob).processingStartedAt;
  return startedAt == null || Date.now() - startedAt > PROCESSING_STALE_MS;
}

function normalizeReplayableJob(job: OfflineJob): OfflineJob {
  if (job.status !== "processing") return job;
  return {
    ...job,
    status: "failed",
    lastError: "Sync was interrupted before completion. Retrying.",
  } as OfflineJob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOBS)) {
        db.createObjectStore(STORE_JOBS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_QUERY_CACHE)) {
        db.createObjectStore(STORE_QUERY_CACHE, { keyPath: "key" });
      }
    };
  });
}

export type StoredBlob = {
  id: string;
  arrayBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function putBlob(blob: Omit<StoredBlob, "id"> & { id?: string }): Promise<string> {
  const id = blob.id ?? generateId();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readwrite");
    const store = tx.objectStore(STORE_BLOBS);
    const rec: StoredBlob = {
      id,
      arrayBuffer: blob.arrayBuffer,
      mimeType: blob.mimeType,
      fileName: blob.fileName,
    };
    const req = store.put(rec);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve(id);
    };
  });
}

export async function getBlob(id: string): Promise<StoredBlob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const req = tx.objectStore(STORE_BLOBS).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StoredBlob | undefined) ?? null);
    };
  });
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readwrite");
    const req = tx.objectStore(STORE_BLOBS).delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteBlobs(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteBlob(id);
  }
}

export async function addJob(job: OfflineJob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, "readwrite");
    const req = tx.objectStore(STORE_JOBS).put(job);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function updateJob(job: OfflineJob): Promise<void> {
  return addJob(job);
}

export async function removeJob(jobId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, "readwrite");
    const req = tx.objectStore(STORE_JOBS).delete(jobId);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
  });
}

export async function listPendingJobs(): Promise<OfflineJob[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, "readonly");
    const req = tx.objectStore(STORE_JOBS).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      const all = (req.result as OfflineJob[]) ?? [];
      const pending = all
        .filter(isReplayableJob)
        .map(normalizeReplayableJob)
        .sort((a, b) => a.createdAt - b.createdAt);
      resolve(pending);
    };
  });
}

export async function listAllJobs(): Promise<OfflineJob[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_JOBS, "readonly");
    const req = tx.objectStore(STORE_JOBS).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as OfflineJob[]) ?? []);
    };
  });
}

export async function countPendingJobs(): Promise<number> {
  const jobs = await listPendingJobs();
  return jobs.filter((j) => j.status === "pending").length;
}
