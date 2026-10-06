import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import {
  emitActionRequiredToBallInCourt,
  emitProjectChangeUpdatedToPmAndCoordinator,
  resetPersonalRemindersLastNotified,
  deletePersonalRemindersForDocument,
} from "./notifications";
import { recordAuditLog } from "./auditLog";
import { snapshotDocumentVersion, type DocumentVersionSaveType } from "./documentVersions";
import { assertProjectAccess, requireAuthenticatedProject } from "./lib/projectAccess";

const DOC_TYPE_RFI = "RFI";
const DOC_TYPE_SUBMITTAL = "SUBMITTAL";

type RfiWorkflowStatus = "draft" | "open" | "closed";

const COMPLIANCE_DOCUMENT_CATEGORIES = [
  "insurance",
  "wcb_wsib",
  "safety_certificate",
  "license",
  "subtrade_compliance",
  "other",
] as const;

const complianceCategoryValidator = v.union(
  ...COMPLIANCE_DOCUMENT_CATEGORIES.map((c) => v.literal(c)),
);

function normalizeDocType(type: string) {
  return type.trim().toUpperCase();
}

function inferVersionSaveType(args: {
  formData?: string;
  storageId?: Id<"_storage">;
  fileUrl?: string;
  isCreate?: boolean;
}): DocumentVersionSaveType {
  if (args.formData && (args.storageId || args.fileUrl)) return "publish";
  if (args.storageId || args.fileUrl) return "upload";
  if (args.formData) return "publish";
  return args.isCreate ? "upload" : "manual";
}

function versionLabelForSaveType(saveType: DocumentVersionSaveType): string | undefined {
  switch (saveType) {
    case "publish":
      return "Published PDF";
    case "upload":
      return "File uploaded";
    case "manual":
      return "Manual save";
    default:
      return undefined;
  }
}

/** Resolve storage IDs to public URLs after a client-side upload (preview + folder document sync). */
export const getStorageUrlsForIds = query({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const out: (string | null)[] = [];
    for (const id of args.storageIds) {
      out.push(await ctx.storage.getUrl(id));
    }
    return out;
  },
});

export const getDocumentById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    const project = await ctx.db.get(doc.projectId);
    if (!project) return null;
    const user = await ctx.db.get(userId);
    try {
      assertProjectAccess(project, userId, user);
    } catch {
      return null;
    }
    let fileUrl = doc.fileUrl;
    return { ...doc, fileUrl };
  },
});

export const listDocumentsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_project_uploadedAt", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    // Backfill: for existing documents created before workflow fields existed,
    // infer workflowStatus/workflowDueDate from legacy status/createdDate.
    return docs.map((d) => {
      const normalizedType = normalizeDocType(d.type);
      const isWorkflowDoc = normalizedType === DOC_TYPE_RFI;
      if (!isWorkflowDoc) return d;

      const inferredWorkflowStatus = d.workflowStatus ?? (d.status === "paid" ? "closed" : "open");
      const inferredWorkflowDueDate = d.workflowDueDate ?? d.createdDate ?? undefined;

      return {
        ...d,
        workflowStatus: inferredWorkflowStatus,
        workflowDueDate: inferredWorkflowDueDate,
      };
    });
  },
});

export const getCoBySourceDocument = query({
  args: { sourceDocumentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const linked = await ctx.db
      .query("documents")
      .withIndex("by_source_document", (q) => q.eq("sourceDocumentId", args.sourceDocumentId))
      .collect();
    return linked.find((d) => normalizeDocType(d.type) === "CO") ?? null;
  },
});

export const listDocumentFoldersByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);
    const folders = await ctx.db
      .query("documentFolders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  },
});
export const getDocumentFolder = query({
  args: { folderId: v.id("documentFolders") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db.get(args.folderId);
  },
});

export const listDocumentsInFolder = query({
  args: {
    projectId: v.id("projects"),
    folderId: v.id("documentFolders"),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.projectId !== args.projectId) {
      return [];
    }
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_project_folder", (q) =>
        q.eq("projectId", args.projectId).eq("folderId", args.folderId),
      )
      .collect();

    const sorted = docs.sort((a, b) => b.uploadedAt - a.uploadedAt);

    return sorted.map((d) => {
      const normalizedType = normalizeDocType(d.type);
      const isWorkflowDoc = normalizedType === DOC_TYPE_RFI;
      if (!isWorkflowDoc) return d;

      const inferredWorkflowStatus = d.workflowStatus ?? (d.status === "paid" ? "closed" : "open");
      const inferredWorkflowDueDate = d.workflowDueDate ?? d.createdDate ?? undefined;

      return {
        ...d,
        workflowStatus: inferredWorkflowStatus,
        workflowDueDate: inferredWorkflowDueDate,
      };
    });
  },
});

