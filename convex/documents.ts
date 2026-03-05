import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const listDocumentsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("documents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc", "uploadedAt")
      .collect();
  },
});

export const createDocumentRecord = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.string(),
    name: v.string(),
    fileUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    return await ctx.db.insert("documents", {
      projectId: args.projectId,
      uploadedByUserId: userId,
      type: args.type,
      name: args.name,
      fileUrl: args.fileUrl,
      uploadedAt: now,
    });
  },
});

export const deleteDocumentRecord = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    await ctx.db.delete(args.documentId);
    return args.documentId;
  },
});
