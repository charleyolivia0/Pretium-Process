import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

async function requireAuth(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/** List the current user's to-do items (for dashboard display and edit page). Includes creator role and project name. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const items = await ctx.db
      .query("pmTodoList")
      .withIndex("by_order")
      .order("asc")
      .filter((q) => q.eq(q.field("createdByUserId"), userId))
      .collect();
    return Promise.all(
      items.map(async (item) => {
        const creator = await ctx.db.get(item.createdByUserId);
        const project = item.projectId ? await ctx.db.get(item.projectId) : null;
        return {
          ...item,
          createdByRole: creator?.role ?? null,
          projectName: project?.name ?? null,
        };
      })
    );
  },
});

/** Add a to-do item. Any authenticated user. */
export const add = mutation({
  args: {
    text: v.string(),
    dueDate: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const existing = await ctx.db.query("pmTodoList").withIndex("by_order").order("desc").first();
    const nextOrder = existing ? existing.order + 1 : 0;
    const id = await ctx.db.insert("pmTodoList", {
      text: args.text.trim(),
      order: nextOrder,
      createdAt: Date.now(),
      createdByUserId: userId,
      dueDate: args.dueDate,
      projectId: args.projectId,
      priority: args.priority ?? "medium",
      completed: false,
    });
    await recordAuditLog(ctx, {
      action: "todoList.add",
      resourceType: "pmTodoList",
      resourceId: id,
      summary: args.text.trim(),
    });
    return id;
  },
});

/** Update a to-do item (text, order, dueDate, projectId, priority, completed). Any authenticated user. */
export const update = mutation({
  args: {
    id: v.id("pmTodoList"),
    text: v.optional(v.string()),
    order: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("To-do item not found.");
    const updates: {
      text?: string;
      order?: number;
      dueDate?: number;
      projectId?: Id<"projects"> | null;
      priority?: "low" | "medium" | "high";
      completed?: boolean;
    } = {};
    if (args.text !== undefined) updates.text = args.text.trim();
    if (args.order !== undefined) updates.order = args.order;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.projectId !== undefined) updates.projectId = args.projectId;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.completed !== undefined) updates.completed = args.completed;
    if (Object.keys(updates).length === 0) return args.id;
    await ctx.db.patch(args.id, updates);
    await recordAuditLog(ctx, {
      action: "todoList.update",
      resourceType: "pmTodoList",
      resourceId: args.id,
      summary: existing.text,
    });
    return args.id;
  },
});

/** Remove a to-do item. Any authenticated user. */
export const remove = mutation({
  args: {
    id: v.id("pmTodoList"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const row = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await recordAuditLog(ctx, {
      action: "todoList.remove",
      resourceType: "pmTodoList",
      resourceId: args.id,
      summary: row?.text,
    });
    return args.id;
  },
});
