import { query, mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { recordAuditLog } from "./auditLog";
import { endOfTodayCentral, startOfTodayCentral } from "./lib/centralTime";
import { requireAuthenticatedProject } from "./lib/projectAccess";

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

const dependsOnValidator = v.optional(v.array(v.id("projectTasks")));
const subtradeIdsOnSiteValidator = v.optional(v.array(v.id("projectSubtrades")));
const storageIdsValidator = v.optional(v.array(v.id("_storage")));
const nullableNumberValidator = v.optional(v.union(v.number(), v.null()));
const nullableStringValidator = v.optional(v.union(v.string(), v.null()));

async function resolveStorageUrls(
  ctx: MutationCtx | QueryCtx,
  storageIds: Id<"_storage">[] | undefined
) {
  if (!storageIds || storageIds.length === 0) return undefined;
  const urls = await Promise.all(storageIds.map((id) => ctx.storage.getUrl(id)));
  const valid = urls.filter((url): url is string => !!url);
  return valid.length ? valid : undefined;
}

function assertValidTaskScheduleDates(args: {
  startDate?: number | null;
  dueDate?: number | null;
  baselineStartDate?: number | null;
  baselineEndDate?: number | null;
  actualStartDate?: number | null;
  actualEndDate?: number | null;
  progressPercent?: number | null;
}) {
  const {
    startDate,
    dueDate,
    baselineStartDate,
    baselineEndDate,
    actualStartDate,
    actualEndDate,
    progressPercent,
  } = args;

  if (startDate != null && dueDate != null && dueDate < startDate) {
    throw new Error("Due date must be on or after start date");
  }
  if (baselineStartDate != null && baselineEndDate != null && baselineEndDate < baselineStartDate) {
    throw new Error("Baseline end date must be on or after baseline start date");
  }
  if (actualStartDate != null && actualEndDate != null && actualEndDate < actualStartDate) {
    throw new Error("Actual end date must be on or after actual start date");
  }
  if (progressPercent != null && (progressPercent < 0 || progressPercent > 100)) {
    throw new Error("Progress percent must be between 0 and 100");
  }
}

export const listTasksByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return tasks.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },
});

export const getTradeTaskProgressByProject = query({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const startOfToday = startOfTodayCentral();
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    let done = 0;
    let delayed = 0;
    let planning = 0;
    let ongoing = 0;

    for (const task of tasks) {
      if (!task.subtradeIdsOnSite?.includes(args.subtradeId)) continue;
      const isOverdue =
        task.status !== "done" &&
        task.dueDate != null &&
        task.dueDate < startOfToday;
      if (isOverdue) {
        delayed += 1;
      } else if (task.status === "done") {
        done += 1;
      } else if (task.status === "not_started") {
        planning += 1;
      } else {
        ongoing += 1;
      }
    }

    return { done, delayed, planning, ongoing };
  },
});

/** Upcoming dashboard tasks across all projects (used by principal dashboard). */
export const listUpcomingDashboardTasks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const now = Date.now();
    const startOfToday = startOfTodayCentral(now);
    const limit = Math.max(1, Math.min(args.limit ?? 30, 200));

    const tasks = await ctx.db.query("projectTasks").collect();
    const upcoming = tasks
      .filter((task) => task.status !== "done")
      .filter((task) => task.dueDate != null && task.dueDate >= startOfToday)
      .sort((a, b) => {
        const dueDelta = (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER);
        if (dueDelta !== 0) return dueDelta;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      })
      .slice(0, limit);

    const projectCache = new Map<string, { _id: Id<"projects">; name: string }>();
    const subtradeCache = new Map<string, string>();

    const rows = await Promise.all(
      upcoming.map(async (task) => {
        let project = projectCache.get(task.projectId);
        if (!project) {
          const p = await ctx.db.get(task.projectId);
          if (!p) return null;
          project = { _id: p._id, name: p.name };
          projectCache.set(task.projectId, project);
        }

        let trade = task.material?.trim() || undefined;
        const firstSubtradeId = task.subtradeIdsOnSite?.[0];
        if (!trade && firstSubtradeId) {
          const cachedTrade = subtradeCache.get(firstSubtradeId);
          if (cachedTrade !== undefined) {
            trade = cachedTrade || undefined;
          } else {
            const subtrade = await ctx.db.get(firstSubtradeId);
            const subtradeName = subtrade?.name?.trim() || "";
            subtradeCache.set(firstSubtradeId, subtradeName);
            trade = subtradeName || undefined;
          }
        }

        return {
          taskId: task._id,
          projectId: project._id,
          projectName: project.name,
          title: task.title,
          description: task.description ?? "",
          trade: trade ?? "-",
          taskCost: task.taskCost,
          dueDate: task.dueDate,
          priority: task.priority ?? "",
        };
      })
    );

    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