export const createDocumentFolder = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const name = args.name.trim();
    if (!name) throw new Error("Folder name is required");

    const existing = await ctx.db
      .query("documentFolders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const duplicate = existing.some((f) => f.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) throw new Error("Folder already exists");

    const now = Date.now();
    const fid = await ctx.db.insert("documentFolders", {
      projectId: args.projectId,
      name,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "documents.createDocumentFolder",
      resourceType: "documentFolders",
      resourceId: fid,
      summary: name,
    });
    return fid;
  },
});

export const updateDocumentFolder = mutation({
  args: {
    folderId: v.id("documentFolders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");
    const name = args.name.trim();
    if (!name) throw new Error("Folder name is required");

    const siblings = await ctx.db
      .query("documentFolders")
      .withIndex("by_project", (q) => q.eq("projectId", folder.projectId))
      .collect();
    const duplicate = siblings.some(
      (f) => f._id !== args.folderId && f.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) throw new Error("Folder already exists");

    await ctx.db.patch(args.folderId, { name, updatedAt: Date.now() });
    await recordAuditLog(ctx, {
      action: "documents.updateDocumentFolder",
      resourceType: "documentFolders",
      resourceId: args.folderId,
      summary: name,
    });
    return args.folderId;
  },
});

export const deleteDocumentFolder = mutation({
  args: { folderId: v.id("documentFolders") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");

    const docs = await ctx.db
      .query("documents")
      .withIndex("by_project_folder", (q) =>
        q.eq("projectId", folder.projectId).eq("folderId", args.folderId),
      )
      .collect();
    const now = Date.now();
    for (const d of docs) {
      await ctx.db.patch(d._id, { folderId: undefined, updatedAt: now });
    }
    await ctx.db.delete(args.folderId);
    return args.folderId;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createDocumentRecord = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.string(),
    name: v.string(),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    folderId: v.optional(v.id("documentFolders")),
    status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))),
    createdDate: v.optional(v.number()),
    // Optional workflow metadata for RFI documents (Procore/ACC-like).
    workflowDueDate: v.optional(v.number()),
    workflowStatus: v.optional(v.string()),
    assigneeUserIds: v.optional(v.array(v.id("users"))),
    distributionUserIds: v.optional(v.array(v.id("users"))),
    ballInCourtUserIds: v.optional(v.array(v.id("users"))),
    tradeName: v.optional(v.string()),
    description: v.optional(v.string()),
    billingProgressPercent: v.optional(v.number()),
    complianceCategory: v.optional(complianceCategoryValidator),
    issueDate: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
    subtradeId: v.optional(v.id("projectSubtrades")),
    formData: v.optional(v.string()),
    clientMutationId: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await requireAuthenticatedProject(ctx, args.projectId);
    if (args.clientMutationId?.trim()) {
      const key = args.clientMutationId.trim();
      const existing = await ctx.db
        .query("documents")
        .withIndex("by_clientMutationId", (q) => q.eq("clientMutationId", key))
        .first();
      if (existing) return existing._id;
    }
    let fileUrl: string;
    if (args.storageId) {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("File not found");
      fileUrl = url;
    } else if (args.fileUrl) {
      fileUrl = args.fileUrl;
    } else {
      throw new Error("Provide either fileUrl or storageId");
    }
    const now = Date.now();
    const createdAt = args.createdDate ?? now;
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.projectId !== args.projectId) {
        throw new Error("Folder not found for this project");
      }
    }
    if (args.subtradeId) {
      const subtrade = await ctx.db.get(args.subtradeId);
      if (!subtrade || subtrade.projectId !== args.projectId) {
        throw new Error("Subtrade not found for this project");
      }
    }
    if (args.sourceDocumentId) {
      const source = await ctx.db.get(args.sourceDocumentId);
      if (!source || source.projectId !== args.projectId) {
        throw new Error("Source document not found for this project");
      }
      const sourceType = normalizeDocType(source.type);
      if (sourceType !== "PCN" && sourceType !== "COR") {
        throw new Error("Source document must be a PCN or COR");
      }
    }

    const normalizedType = normalizeDocType(args.type);
    const isRfi = normalizedType === DOC_TYPE_RFI;
    const inferredWorkflowStatus: string | undefined =
      isRfi
        ? args.workflowStatus ?? (args.status === "paid" ? "closed" : "open")
        : args.workflowStatus;

    const assigneeUserIds = args.assigneeUserIds;
    const ballInCourtUserIds =
      args.ballInCourtUserIds ??
      (inferredWorkflowStatus === "open" ? (assigneeUserIds ?? []) : undefined);

    const billingPct =
      args.billingProgressPercent !== undefined
        ? Math.min(100, Math.max(0, args.billingProgressPercent))
        : undefined;

    const documentId = await ctx.db.insert("documents", {
      projectId: args.projectId,
      folderId: args.folderId,
      uploadedByUserId: userId,
      type: normalizedType,
      name: args.name,
      fileUrl,
      status: args.status,
      createdDate: args.createdDate,
      uploadedAt: createdAt,
      updatedAt: createdAt,
      workflowDueDate: args.workflowDueDate,
      workflowStatus: inferredWorkflowStatus,
      assigneeUserIds,
      distributionUserIds: args.distributionUserIds,
      ballInCourtUserIds,
      tradeName: args.tradeName,
      description: args.description,
      ...(billingPct !== undefined ? { billingProgressPercent: billingPct } : {}),
      complianceCategory: args.complianceCategory,
      issueDate: args.issueDate,
      expiryDate: args.expiryDate,
      subtradeId: args.subtradeId,
      formData: args.formData,
      clientMutationId: args.clientMutationId?.trim() || undefined,
      sourceDocumentId: args.sourceDocumentId,
    });

    await emitProjectChangeUpdatedToPmAndCoordinator(ctx, {
      projectId: args.projectId,
      documentType: normalizedType,
      documentName: args.name,
      action: "created",
    });

    await recordAuditLog(ctx, {
      action: "documents.createDocumentRecord",
      resourceType: "documents",
      resourceId: documentId,
      summary: `${args.name} (${normalizedType})`,
    });

    const createdDoc = await ctx.db.get(documentId);
    if (createdDoc) {
      const saveType = inferVersionSaveType({
        formData: args.formData,
        storageId: args.storageId,
        fileUrl: args.fileUrl,
        isCreate: true,
      });
      await snapshotDocumentVersion(ctx, { ...createdDoc, storageId: args.storageId }, {
        saveType,
        savedByUserId: userId,
        label: versionLabelForSaveType(saveType),
      });
    }

    return documentId;
  },
});

