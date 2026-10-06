import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { recordAuditLog } from "./auditLog";
import { assertProjectAccess } from "./lib/projectAccess";

export const MAX_AUTOSAVE_VERSIONS = 30;

export const documentVersionSaveTypeValidator = v.union(
  v.literal("autosave"),
  v.literal("manual"),
  v.literal("publish"),
  v.literal("upload"),
  v.literal("restore"),
  v.literal("branch"),
);

export type DocumentVersionSaveType =
  | "autosave"
  | "manual"
  | "publish"
  | "upload"
  | "restore"
  | "branch";

type SnapshotSource = Doc<"documents"> & { storageId?: Id<"_storage"> };

type SnapshotPayload = {
  name: string;
  type: string;
  fileUrl?: string;
  storageId?: Id<"_storage">;
  formData?: string;
  description?: string;
  tradeName?: string;
  status?: "paid" | "unpaid";
  folderId?: Id<"documentFolders">;
  createdDate?: number;
  workflowDueDate?: number;
  workflowStatus?: string;
  assigneeUserIds?: Id<"users">[];
  distributionUserIds?: Id<"users">[];
  ballInCourtUserIds?: Id<"users">[];
  billingProgressPercent?: number;
  complianceCategory?: Doc<"documents">["complianceCategory"];
  issueDate?: number;
  expiryDate?: number;
  subtradeId?: Id<"projectSubtrades">;
};

function snapshotPayloadFromDoc(doc: SnapshotSource): SnapshotPayload {
  return {
    name: doc.name,
    type: doc.type,
    fileUrl: doc.fileUrl,
    storageId: doc.storageId,
    formData: doc.formData,
    description: doc.description,
    tradeName: doc.tradeName,
    status: doc.status,
    folderId: doc.folderId,
    createdDate: doc.createdDate,
    workflowDueDate: doc.workflowDueDate,
    workflowStatus: doc.workflowStatus,
    assigneeUserIds: doc.assigneeUserIds,
    distributionUserIds: doc.distributionUserIds,
    ballInCourtUserIds: doc.ballInCourtUserIds,
    billingProgressPercent: doc.billingProgressPercent,
    complianceCategory: doc.complianceCategory,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    subtradeId: doc.subtradeId,
  };
}

function snapshotFingerprint(payload: SnapshotPayload): string {
  return JSON.stringify(payload);
}

async function getLatestVersion(ctx: MutationCtx, documentId: Id<"documents">) {
  const versions = await ctx.db
    .query("documentVersions")
    .withIndex("by_document_savedAt", (q) => q.eq("documentId", documentId))
    .order("desc")
    .take(1);
  return versions[0] ?? null;
}

async function getNextVersionNumber(ctx: MutationCtx, documentId: Id<"documents">): Promise<number> {
  const latest = await getLatestVersion(ctx, documentId);
  return (latest?.versionNumber ?? 0) + 1;
}

async function pruneAutosaveVersions(ctx: MutationCtx, documentId: Id<"documents">) {
  const autosaves = await ctx.db
    .query("documentVersions")
    .withIndex("by_document_savedAt", (q) => q.eq("documentId", documentId))
    .order("desc")
    .collect();
  const autosaveRows = autosaves.filter((row) => row.saveType === "autosave");
  if (autosaveRows.length <= MAX_AUTOSAVE_VERSIONS) return;
  for (const row of autosaveRows.slice(MAX_AUTOSAVE_VERSIONS)) {
    await ctx.db.delete(row._id);
  }
}

function versionRowFingerprint(version: Doc<"documentVersions">): string {
  return snapshotFingerprint(snapshotPayloadFromVersion(version));
}

function snapshotPayloadFromVersion(version: Doc<"documentVersions">): SnapshotPayload {
  return {
    name: version.name,
    type: version.type,
    fileUrl: version.fileUrl,
    storageId: version.storageId,
    formData: version.formData,
    description: version.description,
    tradeName: version.tradeName,
    status: version.status,
    folderId: version.folderId,
    createdDate: version.createdDate,
    workflowDueDate: version.workflowDueDate,
    workflowStatus: version.workflowStatus,
    assigneeUserIds: version.assigneeUserIds,
    distributionUserIds: version.distributionUserIds,
    ballInCourtUserIds: version.ballInCourtUserIds,
    billingProgressPercent: version.billingProgressPercent,
    complianceCategory: version.complianceCategory,
    issueDate: version.issueDate,
    expiryDate: version.expiryDate,
    subtradeId: version.subtradeId,
  };
}

