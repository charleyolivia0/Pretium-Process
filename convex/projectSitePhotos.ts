import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { recordAuditLog } from "./auditLog";

const SITE_PHOTO_CATEGORIES = ["deficiency", "progress", "safety_issue", "close_out"] as const;
export const sitePhotoCategoryValidator = v.union(
  ...SITE_PHOTO_CATEGORIES.map((c) => v.literal(c)),
);

async function assertSubtradeOnProject(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  subtradeId: Id<"projectSubtrades">,
) {
  const sub = await ctx.db.get(subtradeId);
  if (!sub || sub.projectId !== projectId) {
    throw new Error("Invalid trade for this project");
  }
}

async function enrichWithUploader(ctx: QueryCtx, row: Doc<"projectSitePhotos">) {
  const uploader = await ctx.db.get(row.uploadedByUserId);
  /** Convex storage URLs expire; always serve a fresh link from `storageId`. */
  const fileUrl = (await ctx.storage.getUrl(row.storageId)) ?? row.fileUrl;
  return {
    ...row,
    fileUrl,
    uploaderName: uploader?.name ?? uploader?.email ?? "Unknown",
  };
}

/** `folderFilter`: omit = all; `"unfiled"` = no folder; id = that folder */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    folderFilter: v.optional(v.union(v.literal("unfiled"), v.id("sitePhotoFolders"))),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);

    if (args.folderFilter && args.folderFilter !== "unfiled") {
      const folderId = args.folderFilter;
      const folder = await ctx.db.get(folderId);
      if (!folder || folder.projectId !== args.projectId) return [];

      const rows = await ctx.db
        .query("projectSitePhotos")
        .withIndex("by_project_sitePhotoFolder_uploadedAt", (q) =>
          q.eq("projectId", args.projectId).eq("sitePhotoFolderId", folderId),
        )
        .order("desc")
        .collect();
      return await Promise.all(rows.map((row) => enrichWithUploader(ctx, row)));
    }

    const rows = await ctx.db
      .query("projectSitePhotos")
      .withIndex("by_project_uploadedAt", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const filtered =
      args.folderFilter === "unfiled"
        ? rows.filter((r) => r.sitePhotoFolderId === undefined)
        : rows;

    return await Promise.all(filtered.map((row) => enrichWithUploader(ctx, row)));
  },
});

export const listFoldersByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const folders = await ctx.db
      .query("sitePhotoFolders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    folders.sort((a, b) => a.name.localeCompare(b.name));
    return folders;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createSitePhotoFolder = mutation({
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
      .query("sitePhotoFolders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const duplicate = existing.some((f) => f.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) throw new Error("Folder already exists");

    const now = Date.now();
    const id = await ctx.db.insert("sitePhotoFolders", {
      projectId: args.projectId,
      name,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "projectSitePhotos.createSitePhotoFolder",
      resourceType: "sitePhotoFolders",
      resourceId: id,
      summary: name,
    });
    return id;
  },
});

export const deleteSitePhotoFolder = mutation({
  args: { folderId: v.id("sitePhotoFolders") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");

    const photos = await ctx.db
      .query("projectSitePhotos")
      .withIndex("by_project_sitePhotoFolder_uploadedAt", (q) =>
        q.eq("projectId", folder.projectId).eq("sitePhotoFolderId", args.folderId),
      )
      .collect();
    const now = Date.now();
    for (const p of photos) {
      await ctx.db.patch(p._id, { sitePhotoFolderId: undefined });
    }
    await ctx.db.delete(args.folderId);
    await recordAuditLog(ctx, {
      action: "projectSitePhotos.deleteSitePhotoFolder",
      resourceType: "sitePhotoFolders",
      resourceId: args.folderId,
      summary: folder.name,
    });
    return args.folderId;
  },
});

export const createSitePhoto = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    displayName: v.optional(v.string()),
    originalFileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    caption: v.optional(v.string()),
    sitePhotoFolderId: v.optional(v.id("sitePhotoFolders")),
    clientMutationId: v.optional(v.string()),
    areaOnSite: v.optional(v.string()),
    subtradeId: v.optional(v.id("projectSubtrades")),
    taggedDate: v.optional(v.number()),
    photoCategory: v.optional(sitePhotoCategoryValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (args.clientMutationId?.trim()) {
      const key = args.clientMutationId.trim();
      const existing = await ctx.db
        .query("projectSitePhotos")
        .withIndex("by_clientMutationId", (q) => q.eq("clientMutationId", key))
        .first();
      if (existing) return existing._id;
    }

    if (args.sitePhotoFolderId) {
      const folder = await ctx.db.get(args.sitePhotoFolderId);
      if (!folder || folder.projectId !== args.projectId) {
        throw new Error("Invalid site photo folder");
      }
    }

    if (args.subtradeId) {
      await assertSubtradeOnProject(ctx, args.projectId, args.subtradeId);
    }

    const fileUrl = await ctx.storage.getUrl(args.storageId);
    if (!fileUrl) throw new Error("File not found");

    const displayName = args.displayName?.trim();
    const caption = args.caption?.trim();
    const originalFileName = args.originalFileName?.trim();
    const mimeType = args.mimeType?.trim();
    const areaOnSiteTrimmed = args.areaOnSite?.trim();
    const notesTrimmed = args.notes?.trim();
    const uploadedAt = Date.now();
    const id = await ctx.db.insert("projectSitePhotos", {
      projectId: args.projectId,
      ...(args.sitePhotoFolderId ? { sitePhotoFolderId: args.sitePhotoFolderId } : {}),
      storageId: args.storageId,
      fileUrl,
      displayName: displayName || originalFileName || caption || "Unnamed file",
      originalFileName: originalFileName ? originalFileName : undefined,
      mimeType: mimeType ? mimeType : undefined,
      caption: caption ? caption : undefined,
      uploadedByUserId: userId,
      uploadedAt,
      clientMutationId: args.clientMutationId?.trim() || undefined,
      ...(areaOnSiteTrimmed ? { areaOnSite: areaOnSiteTrimmed } : {}),
      ...(args.subtradeId ? { subtradeId: args.subtradeId } : {}),
      ...(args.taggedDate !== undefined ? { taggedDate: args.taggedDate } : {}),
      ...(args.photoCategory ? { photoCategory: args.photoCategory } : {}),
      ...(notesTrimmed ? { notes: notesTrimmed } : {}),
    });
    await recordAuditLog(ctx, {
      action: "projectSitePhotos.createSitePhoto",
      resourceType: "projectSitePhotos",
      resourceId: id,
      summary: `Project ${args.projectId}`,
    });
    return id;
  },
});