export const updateDocumentRecord = mutation({
  args: {
    documentId: v.id("documents"),
    name: v.optional(v.string()),
    status: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))),
    createdDate: v.optional(v.number()),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    folderId: v.optional(v.union(v.id("documentFolders"), v.null())),
    // Optional workflow metadata for RFI documents.
    workflowDueDate: v.optional(v.number()),
    workflowStatus: v.optional(v.string()),
    assigneeUserIds: v.optional(v.array(v.id("users"))),
    distributionUserIds: v.optional(v.array(v.id("users"))),
    ballInCourtUserIds: v.optional(v.array(v.id("users"))),
    tradeName: v.optional(v.string()),
    description: v.optional(v.string()),
    billingProgressPercent: v.optional(v.number()),
    complianceCategory: v.optional(v.union(complianceCategoryValidator, v.null())),
    issueDate: v.optional(v.union(v.number(), v.null())),
    expiryDate: v.optional(v.union(v.number(), v.null())),
    subtradeId: v.optional(v.union(v.id("projectSubtrades"), v.null())),
    formData: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const { documentId, ...updates } = args;
    const doc = await ctx.db.get(documentId);
    if (!doc) throw new Error("Document not found");
    await requireAuthenticatedProject(ctx, doc.projectId);
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.createdDate !== undefined) patch.createdDate = updates.createdDate;
    if (updates.folderId !== undefined) {
      if (updates.folderId === null) {
        patch.folderId = undefined;
      } else {
        const folder = await ctx.db.get(updates.folderId);
        if (!folder || folder.projectId !== doc.projectId) {
          throw new Error("Folder not found for this project");
        }
        patch.folderId = updates.folderId;
      }
    }
    if (updates.workflowDueDate !== undefined) patch.workflowDueDate = updates.workflowDueDate;
    if (updates.workflowStatus !== undefined) patch.workflowStatus = updates.workflowStatus;
    if (updates.assigneeUserIds !== undefined) patch.assigneeUserIds = updates.assigneeUserIds;
    if (updates.distributionUserIds !== undefined) patch.distributionUserIds = updates.distributionUserIds;
    if (updates.ballInCourtUserIds !== undefined) patch.ballInCourtUserIds = updates.ballInCourtUserIds;
    if (updates.tradeName !== undefined) patch.tradeName = updates.tradeName;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.billingProgressPercent !== undefined) {
      patch.billingProgressPercent = Math.min(100, Math.max(0, updates.billingProgressPercent));
    }
    if (updates.complianceCategory !== undefined) {
      patch.complianceCategory = updates.complianceCategory ?? undefined;
    }
    if (updates.issueDate !== undefined) {
      patch.issueDate = updates.issueDate ?? undefined;
    }
    if (updates.expiryDate !== undefined) {
      patch.expiryDate = updates.expiryDate ?? undefined;
      patch.expiryReminderMilestonesSent = undefined;
    }
    if (updates.subtradeId !== undefined) {
      if (updates.subtradeId === null) {
        patch.subtradeId = undefined;
      } else {
        const subtrade = await ctx.db.get(updates.subtradeId);
        if (!subtrade || subtrade.projectId !== doc.projectId) {
          throw new Error("Subtrade not found for this project");
        }
        patch.subtradeId = updates.subtradeId;
      }
    }
    if (updates.formData !== undefined) {
      patch.formData = updates.formData ?? undefined;
    }
    if (updates.storageId != null) {
      const url = await ctx.storage.getUrl(updates.storageId);
      if (!url) throw new Error("File not found");
      patch.fileUrl = url;
    } else if (updates.fileUrl !== undefined) {
      patch.fileUrl = updates.fileUrl;
    }
    if (Object.keys(patch).length === 0) return documentId;

    const hasVersionableChange =
      updates.formData !== undefined ||
      updates.storageId != null ||
      updates.fileUrl !== undefined ||
      updates.name !== undefined ||
      updates.description !== undefined ||
      updates.tradeName !== undefined ||
      updates.status !== undefined ||
      updates.folderId !== undefined ||
      updates.workflowDueDate !== undefined ||
      updates.workflowStatus !== undefined ||
      updates.assigneeUserIds !== undefined ||
      updates.complianceCategory !== undefined ||
      updates.issueDate !== undefined ||
      updates.expiryDate !== undefined ||
      updates.subtradeId !== undefined;

    patch.updatedAt = Date.now();
    await ctx.db.patch(documentId, patch);
    await resetPersonalRemindersLastNotified(ctx, documentId);

    await emitProjectChangeUpdatedToPmAndCoordinator(ctx, {
      projectId: doc.projectId,
      documentType: doc.type,
      documentName: (patch.name as string | undefined) ?? doc.name,
      action: "updated",
    });

    await recordAuditLog(ctx, {
      action: "documents.updateDocumentRecord",
      resourceType: "documents",
      resourceId: documentId,
      summary: doc.name,
    });

    const updatedDoc = await ctx.db.get(documentId);
    if (updatedDoc && hasVersionableChange) {
      const saveType = inferVersionSaveType({
        formData: updates.formData ?? undefined,
        storageId: updates.storageId ?? undefined,
        fileUrl: updates.fileUrl,
      });
      await snapshotDocumentVersion(ctx, { ...updatedDoc, storageId: updates.storageId ?? undefined }, {
        saveType,
        savedByUserId: userId,
        label: versionLabelForSaveType(saveType),
        skipIfUnchanged: saveType === "manual",
      });
    }

    return documentId;
  },
});