export async function snapshotDocumentVersion(
  ctx: MutationCtx,
  doc: SnapshotSource,
  opts: {
    saveType: DocumentVersionSaveType;
    savedByUserId: Id<"users">;
    label?: string;
    sourceVersionId?: Id<"documentVersions">;
    skipIfUnchanged?: boolean;
  },
): Promise<Id<"documentVersions"> | null> {
  const payload = snapshotPayloadFromDoc(doc);
  if (opts.skipIfUnchanged) {
    const latest = await getLatestVersion(ctx, doc._id);
    if (latest && versionRowFingerprint(latest) === snapshotFingerprint(payload)) {
      return null;
    }
  }

  const versionNumber = await getNextVersionNumber(ctx, doc._id);
  const versionId = await ctx.db.insert("documentVersions", {
    documentId: doc._id,
    projectId: doc.projectId,
    versionNumber,
    saveType: opts.saveType,
    savedByUserId: opts.savedByUserId,
    savedAt: Date.now(),
    label: opts.label,
    sourceVersionId: opts.sourceVersionId,
    ...payload,
  });

  if (opts.saveType === "autosave") {
    await pruneAutosaveVersions(ctx, doc._id);
  }

  return versionId;
}

async function requireDocumentAccess(ctx: MutationCtx, documentId: Id<"documents">) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found");
  const project = await ctx.db.get(doc.projectId);
  if (!project) throw new Error("Project not found");
  const user = await ctx.db.get(userId);
  assertProjectAccess(project, userId, user);
  return { userId, doc, project };
}

export const ensureInitialDocumentVersion = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const { userId, doc } = await requireDocumentAccess(ctx, args.documentId);
    const existing = await ctx.db
      .query("documentVersions")
      .withIndex("by_document_version", (q) => q.eq("documentId", args.documentId))
      .first();
    if (existing) return existing._id;

    const saveType: DocumentVersionSaveType = doc.formData ? "publish" : "upload";
    return await snapshotDocumentVersion(ctx, doc, {
      saveType,
      savedByUserId: userId,
      label: "Initial version",
    });
  },
});

export const listDocumentVersions = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return [];
    const project = await ctx.db.get(doc.projectId);
    if (!project) return [];
    const user = await ctx.db.get(userId);
    try {
      assertProjectAccess(project, userId, user);
    } catch {
      return [];
    }

    const versions = await ctx.db
      .query("documentVersions")
      .withIndex("by_document_savedAt", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect();

    const out = [];
    for (const version of versions) {
      const saver = await ctx.db.get(version.savedByUserId);
      out.push({
        ...version,
        savedByName: saver?.name?.trim() || saver?.email?.trim() || "Unknown",
      });
    }
    return out;
  },
});

export const saveDocumentDraft = mutation({
  args: {
    documentId: v.id("documents"),
    formData: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    tradeName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, doc } = await requireDocumentAccess(ctx, args.documentId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.formData !== undefined) patch.formData = args.formData;
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.tradeName !== undefined) patch.tradeName = args.tradeName;
    if (Object.keys(patch).length === 1) return args.documentId;

    await ctx.db.patch(args.documentId, patch);
    const updated = await ctx.db.get(args.documentId);
    if (!updated) throw new Error("Document not found");

    await snapshotDocumentVersion(ctx, updated, {
      saveType: "autosave",
      savedByUserId: userId,
      label: "Auto-save",
      skipIfUnchanged: true,
    });

    return args.documentId;
  },
});

function patchFromVersion(version: Doc<"documentVersions">): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    updatedAt: Date.now(),
    name: version.name,
    type: version.type,
    description: version.description,
    tradeName: version.tradeName,
    status: version.status,
    folderId: version.folderId,
    createdDate: version.createdDate,
    workflowDueDate: version.workflowDueDate,
    workflowStatus: version.workflowStatus,
    assigneeUserIds: version.assigneeUserIds,
    distributionUserIds: version.distributionUserIds,
    ballInCourtUserIds: version.ballInCourtUserIds,
    billingProgressPercent: version.billingProgressPercent,
    complianceCategory: version.complianceCategory,
    issueDate: version.issueDate,
    expiryDate: version.expiryDate,
    subtradeId: version.subtradeId,
    formData: version.formData,
  };
  if (version.fileUrl) patch.fileUrl = version.fileUrl;
  return patch;
}

