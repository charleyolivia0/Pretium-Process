import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";
import { markupPayloadValidator } from "./lib/markupPayload";
import { assertProjectAccess } from "./lib/projectAccess";

export const getDrawingForViewer = query({
  args: { drawingId: v.id("drawings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drawing = await ctx.db.get(args.drawingId);
    if (!drawing) return null;
    const project = await ctx.db.get(drawing.projectId);
    if (!project) return null;
    const user = await ctx.db.get(userId);
    try {
      assertProjectAccess(project, userId, user);
    } catch {
      return null;
    }
    let fileUrl = drawing.fileUrl;
    const fresh = await ctx.storage.getUrl(drawing.storageId);
    if (fresh) fileUrl = fresh;
    const uploader = await ctx.db.get(drawing.uploadedByUserId);
    return {
      _id: drawing._id,
      projectId: drawing.projectId,
      folderId: drawing.folderId,
      name: drawing.name,
      notes: drawing.notes,
      fileUrl,
      uploadedAt: drawing.uploadedAt,
      uploaderName: uploader?.name ?? uploader?.email ?? "Unknown",
    };
  },
});

export const getMarkupByDrawingId = query({
  args: { drawingId: v.id("drawings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const drawing = await ctx.db.get(args.drawingId);
    if (!drawing) return null;
    const project = await ctx.db.get(drawing.projectId);
    if (!project) return null;
    const user = await ctx.db.get(userId);
    try {
      assertProjectAccess(project, userId, user);
    } catch {
      return null;
    }

    const row = await ctx.db
      .query("drawingMarkups")
      .withIndex("by_drawing", (q) => q.eq("drawingId", args.drawingId))
      .unique();
    if (!row) return null;

    const editor = row.updatedByUserId ? await ctx.db.get(row.updatedByUserId) : null;
    return {
      ...row,
      updatedByName: editor?.name?.trim() || editor?.email?.trim() || "Another user",
    };
  },
});

export const saveDrawingMarkup = mutation({
  args: {
    drawingId: v.id("drawings"),
    projectId: v.id("projects"),
    payload: markupPayloadValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const drawing = await ctx.db.get(args.drawingId);
    if (!drawing) throw new Error("Drawing not found");
    if (drawing.projectId !== args.projectId) {
      throw new Error("Drawing does not belong to this project");
    }
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const user = await ctx.db.get(userId);
    assertProjectAccess(project, userId, user);

    const now = Date.now();
    const existing = await ctx.db
      .query("drawingMarkups")
      .withIndex("by_drawing", (q) => q.eq("drawingId", args.drawingId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        payload: args.payload,
        updatedAt: now,
        updatedByUserId: userId,
      });
      await recordAuditLog(ctx, {
        action: "drawings.saveMarkup",
        resourceType: "drawingMarkups",
        resourceId: existing._id,
        summary: drawing.name,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("drawingMarkups", {
      drawingId: args.drawingId,
      projectId: args.projectId,
      payload: args.payload,
      updatedAt: now,
      updatedByUserId: userId,
    });
    await recordAuditLog(ctx, {
      action: "drawings.saveMarkup",
      resourceType: "drawingMarkups",
      resourceId: id,
      summary: drawing.name,
    });
    return id;
  },
});