export const deleteDocumentRecord = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    await requireAuthenticatedProject(ctx, doc.projectId);
    await deletePersonalRemindersForDocument(ctx, args.documentId);
    await ctx.db.delete(args.documentId);

    await emitProjectChangeUpdatedToPmAndCoordinator(ctx, {
      projectId: doc.projectId,
      documentType: doc.type,
      documentName: doc.name,
      action: "deleted",
    });

    return args.documentId;
  },
});

function ballIncludesUser(ball: Id<"users">[] | undefined, userId: Id<"users">) {
  if (!ball) return false;
  return (ball as Id<"users">[]).some((id) => id === userId);
}

export const listDocumentWorkflowResponses = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const responses = await ctx.db
      .query("documentWorkflowResponses")
      .withIndex("by_document_createdAt", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();

    return await Promise.all(
      responses.map(async (r) => {
        const u = await ctx.db.get(r.responderUserId);
        return {
          ...r,
          responderName: u?.name ?? u?.email ?? "Unknown",
        };
      }),
    );
  },
});

export const listDocumentWorkflowEvents = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const events = await ctx.db
      .query("documentWorkflowEvents")
      .withIndex("by_document_createdAt", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();

    return await Promise.all(
      events.map(async (e) => {
        const actor = e.actorUserId ? await ctx.db.get(e.actorUserId) : null;
        return {
          ...e,
          actorName: actor?.name ?? actor?.email ?? undefined,
        };
      }),
    );
  },
});