export const restoreDocumentVersion = mutation({
  args: {
    versionId: v.id("documentVersions"),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Version not found");
    const { userId, doc } = await requireDocumentAccess(ctx, version.documentId);

    await snapshotDocumentVersion(ctx, doc, {
      saveType: "manual",
      savedByUserId: userId,
      label: "Before restore",
    });

    const patch = patchFromVersion(version);
    if (version.storageId) {
      const url = await ctx.storage.getUrl(version.storageId);
      if (url) patch.fileUrl = url;
    }
    await ctx.db.patch(version.documentId, patch);

    const restored = await ctx.db.get(version.documentId);
    if (!restored) throw new Error("Document not found");

    await snapshotDocumentVersion(ctx, { ...restored, storageId: version.storageId }, {
      saveType: "restore",
      savedByUserId: userId,
      label: `Restored from v${version.versionNumber}`,
      sourceVersionId: version._id,
    });

    await recordAuditLog(ctx, {
      action: "documentVersions.restoreDocumentVersion",
      resourceType: "documents",
      resourceId: version.documentId,
      summary: `${restored.name} ← v${version.versionNumber}`,
    });

    return version.documentId;
  },
});

export const branchDocumentFromVersion = mutation({
  args: {
    versionId: v.id("documentVersions"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Version not found");
    const { userId } = await requireDocumentAccess(ctx, version.documentId);

    const sourceDoc = await ctx.db.get(version.documentId);
    if (!sourceDoc) throw new Error("Source document not found");

    let fileUrl = version.fileUrl ?? sourceDoc.fileUrl;
    if (version.storageId) {
      const url = await ctx.storage.getUrl(version.storageId);
      if (url) fileUrl = url;
    }

    const now = Date.now();
    const newDocId = await ctx.db.insert("documents", {
      projectId: sourceDoc.projectId,
      folderId: version.folderId ?? sourceDoc.folderId,
      uploadedByUserId: userId,
      type: version.type,
      name: args.name.trim(),
      fileUrl,
      status: version.status ?? sourceDoc.status,
      createdDate: version.createdDate ?? sourceDoc.createdDate,
      uploadedAt: now,
      updatedAt: now,
      workflowDueDate: version.workflowDueDate,
      workflowStatus: version.workflowStatus,
      assigneeUserIds: version.assigneeUserIds,
      distributionUserIds: version.distributionUserIds,
      ballInCourtUserIds: version.ballInCourtUserIds,
      tradeName: version.tradeName,
      description: version.description,
      billingProgressPercent: version.billingProgressPercent,
      complianceCategory: version.complianceCategory,
      issueDate: version.issueDate,
      expiryDate: version.expiryDate,
      subtradeId: version.subtradeId,
      formData: version.formData,
      sourceDocumentId: version.documentId,
    });

    const newDoc = await ctx.db.get(newDocId);
    if (!newDoc) throw new Error("Document not found");

    await snapshotDocumentVersion(ctx, { ...newDoc, storageId: version.storageId }, {
      saveType: "branch",
      savedByUserId: userId,
      label: `Branched from v${version.versionNumber}`,
      sourceVersionId: version._id,
    });

    await recordAuditLog(ctx, {
      action: "documentVersions.branchDocumentFromVersion",
      resourceType: "documents",
      resourceId: newDocId,
      summary: `${args.name.trim()} from v${version.versionNumber}`,
    });

    return newDocId;
  },
});

/** One-time: create version 1 for documents that have no version history. */
export const backfillDocumentVersions = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    let created = 0;
    let scanned = 0;

    for (const doc of await ctx.db.query("documents").collect()) {
      if (scanned >= limit) break;
      scanned++;

      const existing = await ctx.db
        .query("documentVersions")
        .withIndex("by_document_version", (q) => q.eq("documentId", doc._id))
        .first();
      if (existing) continue;

      const saveType: DocumentVersionSaveType = doc.formData ? "publish" : "upload";
      await snapshotDocumentVersion(ctx, doc, {
        saveType,
        savedByUserId: doc.uploadedByUserId,
        label: "Initial version (backfill)",
        skipIfUnchanged: false,
      });
      created++;
    }

    return { created, scanned };
  },
});
