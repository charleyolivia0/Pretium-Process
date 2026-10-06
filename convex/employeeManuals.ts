import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { recordAuditLog } from "./auditLog";

async function requireAdmin(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin") throw new Error("Admin only");
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rows = await ctx.db
      .query("employeeManuals")
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
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    const fileName = args.fileName.trim() || "document";
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Invalid file");

    const inserted = await ctx.db.insert("employeeManuals", {
      title,
      fileName,
      storageId: args.storageId,
      uploadedByUserId: userId,
      uploadedAt: Date.now(),
    });
    await recordAuditLog(ctx, {
      action: "employeeManuals.add",
      resourceType: "employeeManuals",
      resourceId: inserted,
      summary: title,
    });
    return inserted;
  },
});

export const remove = mutation({
  args: { manualId: v.id("employeeManuals") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(args.manualId);
    if (!row) throw new Error("Manual not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(args.manualId);
    await recordAuditLog(ctx, {
      action: "employeeManuals.remove",
      resourceType: "employeeManuals",
      resourceId: args.manualId,
      summary: row.title,
    });
  },
});