export const transitionRfiWorkflow = mutation({
  args: {
    documentId: v.id("documents"),
    targetStatus: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
    workflowDueDate: v.optional(v.number()),
    assigneeUserIds: v.optional(v.array(v.id("users"))),
    distributionUserIds: v.optional(v.array(v.id("users"))),
    ballInCourtUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (normalizeDocType(doc.type) !== DOC_TYPE_RFI) throw new Error("Not an RFI document");

    const fromStatus = doc.workflowStatus ?? undefined;
    const nextAssigneeUserIds = args.assigneeUserIds ?? doc.assigneeUserIds ?? undefined;
    const nextDistributionUserIds = args.distributionUserIds ?? doc.distributionUserIds ?? undefined;

    const uploader = doc.uploadedByUserId as Id<"users">;
    const nextBallInCourtUserIds =
      args.targetStatus === "closed"
        ? []
        : args.targetStatus === "draft"
          ? [uploader]
          : args.ballInCourtUserIds ?? nextAssigneeUserIds ?? [uploader];

    const patch: Record<string, unknown> = {
      workflowStatus: args.targetStatus,
      ballInCourtUserIds: nextBallInCourtUserIds,
      // Keep legacy "paid/unpaid" in sync so older UI still makes sense.
      status: args.targetStatus === "closed" ? "paid" : "unpaid",
      updatedAt: Date.now(),
    };

    if (args.workflowDueDate !== undefined) patch.workflowDueDate = args.workflowDueDate;
    if (args.assigneeUserIds !== undefined) patch.assigneeUserIds = nextAssigneeUserIds;
    if (args.distributionUserIds !== undefined) patch.distributionUserIds = nextDistributionUserIds;

    await ctx.db.patch(args.documentId, patch);
    await resetPersonalRemindersLastNotified(ctx, args.documentId);

    const prevBall = (doc.ballInCourtUserIds ?? []) as Id<"users">[];
    const ballChanged =
      prevBall.length !== nextBallInCourtUserIds.length ||
      prevBall.some((id) => !nextBallInCourtUserIds.includes(id));

    await ctx.db.insert("documentWorkflowEvents", {
      documentId: args.documentId,
      eventType: "status_transition",
      actorUserId: userId,
      fromWorkflowStatus: fromStatus,
      toWorkflowStatus: args.targetStatus,
      assigneeUserIds: nextAssigneeUserIds,
      message: `Workflow set to ${args.targetStatus}`,
      createdAt: Date.now(),
    });

    if (ballChanged) {
      await ctx.db.insert("documentWorkflowEvents", {
        documentId: args.documentId,
        eventType: "ball_in_court_shift",
        actorUserId: userId,
        fromWorkflowStatus: fromStatus,
        toWorkflowStatus: args.targetStatus,
        ballInCourtUserIds: nextBallInCourtUserIds,
        assigneeUserIds: nextAssigneeUserIds,
        message: `Ball-in-court shifted (${nextBallInCourtUserIds.length} assignees)`,
        createdAt: Date.now(),
      });
    }

    // Notify the next ball-in-court users when workflow becomes open.
    if (args.targetStatus === "open" && nextBallInCourtUserIds.length > 0 && ballChanged) {
      await emitActionRequiredToBallInCourt(ctx, {
        projectId: doc.projectId,
        documentId: args.documentId,
        documentType: doc.type,
        documentName: doc.name,
        ballInCourtUserIds: nextBallInCourtUserIds,
        dueDate: (patch.workflowDueDate as number | undefined) ?? doc.workflowDueDate,
        alreadyDue: false,
      });
    }

    await recordAuditLog(ctx, {
      action: "documents.transitionRfiWorkflow",
      resourceType: "documents",
      resourceId: args.documentId,
      summary: `${doc.name} → ${args.targetStatus}`,
    });
    return args.documentId;
  },
});


