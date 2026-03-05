import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const projectStatusValidator = v.union(
  v.literal("planning"),
  v.literal("active"),
  v.literal("substantial_completion"),
  v.literal("closed")
);

export const listProjects = query({
  args: {
    status: v.optional(projectStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    let q = ctx.db.query("projects").order("desc", "updatedAt");
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }
    const limit = args.limit ?? 100;
    return await q.take(limit);
  },
});

export const getProjectById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db.get(args.projectId);
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const projects = await ctx.db.query("projects").collect();
    const active = projects.filter((p) => p.status === "active");
    const atRisk = projects.filter(
      (p) => p.healthStatus === "red" || p.healthStatus === "amber"
    );
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    const tasks = await ctx.db.query("projectTasks").collect();
    const upcomingCount = tasks.filter(
      (t) =>
        t.dueDate != null &&
        t.dueDate >= now &&
        t.dueDate <= now + oneWeek &&
        t.status !== "done"
    ).length;
    return {
      totalProjects: projects.length,
      activeCount: active.length,
      atRiskCount: atRisk.length,
      upcomingTasksCount: upcomingCount,
    };
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    clientName: v.string(),
    location: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.union(
      v.literal("planning"),
      v.literal("active"),
      v.literal("substantial_completion"),
      v.literal("closed")
    ),
    budget: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const now = Date.now();
    return await ctx.db.insert("projects", {
      name: args.name,
      clientName: args.clientName,
      location: args.location,
      startDate: args.startDate,
      endDate: args.endDate,
      status: args.status,
      budget: args.budget,
      updatedAt: now,
    });
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    clientName: v.optional(v.string()),
    location: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(projectStatusValidator),
    budget: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    pmId: v.optional(v.id("users")),
    coordinatorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { projectId, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) filtered[k] = v;
    }
    if (Object.keys(filtered).length === 0) return projectId;
    await ctx.db.patch(projectId, {
      ...filtered,
      updatedAt: Date.now(),
    } as Record<string, unknown>);
    return projectId;
  },
});

export const updateProjectHealth = mutation({
  args: {
    projectId: v.id("projects"),
    healthStatus: v.union(
      v.literal("green"),
      v.literal("amber"),
      v.literal("red")
    ),
    healthNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    await ctx.db.patch(args.projectId, {
      healthStatus: args.healthStatus,
      healthNotes: args.healthNotes,
      updatedAt: Date.now(),
    });
    return args.projectId;
  },
});
