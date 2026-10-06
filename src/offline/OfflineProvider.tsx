import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  addJob,
  deleteBlobs,
  generateId,
  getBlob,
  listPendingJobs,
  removeJob,
  updateJob,
  type OfflineJob,
  type OfflineJobNew,
} from "./offlineQueue";
import { useOnline } from "./useOffline";

type OfflineContextValue = {
  isOffline: boolean;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncError: string | null;
  queueJob: (job: OfflineJobNew) => Promise<string>;
  refreshStats: () => Promise<void>;
  triggerSync: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

async function uploadBlobToConvex(
  generateUploadUrl: () => Promise<string>,
  body: Blob
): Promise<Id<"_storage">> {
  const uploadUrl = await generateUploadUrl();
  const res = await fetch(uploadUrl, { method: "POST", body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Upload failed (${res.status})`);
  }
  const json = (await res.json()) as { storageId?: string };
  if (!json.storageId) throw new Error("Upload response missing storageId");
  return json.storageId as Id<"_storage">;
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const isOffline = !online;

  const generateDocUploadUrl = useMutation(api.documents.generateUploadUrl);
  const generateSitePhotoUploadUrl = useMutation(api.projectSitePhotos.generateUploadUrl);
  const createTask = useMutation(api.tasks.createTask);
  const updateTask = useMutation(api.tasks.updateTask);
  const createDocumentRecord = useMutation(api.documents.createDocumentRecord);
  const createSitePhoto = useMutation(api.projectSitePhotos.createSitePhoto);
  const recordJobAttendance = useMutation(api.safety.recordJobAttendance);
  const addIncidentReport = useMutation(api.safety.addIncidentReport);
  const updateIncidentReport = useMutation(api.safety.updateIncidentReport);
  const addEquipmentCheckoutFromForm = useMutation(api.safety.addEquipmentCheckoutFromForm);

  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const processingRef = useRef(false);

  const refreshStats = useCallback(async () => {
    const jobs = await listPendingJobs();
    setPendingCount(jobs.filter((j) => j.status === "pending").length);
    setFailedCount(jobs.filter((j) => j.status === "failed").length);
  }, []);

  const processOneJob = useCallback(
    async (job: OfflineJob): Promise<void> => {
      if (job.type === "dailyReportCreate") {
        const p = job.payload;
        const photoIds: Id<"_storage">[] = [
          ...((p.photoStorageIds ?? []) as Id<"_storage">[]),
        ];
        const docIds: Id<"_storage">[] = [...((p.docStorageIds ?? []) as Id<"_storage">[])];
        for (const bid of p.photoBlobIds) {
          const stored = await getBlob(bid);
          if (!stored) throw new Error("Missing queued photo blob");
          const blob = new Blob([stored.arrayBuffer], { type: stored.mimeType || "application/octet-stream" });
          photoIds.push(await uploadBlobToConvex(() => generateDocUploadUrl(), blob));
        }
        for (const bid of p.docBlobIds) {
          const stored = await getBlob(bid);
          if (!stored) throw new Error("Missing queued document blob");
          const blob = new Blob([stored.arrayBuffer], { type: stored.mimeType || "application/octet-stream" });
          docIds.push(await uploadBlobToConvex(() => generateDocUploadUrl(), blob));
        }
        const titleTrim = p.title.trim();
        await createTask({
          projectId: p.projectId as Id<"projects">,
          title: titleTrim,
          description: p.description?.trim() || undefined,
          dueDate: p.dueDate,
          weatherSummary: p.weatherSummary?.trim() || undefined,
          photoStorageIds: photoIds.length ? photoIds : undefined,
          documentStorageIds: docIds.length ? docIds : undefined,
          subtradeIdsOnSite:
            p.subtradeIdsOnSite && p.subtradeIdsOnSite.length
              ? (p.subtradeIdsOnSite as Id<"projectSubtrades">[])
              : undefined,
          ...(p.dailyReportFolderId
            ? { dailyReportFolderId: p.dailyReportFolderId as Id<"documentFolders"> }
            : {}),
          isDailyReport: true,
          clientMutationId: job.id,
        });
        if (p.dailyReportFolderId && docIds.length) {
          for (let i = 0; i < docIds.length; i++) {
            await createDocumentRecord({
              projectId: p.projectId as Id<"projects">,
              type: "other",
              name: `${titleTrim} - attachment ${i + 1}`,
              storageId: docIds[i],
              folderId: p.dailyReportFolderId as Id<"documentFolders">,
              createdDate: p.dueDate,
              clientMutationId: `${job.id}:document:${i}`,
            });
          }
        }
        await deleteBlobs([...p.photoBlobIds, ...p.docBlobIds]);
        return;
      }

      if (job.type === "dailyReportUpdate") {
        const p = job.payload;
        const newPhotoIds: Id<"_storage">[] = [
          ...((p.newPhotoStorageIds ?? []) as Id<"_storage">[]),
        ];
        const newDocIds: Id<"_storage">[] = [...((p.newDocStorageIds ?? []) as Id<"_storage">[])];
        for (const bid of p.newPhotoBlobIds) {
          const stored = await getBlob(bid);
          if (!stored) throw new Error("Missing queued photo blob");
          const blob = new Blob([stored.arrayBuffer], { type: stored.mimeType || "application/octet-stream" });
          newPhotoIds.push(await uploadBlobToConvex(() => generateDocUploadUrl(), blob));
        }
        for (const bid of p.newDocBlobIds) {
          const stored = await getBlob(bid);
          if (!stored) throw new Error("Missing queued document blob");
          const blob = new Blob([stored.arrayBuffer], { type: stored.mimeType || "application/octet-stream" });
          newDocIds.push(await uploadBlobToConvex(() => generateDocUploadUrl(), blob));
        }
        const dueMs = p.dueDate;
        await updateTask({
          taskId: p.taskId as Id<"projectTasks">,
          title: p.title,
          description: p.description,
          dueDate: dueMs,
          weatherSummary: p.weatherSummary,
          photoUrls: p.photoUrls,
          documentUrls: p.documentUrls,
          photoStorageIds: newPhotoIds.length ? newPhotoIds : undefined,
          documentStorageIds: newDocIds.length ? newDocIds : undefined,
          subtradeIdsOnSite:
            p.subtradeIdsOnSite !== undefined
              ? (p.subtradeIdsOnSite as Id<"projectSubtrades">[])
              : undefined,
          ...(p.editDailyReportFolderId !== undefined
            ? {
                dailyReportFolderId: p.editDailyReportFolderId
                  ? (p.editDailyReportFolderId as Id<"documentFolders">)
                  : null,
              }
            : {}),
        });
        if (p.projectId && p.editDailyReportFolderId && newDocIds.length) {
          const ms = dueMs ?? Date.now();
          const ttitle = (p.title ?? "").trim();
          for (let i = 0; i < newDocIds.length; i++) {
            await createDocumentRecord({
              projectId: p.projectId as Id<"projects">,
              type: "other",
              name: `${ttitle} - attachment ${i + 1}`,
              storageId: newDocIds[i],
              folderId: p.editDailyReportFolderId as Id<"documentFolders">,
              createdDate: ms,
              clientMutationId: `${job.id}:document:${i}`,
            });
          }
        }
        await deleteBlobs([...p.newPhotoBlobIds, ...p.newDocBlobIds]);
        return;
      }

      if (job.type === "sitePhotosUpload") {
        const p = job.payload;
        const fileBlobIds = p.fileBlobIds?.length ? p.fileBlobIds : (p.imageBlobIds ?? []);
        for (let i = 0; i < fileBlobIds.length; i++) {
          const bid = fileBlobIds[i];
          const stored = await getBlob(bid);
          if (!stored) throw new Error("Missing queued site photo blob");
          const mimeType = p.mimeTypes?.[i]?.trim() || stored.mimeType || "application/octet-stream";
          const blob = new Blob([stored.arrayBuffer], { type: mimeType });
          const storageId = await uploadBlobToConvex(() => generateSitePhotoUploadUrl(), blob);
          const baseArgs = {
            projectId: p.projectId as Id<"projects">,
            storageId,
            caption: p.captions?.[i]?.trim() || undefined,
            clientMutationId: `${job.id}:site-photo:${bid}`,
            ...(p.sitePhotoFolderId
              ? { sitePhotoFolderId: p.sitePhotoFolderId as Id<"sitePhotoFolders"> }
              : {}),
            ...(p.areaOnSite?.trim() ? { areaOnSite: p.areaOnSite.trim() } : {}),
            ...(p.subtradeId ? { subtradeId: p.subtradeId as Id<"projectSubtrades"> } : {}),
            ...(p.taggedDate !== undefined ? { taggedDate: p.taggedDate } : {}),
            ...(p.photoCategory ? { photoCategory: p.photoCategory } : {}),
            ...(p.notes?.trim() ? { notes: p.notes.trim() } : {}),
          };
          try {
            await createSitePhoto({
              ...baseArgs,
              displayName: p.originalFileNames?.[i]?.trim() || stored.fileName || undefined,
              originalFileName: p.originalFileNames?.[i]?.trim() || stored.fileName || undefined,
              mimeType,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const mayBeLegacyValidator =
              message.toLowerCase().includes("extra field") ||
              message.toLowerCase().includes("unexpected field") ||
              message.toLowerCase().includes("validator");
            if (!mayBeLegacyValidator) throw error;
            await createSitePhoto(baseArgs);
          }
          const remainingBlobIds = fileBlobIds.slice(i + 1);
          await updateJob({
            ...job,
            status: "processing",
            payload: {
              ...p,
              fileBlobIds: remainingBlobIds,
              imageBlobIds: undefined,
              originalFileNames: p.originalFileNames?.slice(i + 1),
              mimeTypes: p.mimeTypes?.slice(i + 1),
              captions: p.captions?.slice(i + 1),
              areaOnSite: p.areaOnSite,
              subtradeId: p.subtradeId,
              taggedDate: p.taggedDate,
              photoCategory: p.photoCategory,
            },
          } as OfflineJob);
          await deleteBlobs([bid]);
        }
        return;
      }

      if (job.type === "safetyAttendance") {
        const p = job.payload;
        await recordJobAttendance({
          projectId: p.projectId as Id<"projects">,
          subtradeId: p.subtradeId as Id<"projectSubtrades">,
          workerName: p.workerName,
          action: p.action,
          signedAt: p.signedAt,
          clientMutationId: job.id,
        });
        return;
      }

      if (job.type === "incidentAdd") {
        const p = job.payload;
        await addIncidentReport({
          projectId: p.projectId as Id<"projects">,
          title: p.title,
          description: p.description,
          date: p.date,
          reportType: p.reportType ?? "incident_report",
          severity: p.severity,
          clientMutationId: job.id,
        });
        return;
      }

      if (job.type === "incidentStatusUpdate") {
        const p = job.payload;
        await updateIncidentReport({
          reportId: p.reportId as Id<"incidentReports">,
          status: p.status,
        });
        return;
      }

      if (job.type === "inventoryCheckout") {
        const p = job.payload;
        await addEquipmentCheckoutFromForm({
          equipmentId: p.equipmentId as Id<"equipmentCatalog">,
          projectId: p.projectId as Id<"projects">,
          takenOutByName: p.takenOutByName,
          dateTaken: p.dateTaken,
          clientMutationId: job.id,
        });
        return;
      }
    },
    [
      addEquipmentCheckoutFromForm,
      addIncidentReport,
      createDocumentRecord,
      createSitePhoto,
      createTask,
      generateDocUploadUrl,
      generateSitePhotoUploadUrl,
      recordJobAttendance,
      updateIncidentReport,
      updateTask,
    ]
  );

  const runQueue = useCallback(async () => {
    if (!online || processingRef.current) return;
    const run = async () => {
      const jobs = await listPendingJobs();
      const toProcess = jobs.filter((j) => j.status === "pending" || j.status === "failed");
      if (toProcess.length === 0) {
        await refreshStats();
        return;
      }
      processingRef.current = true;
      setIsSyncing(true);
      setLastSyncError(null);
      try {
        for (const job of toProcess) {
          const asProcessing: OfflineJob = {
            ...job,
            status: "processing",
            processingStartedAt: Date.now(),
          } as unknown as OfflineJob;
          await updateJob(asProcessing);
          try {
            await processOneJob(asProcessing);
            await updateJob({ ...job, status: "completed" as const } as OfflineJob);
            try {
              await removeJob(job.id);
            } catch (removeError) {
              setLastSyncError(
                removeError instanceof Error
                  ? removeError.message
                  : "Synced item could not be cleared locally.",
              );
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const failed = { ...job, status: "failed" as const, lastError: msg } as OfflineJob;
            await updateJob(failed);
            setLastSyncError(msg);
          }
        }
      } finally {
        processingRef.current = false;
        setIsSyncing(false);
        await refreshStats();
      }
    };

    const locks =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & {
            locks?: { request: (name: string, callback: () => Promise<void>) => Promise<void> };
          }).locks
        : undefined;
    if (locks) {
      await locks.request("pretium-offline-sync", run);
      return;
    }
    await run();
  }, [online, processOneJob, refreshStats]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    if (online) {
      void runQueue();
    }
  }, [online, runQueue]);

  const queueJob = useCallback(
    async (job: OfflineJobNew): Promise<string> => {
      const id = generateId();
      const full = { ...job, id, status: "pending" as const, createdAt: Date.now() } as OfflineJob;
      await addJob(full);
      await refreshStats();
      if (online) {
        void runQueue();
      }
      return id;
    },
    [online, refreshStats, runQueue]
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOffline,
      pendingCount,
      failedCount,
      isSyncing,
      lastSyncError,
      queueJob,
      refreshStats,
      triggerSync: runQueue,
    }),
    [isOffline, pendingCount, failedCount, isSyncing, lastSyncError, queueJob, refreshStats, runQueue]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineContext(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOfflineContext must be used within OfflineProvider");
  }
  return ctx;
}

/** Safe hook when provider may be absent (tests); returns null if no provider. */
export function useOfflineContextOptional(): OfflineContextValue | null {
  return useContext(OfflineContext);
}