export const submitRfiResponse = mutation({
  args: {
    documentId: v.id("documents"),
    comment: v.optional(v.string()),
    responseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (normalizeDocType(doc.type) !== DOC_TYPE_RFI) throw new Error("Not an RFI document");

    const ball = (doc.ballInCourtUserIds ?? []) as Id<"users">[];
    if (!ballIncludesUser(ball, userId as Id<"users">)) {
      throw new Error("You are not the ball-in-court responder for this RFI");
    }

    const now = Date.now();
    await ctx.db.insert("documentWorkflowResponses", {
      documentId: args.documentId,
      responseOption: "rfi_responded",
      comment: args.comment,
      responderUserId: userId,
      responseUrl: args.responseUrl,
      createdAt: now,
    });

    const fromStatus = doc.workflowStatus ?? undefined;
    await ctx.db.patch(args.documentId, {
      workflowStatus: "closed",
      ballInCourtUserIds: [],
      status: "paid",
      updatedAt: now,
    });
    await resetPersonalRemindersLastNotified(ctx, args.documentId);

    await ctx.db.insert("documentWorkflowEvents", {
      documentId: args.documentId,
      eventType: "response_submitted",
      actorUserId: userId,
      fromWorkflowStatus: fromStatus,
      toWorkflowStatus: "closed",
      ballInCourtUserIds: [],
      message: `RFI response submitted`,
      createdAt: now,
    });

    await ctx.db.insert("documentWorkflowEvents", {
      documentId: args.documentId,
      eventType: "status_transition",
      actorUserId: userId,
      fromWorkflowStatus: fromStatus,
      toWorkflowStatus: "closed",
      message: "RFI closed after response",
      createdAt: now + 1,
    });

    await recordAuditLog(ctx, {
      action: "documents.submitRfiResponse",
      resourceType: "documents",
      resourceId: args.documentId,
      summary: doc.name,
    });
    return args.documentId;
  },
});

export const submitSubmittalResponse = mutation({
  args: {
    documentId: v.id("documents"),
    responseOption: v.union(
      v.literal("approved"),
      v.literal("approved_as_noted"),
      v.literal("revise_and_resubmit"),
      v.literal("rejected"),
    ),
    comment: v.optional(v.string()),
    responseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (normalizeDocType(doc.type) !== DOC_TYPE_SUBMITTAL) throw new Error("Not a submittal document");

    const ball = (doc.ballInCourtUserIds ?? []) as Id<"users">[];
    if (!ballIncludesUser(ball, userId as Id<"users">)) {
      throw new Error("You are not the ball-in-court reviewer for this submittal");
    }

    const now = Date.now();
    await ctx.db.insert("documentWorkflowResponses", {
      documentId: args.documentId,
      responseOption: args.responseOption,
      comment: args.comment,
      responderUserId: userId,
      responseUrl: args.responseUrl,
      createdAt: now,
    });

    const fromStatus = doc.workflowStatus ?? undefined;
    const closesSubmittal =
      args.responseOption === "approved" ||
      args.responseOption === "approved_as_noted" ||
      args.responseOption === "rejected";
    const toStatus = closesSubmittal ? "closed" : "open";

    await ctx.db.patch(args.documentId, {
      workflowStatus: toStatus,
      ballInCourtUserIds: closesSubmittal ? [] : doc.ballInCourtUserIds,
      status: closesSubmittal ? "paid" : doc.status,
      updatedAt: now,
    });
    await resetPersonalRemindersLastNotified(ctx, args.documentId);

    const label =
      args.responseOption === "approved"
        ? "Approved"
        : args.responseOption === "approved_as_noted"
          ? "Approved as noted"
          : args.responseOption === "revise_and_resubmit"
            ? "Revise and resubmit"
            : "Rejected";

    await ctx.db.insert("documentWorkflowEvents", {
      documentId: args.documentId,
      eventType: "response_submitted",
      actorUserId: userId,
      fromWorkflowStatus: fromStatus,
      toWorkflowStatus: toStatus,
      ballInCourtUserIds: closesSubmittal ? [] : doc.ballInCourtUserIds,
      message: `Submittal response: ${label}`,
      createdAt: now,
    });

    if (closesSubmittal) {
      await ctx.db.insert("documentWorkflowEvents", {
        documentId: args.documentId,
        eventType: "status_transition",
        actorUserId: userId,
        fromWorkflowStatus: fromStatus,
        toWorkflowStatus: "closed",
        message: "Submittal closed after response",
        createdAt: now + 1,
      });
    }

    await recordAuditLog(ctx, {
      action: "documents.submitSubmittalResponse",
      resourceType: "documents",
      resourceId: args.documentId,
      summary: doc.name,
    });
    return args.documentId;
  },
});
