import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";

const STATUS_VALUES = [
  "planned",
  "in_progress",
  "needs_attention",
  "needs_review",
  "completed",
] as const;

type SubtradeTodoStatus = (typeof STATUS_VALUES)[number];

function statusValidator() {
  return v.union(
    v.literal("planned"),
    v.literal("in_progress"),
    v.literal("needs_attention"),
    v.literal("needs_review"),
    v.literal("completed"),
  );
}

async function requireAuth(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

export const listBySubtrade = query({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const items = await ctx.db
      .query("subtradeTodos")
      .withIndex("by_project_subtrade", (q) =>
        q.eq("projectId", args.projectId).eq("subtradeId", args.subtradeId),
      )
      .order("asc")
      .collect();
    return items;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    text: v.string(),
    status: statusValidator(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("subtradeTodos")
      .withIndex("by_project_subtrade", (q) =>
        q.eq("projectId", args.projectId).eq("subtradeId", args.subtradeId),
      )
      .order("desc")
      .first();
    const nextOrder = existing ? existing.order + 1 : 0;
    const now = Date.now();
    const id = await ctx.db.insert("subtradeTodos", {
      projectId: args.projectId,
      subtradeId: args.subtradeId,
      text: args.text.trim(),
      status: args.status as SubtradeTodoStatus,
      createdAt: now,
      order: nextOrder,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("subtradeTodos"),
    text: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(statusValidator()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("To-do item not found.");
    const patch: Partial<{
      text: string;
      description: string | undefined;
      status: SubtradeTodoStatus;
    }> = {};
    if (args.text !== undefined) patch.text = args.text.trim();
    if (args.description !== undefined) {
      const desc = args.description.trim();
      patch.description = desc === "" ? undefined : desc;
    }
    if (args.status !== undefined) patch.status = args.status as SubtradeTodoStatus;
    if (Object.keys(patch).length === 0) return args.id;
    await ctx.db.patch(args.id, patch);
    await recordAuditLog(ctx, {
      action: "subtradeTodos.update",
      resourceType: "subtradeTodos",
      resourceId: args.id,
      summary: existing.text,
    });
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("subtradeTodos"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const row = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await recordAuditLog(ctx, {
      action: "subtradeTodos.remove",
      resourceType: "subtradeTodos",
      resourceId: args.id,
      summary: row?.text,
    });
    return args.id;
  },
});

