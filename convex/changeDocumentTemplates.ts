import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { recordAuditLog } from "./auditLog";

const TEMPLATE_CATEGORY = v.union(
  v.literal("general"),
  v.literal("rfi"),
  v.literal("co"),
  v.literal("pcn"),
  v.literal("si"),
  v.literal("cor")
);

async function requireManageTemplates(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  const r = user?.role;
  if (r === "admin" || r === "project_manager" || r === "coordinator") return userId;
  throw new Error("Only project managers, coordinators, and admins can manage templates");
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rows = await ctx.db
      .query("changeDocumentTemplates")
      .withIndex("by_uploadedAt")
      .order("desc")
      .collect();

    const result = [];
    for (const row of rows) {
      const url = await ctx.storage.getUrl(row.storageId);
      if (!url) continue;
      const uploader = await ctx.db.get(row.uploadedByUserId);
      result.push({
        _id: row._id,
        title: row.title,
        fileName: row.fileName,
        fileUrl: url,
        category: row.category ?? "general",
        uploadedAt: row.uploadedAt,
        uploadedByName: uploader?.name ?? uploader?.email ?? "Unknown",
      });
    }
    return result;
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    category: v.optional(TEMPLATE_CATEGORY),
  },
  handler: async (ctx, args) => {
    await requireManageTemplates(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    const fileName = args.fileName.trim() || "document";
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Invalid file");

    const inserted = await ctx.db.insert("changeDocumentTemplates", {
      title,
      fileName,
      storageId: args.storageId,
      category: args.category ?? "general",
      uploadedByUserId: userId,
      uploadedAt: Date.now(),
    });
    await recordAuditLog(ctx, {
      action: "changeDocumentTemplates.add",
      resourceType: "changeDocumentTemplates",
      resourceId: inserted,
      summary: title,
    });
    return inserted;
  },
});

export const remove = mutation({
  args: { templateId: v.id("changeDocumentTemplates") },
  handler: async (ctx, args) => {
    await requireManageTemplates(ctx);
    const row = await ctx.db.get(args.templateId);
    if (!row) throw new Error("Template not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(args.templateId);
    await recordAuditLog(ctx, {
      action: "changeDocumentTemplates.remove",
      resourceType: "changeDocumentTemplates",
      resourceId: args.templateId,
      summary: row.title,
    });
  },
});
