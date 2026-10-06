import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("projectCalendarEvents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    description: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (args.endDate < args.startDate) throw new Error("End date must be on or after start date");
    let fileUrl: string | undefined;
    if (args.storageId) {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("File not found");
      fileUrl = url;
    } else if (args.fileUrl) {
      fileUrl = args.fileUrl;
    }
    const now = Date.now();
    const id = await ctx.db.insert("projectCalendarEvents", {
      projectId: args.projectId,
      title: args.title.trim(),
      startDate: args.startDate,
      endDate: args.endDate,
      description: args.description?.trim(),
      fileUrl,
      uploadedAt: fileUrl ? now : undefined,
    });
    await recordAuditLog(ctx, {
      action: "projectCalendar.create",
      resourceType: "projectCalendarEvents",
      resourceId: id,
      summary: args.title.trim(),
    });
    return id;
  },
});

export const update = mutation({
  args: {
    eventId: v.id("projectCalendarEvents"),
    title: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    description: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { eventId, ...updates } = args;
    const doc = await ctx.db.get(eventId);
    if (!doc) throw new Error("Event not found");
    const patch: Record<string, unknown> = {};
    if (updates.title !== undefined) patch.title = updates.title.trim();
    if (updates.startDate !== undefined) patch.startDate = updates.startDate;
    if (updates.endDate !== undefined) patch.endDate = updates.endDate;
    if (updates.startDate !== undefined && updates.endDate !== undefined && updates.endDate < updates.startDate)
      throw new Error("End date must be on or after start date");
    if (updates.description !== undefined) patch.description = updates.description?.trim();
    if (updates.storageId != null) {
      const url = await ctx.storage.getUrl(updates.storageId);
      if (!url) throw new Error("File not found");
      patch.fileUrl = url;
      patch.uploadedAt = Date.now();
    } else if (updates.fileUrl !== undefined) {
      patch.fileUrl = updates.fileUrl;
      patch.uploadedAt = updates.fileUrl ? Date.now() : undefined;
    }
    if (Object.keys(patch).length === 0) return eventId;
    await ctx.db.patch(eventId, patch);
    return eventId;
  },
});

export const remove = mutation({
  args: { eventId: v.id("projectCalendarEvents") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const doc = await ctx.db.get(args.eventId);
    await ctx.db.delete(args.eventId);
    await recordAuditLog(ctx, {
      action: "projectCalendar.remove",
      resourceType: "projectCalendarEvents",
      resourceId: args.eventId,
      summary: doc?.title,
    });
    return args.eventId;
  },
});