/** Today's open tasks for a specific set of dashboard projects. */
export const listTodayTasksForProjects = query({
  args: {
    projectIds: v.array(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    if (args.projectIds.length === 0) return [];

    const startOfToday = startOfTodayCentral();
    const endOfToday = endOfTodayCentral();
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const projectIds = new Set(args.projectIds as Id<"projects">[]);

    const tasks = await ctx.db.query("projectTasks").collect();
    const todayTasks = tasks
      .filter((task) => projectIds.has(task.projectId as Id<"projects">))
      .filter((task) => task.status !== "done")
      .filter((task) => task.dueDate != null && task.dueDate >= startOfToday && task.dueDate < endOfToday)
      .sort((a, b) => {
        const dueDelta = (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER);
        if (dueDelta !== 0) return dueDelta;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      })
      .slice(0, limit);

    const projectCache = new Map<Id<"projects">, { _id: Id<"projects">; name: string }>();
    const rows = await Promise.all(
      todayTasks.map(async (task) => {
        let project = projectCache.get(task.projectId as Id<"projects">);
        if (!project) {
          const p = await ctx.db.get(task.projectId);
          if (!p) return null;
          project = { _id: p._id, name: p.name };
          projectCache.set(task.projectId as Id<"projects">, project);
        }
        return {
          taskId: task._id,
          projectId: project._id,
          projectName: project.name,
          title: task.title,
          dueDate: task.dueDate,
          status: task.status,
        };
      })
    );

    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

/** Daily reports filed under a document folder (excludes root/unfiled reports). */
export const listDailyReportsInFolder = query({
  args: {
    projectId: v.id("projects"),
    folderId: v.id("documentFolders"),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.projectId !== args.projectId) return [];

    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const inFolder = tasks.filter((t) => t.dailyReportFolderId === args.folderId);
    inFolder.sort((a, b) => (b.dueDate ?? 0) - (a.dueDate ?? 0));
    return inFolder;
  },
});

export const createTask = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    ownerRole: v.optional(v.string()),
    startDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    baselineStartDate: v.optional(v.number()),
    baselineEndDate: v.optional(v.number()),
    actualStartDate: v.optional(v.number()),
    actualEndDate: v.optional(v.number()),
    progressPercent: v.optional(v.number()),
    weatherSummary: v.optional(v.string()),
    photoUrls: v.optional(v.array(v.string())),
    documentUrls: v.optional(v.array(v.string())),
    photoStorageIds: storageIdsValidator,
    documentStorageIds: storageIdsValidator,
    category: categoryValidator,
    dependsOn: dependsOnValidator,
    subtradeIdsOnSite: subtradeIdsOnSiteValidator,
    dailyReportFolderId: v.optional(v.id("documentFolders")),
    priority: v.optional(v.string()),
    material: v.optional(v.string()),
    taskCost: v.optional(v.number()),
    scheduleComment: v.optional(v.string()),
    isDailyReport: v.optional(v.boolean()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await requireAuthenticatedProject(ctx, args.projectId);
    if (args.clientMutationId?.trim()) {
      const existing = await ctx.db
        .query("projectTasks")
        .withIndex("by_clientMutationId", (q) => q.eq("clientMutationId", args.clientMutationId!.trim()))
        .first();
      if (existing) return existing._id;
    }
    assertValidTaskScheduleDates(args);
    const now = Date.now();
    const [photoUrls, documentUrls] = await Promise.all([
      resolveStorageUrls(ctx, args.photoStorageIds),
      resolveStorageUrls(ctx, args.documentStorageIds),
    ]);
    const tid = await ctx.db.insert("projectTasks", {
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      weatherSummary: args.weatherSummary,
      photoUrls: photoUrls ?? args.photoUrls,
      documentUrls: documentUrls ?? args.documentUrls,
      ...(args.dailyReportFolderId ? { dailyReportFolderId: args.dailyReportFolderId } : {}),
      ownerRole: args.ownerRole as
        | "project_manager"
        | "coordinator"
        | "accounting"
        | "safety"
        | "admin"
        | "principal"
        | undefined,
      ownerUserId: userId,
      status: "not_started",
      startDate: args.startDate,
      dueDate: args.dueDate,
      baselineStartDate: args.baselineStartDate,
      baselineEndDate: args.baselineEndDate,
      actualStartDate: args.actualStartDate,
      actualEndDate: args.actualEndDate,
      progressPercent: args.progressPercent,
      category: args.category,
      dependsOn: args.dependsOn,
      subtradeIdsOnSite:
        args.subtradeIdsOnSite && args.subtradeIdsOnSite.length > 0
          ? args.subtradeIdsOnSite
          : undefined,
      priority: args.priority?.trim() || undefined,
      material: args.material?.trim() || undefined,
      taskCost: args.taskCost,
      scheduleComment: args.scheduleComment?.trim() || undefined,
      ...(args.isDailyReport !== undefined ? { isDailyReport: args.isDailyReport } : {}),
      clientMutationId: args.clientMutationId?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "tasks.createTask",
      resourceType: "projectTasks",
      resourceId: tid,
      summary: args.title,
    });
    return tid;
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("projectTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.union(v.number(), v.null())),
    dueDate: nullableNumberValidator,
    baselineStartDate: nullableNumberValidator,
    baselineEndDate: nullableNumberValidator,
    actualStartDate: nullableNumberValidator,
    actualEndDate: nullableNumberValidator,
    progressPercent: nullableNumberValidator,
    weatherSummary: v.optional(v.string()),
    photoUrls: v.optional(v.array(v.string())),
    documentUrls: v.optional(v.array(v.string())),
    photoStorageIds: storageIdsValidator,
    documentStorageIds: storageIdsValidator,
    category: categoryValidator,
    dependsOn: dependsOnValidator,
    subtradeIdsOnSite: subtradeIdsOnSiteValidator,
    dailyReportFolderId: v.optional(v.union(v.id("documentFolders"), v.null())),
    priority: nullableStringValidator,
    material: nullableStringValidator,
    taskCost: nullableNumberValidator,
    scheduleComment: nullableStringValidator,
  },
  handler: async (ctx, args) => {
    const { taskId, photoStorageIds, documentStorageIds, subtradeIdsOnSite, dailyReportFolderId, ...updates } = args;
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    await requireAuthenticatedProject(ctx, task.projectId);
    assertValidTaskScheduleDates({
      startDate: updates.startDate,
      dueDate: updates.dueDate,
      baselineStartDate: updates.baselineStartDate,
      baselineEndDate: updates.baselineEndDate,
      actualStartDate: updates.actualStartDate,
      actualEndDate: updates.actualEndDate,
      progressPercent: updates.progressPercent,
    });
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val === undefined) continue;
      if (val === null) {
        filtered[k] = undefined;
        continue;
      }
      filtered[k] = val;
    }
    if (subtradeIdsOnSite !== undefined) {
      filtered.subtradeIdsOnSite =
        subtradeIdsOnSite.length > 0 ? subtradeIdsOnSite : undefined;
    }
    if (dailyReportFolderId !== undefined) {
      filtered.dailyReportFolderId = dailyReportFolderId ?? undefined;
    }
    if (photoStorageIds !== undefined) {
      const uploadedPhotoUrls = await resolveStorageUrls(ctx, photoStorageIds);
      const currentPhotoUrls = Array.isArray(filtered.photoUrls) ? (filtered.photoUrls as string[]) : [];
      const mergedPhotoUrls = [...currentPhotoUrls, ...(uploadedPhotoUrls ?? [])];
      if (mergedPhotoUrls.length) filtered.photoUrls = mergedPhotoUrls;
      else delete filtered.photoUrls;
    }
    if (documentStorageIds !== undefined) {
      const uploadedDocumentUrls = await resolveStorageUrls(ctx, documentStorageIds);
      const currentDocumentUrls = Array.isArray(filtered.documentUrls) ? (filtered.documentUrls as string[]) : [];
      const mergedDocumentUrls = [...currentDocumentUrls, ...(uploadedDocumentUrls ?? [])];
      if (mergedDocumentUrls.length) filtered.documentUrls = mergedDocumentUrls;
      else delete filtered.documentUrls;
    }
    if (Object.keys(filtered).length === 0) return taskId;
    await ctx.db.patch(taskId, {
      ...filtered,
      updatedAt: Date.now(),
    } as Record<string, unknown>);
    const t = await ctx.db.get(taskId);
    await recordAuditLog(ctx, {
      action: "tasks.updateTask",
      resourceType: "projectTasks",
      resourceId: taskId,
      summary: t?.title,
    });
    return taskId;
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("projectTasks"),
    status: taskStatusValidator,
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await requireAuthenticatedProject(ctx, task.projectId);
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    const t = await ctx.db.get(args.taskId);
    await recordAuditLog(ctx, {
      action: "tasks.updateTaskStatus",
      resourceType: "projectTasks",
      resourceId: args.taskId,
      summary: t ? `${t.title} → ${args.status}` : undefined,
    });
    return args.taskId;
  },
});

export const removeTask = mutation({
  args: { taskId: v.id("projectTasks") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.taskId);
    if (!t) throw new Error("Task not found");
    await requireAuthenticatedProject(ctx, t.projectId);
    await ctx.db.delete(args.taskId);
    await recordAuditLog(ctx, {
      action: "tasks.removeTask",
      resourceType: "projectTasks",
      resourceId: args.taskId,
      summary: t?.title,
    });
    return args.taskId;
  },
});
