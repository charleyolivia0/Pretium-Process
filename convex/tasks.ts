import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const taskStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done")
);

const categoryValidator = v.optional(
  v.union(
    v.literal("safety"),
    v.literal("coordination"),
    v.literal("paperwork"),
    v.literal("scheduling")
  )
);

export const listTasksByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc", "updatedAt")
      .collect();
  },
});

export const createTask = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    ownerRole: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    category: categoryValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    return await ctx.db.insert("projectTasks", {
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      ownerRole: args.ownerRole as "project_manager" | "coordinator" | "accounting" | "estimating" | "safety" | "admin" | undefined,
      ownerUserId: userId,
      status: "not_started",
      dueDate: args.dueDate,
      category: args.category,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("projectTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    category: categoryValidator,
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { taskId, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    if (Object.keys(filtered).length === 0) return taskId;
    await ctx.db.patch(taskId, {
      ...filtered,
      updatedAt: Date.now(),
    } as Record<string, unknown>);
    return taskId;
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("projectTasks"),
    status: taskStatusValidator,
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return args.taskId;
  },
});
