import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";
import { markupPayloadValidator } from "./lib/markupPayload";
import { assertProjectAccess } from "./lib/projectAccess";

function sitePhotoDisplayName(photo: {
  displayName?: string;
  originalFileName?: string;
  caption?: string;
}) {
  return photo.displayName?.trim() || photo.originalFileName?.trim() || photo.caption?.trim() || "Site photo";
}

export const getSitePhotoForViewer = query({
  args: { photoId: v.id("projectSitePhotos") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;
    const project = await ctx.db.get(photo.projectId);
    if (!project) return null;
    const user = await ctx.db.get(userId);
    try {
      assertProjectAccess(project, userId, user);
    } catch {
      return null;
    }
    const fileUrl = (await ctx.storage.getUrl(photo.storageId)) ?? photo.fileUrl;
    const uploader = await ctx.db.get(photo.uploadedByUserId);
    return {
      _id: photo._id,
      projectId: photo.projectId,
      displayName: sitePhotoDisplayName(photo),
      mimeType: photo.mimeType,
      originalFileName: photo.originalFileName,
      fileUrl,
      uploadedAt: photo.uploadedAt,
      uploaderName: uploader?.name ?? uploader?.email ?? "Unknown",
      photoCategory: photo.photoCategory,
      areaOnSite: photo.areaOnSite,
      notes: photo.notes,
    };
  },
});

export const getMarkupByPhotoId = query({
  args: { photoId: v.id("projectSitePhotos") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;
    const project = await ctx.db.get(photo.projectId);
    if (!project) return null;
    const user = await ctx.db.get(userId);
    try {
      assertProjectAccess(project, userId, user);
    } catch {
      return null;
    }

    const row = await ctx.db
      .query("sitePhotoMarkups")
      .withIndex("by_photo", (q) => q.eq("photoId", args.photoId))
      .unique();
    if (!row) return null;

    const editor = row.updatedByUserId ? await ctx.db.get(row.updatedByUserId) : null;
    return {
      ...row,
      updatedByName: editor?.name?.trim() || editor?.email?.trim() || "Another user",
    };
  },
});

export const saveSitePhotoMarkup = mutation({
  args: {
    photoId: v.id("projectSitePhotos"),
    projectId: v.id("projects"),
    payload: markupPayloadValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new Error("Site photo not found");
    if (photo.projectId !== args.projectId) {
      throw new Error("Site photo does not belong to this project");
    }
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const user = await ctx.db.get(userId);
    assertProjectAccess(project, userId, user);

    const now = Date.now();
    const summary = sitePhotoDisplayName(photo);
    const existing = await ctx.db
      .query("sitePhotoMarkups")
      .withIndex("by_photo", (q) => q.eq("photoId", args.photoId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        payload: args.payload,
        updatedAt: now,
        updatedByUserId: userId,
      });
      await recordAuditLog(ctx, {
        action: "projectSitePhotos.saveMarkup",
        resourceType: "sitePhotoMarkups",
        resourceId: existing._id,
        summary,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("sitePhotoMarkups", {
      photoId: args.photoId,
      projectId: args.projectId,
      payload: args.payload,
      updatedAt: now,
      updatedByUserId: userId,
    });
    await recordAuditLog(ctx, {
      action: "projectSitePhotos.saveMarkup",
      resourceType: "sitePhotoMarkups",
      resourceId: id,
      summary,
    });
    return id;
  },
});