export const updateSitePhoto = mutation({
  args: {
    photoId: v.id("projectSitePhotos"),
    displayName: v.optional(v.string()),
    sitePhotoFolderId: v.optional(v.union(v.id("sitePhotoFolders"), v.null())),
    areaOnSite: v.optional(v.union(v.string(), v.null())),
    subtradeId: v.optional(v.union(v.id("projectSubtrades"), v.null())),
    taggedDate: v.optional(v.union(v.number(), v.null())),
    photoCategory: v.optional(v.union(sitePhotoCategoryValidator, v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new Error("Site photo not found");

    const patch: Partial<Doc<"projectSitePhotos">> = {};

    if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (!name) throw new Error("Name is required");
      patch.displayName = name;
    }

    if (args.sitePhotoFolderId !== undefined) {
      if (args.sitePhotoFolderId === null) {
        patch.sitePhotoFolderId = undefined;
      } else {
        const folder = await ctx.db.get(args.sitePhotoFolderId);
        if (!folder || folder.projectId !== photo.projectId) {
          throw new Error("Invalid site photo folder");
        }
        patch.sitePhotoFolderId = args.sitePhotoFolderId;
      }
    }

    if (args.areaOnSite !== undefined) {
      if (args.areaOnSite === null) {
        patch.areaOnSite = undefined;
      } else {
        const t = args.areaOnSite.trim();
        patch.areaOnSite = t ? t : undefined;
      }
    }

    if (args.subtradeId !== undefined) {
      if (args.subtradeId === null) {
        patch.subtradeId = undefined;
      } else {
        await assertSubtradeOnProject(ctx, photo.projectId, args.subtradeId);
        patch.subtradeId = args.subtradeId;
      }
    }

    if (args.taggedDate !== undefined) {
      patch.taggedDate = args.taggedDate === null ? undefined : args.taggedDate;
    }

    if (args.photoCategory !== undefined) {
      patch.photoCategory = args.photoCategory === null ? undefined : args.photoCategory;
    }

    if (args.notes !== undefined) {
      if (args.notes === null) {
        patch.notes = undefined;
      } else {
        const t = args.notes.trim();
        patch.notes = t ? t : undefined;
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("No updates provided");
    }

    await ctx.db.patch(args.photoId, patch);
    await recordAuditLog(ctx, {
      action: "projectSitePhotos.updateSitePhoto",
      resourceType: "projectSitePhotos",
      resourceId: args.photoId,
      summary: patch.displayName ?? undefined,
    });
    return args.photoId;
  },
});

export const deleteSitePhoto = mutation({
  args: { photoId: v.id("projectSitePhotos") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const markup = await ctx.db
      .query("sitePhotoMarkups")
      .withIndex("by_photo", (q) => q.eq("photoId", args.photoId))
      .unique();
    if (markup) {
      await ctx.db.delete(markup._id);
    }
    await ctx.db.delete(args.photoId);
    await recordAuditLog(ctx, {
      action: "projectSitePhotos.deleteSitePhoto",
      resourceType: "projectSitePhotos",
      resourceId: args.photoId,
    });
    return args.photoId;
  },
});
