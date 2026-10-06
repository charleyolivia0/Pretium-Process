import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";
import {
  assertProjectAccess,
  filterProjectsForUser,
  isVisibleInProjectTracker,
  requireAuthenticatedProject,
  userCanAccessProject,
} from "./lib/projectAccess";

const projectStatusValidator = v.union(
  v.literal("planning"),
  v.literal("active"),
  v.literal("substantial_completion"),
  v.literal("closed")
);

const jobHandoffChecklistValidator = v.object({
  codesReviewedAt: v.optional(v.number()),
  insuranceReviewedAt: v.optional(v.number()),
  kickoffCompleteAt: v.optional(v.number()),
  kickoffHeldAt: v.optional(v.number()),
  assignmentsReviewedAt: v.optional(v.number()),
});

export const listProjects = query({
  args: {
    status: v.optional(projectStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);

    let q = ctx.db.query("projects").withIndex("by_updated").order("desc");
    if (user?.role === "project_manager") {
      q = q.filter((q) => q.eq(q.field("pmId"), userId));
    }
    if (args.status) {
      q = q.filter((q) => q.eq(q.field("status"), args.status));
    }
    const limit = args.limit ?? 100;
    const fetchLimit = user?.role === "site_superintendent" ? 500 : limit;
    let list = await q.take(fetchLimit);
    if (user?.role === "site_superintendent") {
      list = filterProjectsForUser(list, userId, user).slice(0, limit);
    }
    const inTracker = list.filter((p) => isVisibleInProjectTracker(p));
    return inTracker.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  },
});

/** Projects in startup (not yet in Project Tracker). */
export const listStartupQueueProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);

    let q = ctx.db.query("projects").withIndex("by_updated").order("desc");
    if (user?.role === "project_manager") {
      q = q.filter((q) => q.eq(q.field("pmId"), userId));
    }
    const limit = 100;
    let list = await q.take(user?.role === "site_superintendent" ? 500 : limit);
    if (user?.role === "site_superintendent") {
      list = filterProjectsForUser(list, userId, user).slice(0, limit);
    }
    const queue = list.filter((p) => p.inProjectTracker === false && p.inCloseOut !== true);
    return queue.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  },
});

/** Jobs explicitly moved to Close Out (same PM visibility as listProjects). */
export const listCloseOutProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);

    let q = ctx.db.query("projects").withIndex("by_updated").order("desc");
    if (user?.role === "project_manager") {
      q = q.filter((q) => q.eq(q.field("pmId"), userId));
    }
    const limit = 100;
    let list = await q.take(user?.role === "site_superintendent" ? 500 : limit);
    if (user?.role === "site_superintendent") {
      list = filterProjectsForUser(list, userId, user).slice(0, limit);
    }
    const closeOut = list.filter((p) => p.inCloseOut === true);
    return closeOut.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  },
});

/** Public: project id and name only. Used by the public inventory form (no auth). */
export const listProjectNamesForForm = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").withIndex("by_updated").order("desc").take(100);
    return projects
      .filter((p) => isVisibleInProjectTracker(p))
      .map((p) => ({ _id: p._id, name: p.name }));
  },
});

/** Public: project id + name only. Used by public safety job sign-in/out forms. */
export const getProjectByIdForAttendance = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    return { _id: project._id, name: project.name };
  },
});

export const getProjectById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const [user, project] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.get(args.projectId),
    ]);

    if (!project) return null;
    if (!userCanAccessProject(project, userId, user)) return null;

    return project;
  },
});

/** Priority order: red (0), amber (1), green (2), none (3). */
function healthPriority(health: string | undefined): number {
  if (health === "red") return 0;
  if (health === "amber") return 1;
  if (health === "green") return 2;
  return 3;
}

/** Pick one "current" task for a project: in_progress first, then blocked, then not_started (by due date), then done. */
function pickCurrentTask(tasks: { status: string; dueDate?: number; updatedAt: number; title: string; _id: unknown }[]) {
  if (tasks.length === 0) return null;
  const order = (a: (typeof tasks)[0], b: (typeof tasks)[0]) => {
    const statusOrder = { in_progress: 0, blocked: 1, not_started: 2, done: 3 };
    const sa = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
    const sb = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
    if (sa !== sb) return sa - sb;
    if (a.status === "not_started" && b.status === "not_started") {
      const da = a.dueDate ?? Infinity;
      const db = b.dueDate ?? Infinity;
      return da - db;
    }
    return b.updatedAt - a.updatedAt;
  };
  const sorted = [...tasks].sort(order);
  return { _id: sorted[0]._id, title: sorted[0].title, status: sorted[0].status, dueDate: sorted[0].dueDate };
}

/** Dashboard view for PM/Coordinator: projects with current task and favourite flag, sorted high priority to low, favourites first. */
export const getDashboardProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const favouriteIds = new Set((user?.favouriteProjectIds ?? []) as string[]);
    let projectsQuery = ctx.db.query("projects").withIndex("by_updated").order("desc");
    // Project managers only see projects where they are the assigned PM.
    if (user?.role === "project_manager") {
      projectsQuery = projectsQuery.filter((q) => q.eq(q.field("pmId"), userId));
    }
    let projects = await projectsQuery.collect();
    if (user?.role === "site_superintendent") {
      projects = filterProjectsForUser(projects, userId, user);
    }
    projects = projects.filter((p) => isVisibleInProjectTracker(p));
    const allTasks = await ctx.db.query("projectTasks").collect();
    const tasksByProject = new Map<string, typeof allTasks>();
    for (const t of allTasks) {
      const id = t.projectId as string;
      if (!tasksByProject.has(id)) tasksByProject.set(id, []);
      tasksByProject.get(id)!.push(t);
    }
    const rows = await Promise.all(
      projects.map(async (project) => {
        const projectId = project._id as string;
        const tasks = tasksByProject.get(projectId) ?? [];
        const currentTask = pickCurrentTask(tasks);
        const isFavourite = favouriteIds.has(projectId);
        const pmUser = project.pmId ? await ctx.db.get(project.pmId) : null;
        const coordinatorUser = project.coordinatorId ? await ctx.db.get(project.coordinatorId) : null;
        const principalUser = project.principalId ? await ctx.db.get(project.principalId) : null;
        const pmName = pmUser?.name ?? pmUser?.email ?? null;
        const coordinatorName = coordinatorUser?.name ?? coordinatorUser?.email ?? null;
        const principalName = principalUser?.name ?? principalUser?.email ?? null;
        return { project, currentTask, isFavourite, pmName, coordinatorName, principalName };
      })
    );
    // For project managers and coordinators, only show favourited projects on the dashboard.
    const filteredRows =
      user?.role === "project_manager" || user?.role === "coordinator"
        ? rows.filter((r) => r.isFavourite)
        : rows;

    filteredRows.sort((a, b) => {
      if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
      const pa = healthPriority(a.project.healthStatus);
      const pb = healthPriority(b.project.healthStatus);
      if (pa !== pb) return pa - pb;
      if (a.project.updatedAt !== b.project.updatedAt) return b.project.updatedAt - a.project.updatedAt;
      return a.project.name.localeCompare(b.project.name, undefined, { sensitivity: "base" });
    });
    return filteredRows;
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        totalProjects: 0,
        activeCount: 0,
        atRiskCount: 0,
        upcomingTasksCount: 0,
      };
    }
    const user = await ctx.db.get(userId);
    let projects = (await ctx.db.query("projects").collect()).filter((p) => isVisibleInProjectTracker(p));
    projects = filterProjectsForUser(projects, userId, user);
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
    closingDay: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.union(
      v.literal("planning"),
      v.literal("active"),
      v.literal("substantial_completion"),
      v.literal("closed")
    ),
    budget: v.optional(v.number()),
    /** Optional direct URLs (kept for backwards compatibility). */
    pmId: v.optional(v.id("users")),
    coordinatorId: v.optional(v.id("users")),
    principalId: v.optional(v.id("users")),
    siteSuperId: v.optional(v.id("users")),
    accountsPayableId: v.optional(v.id("users")),
    safetyMemberId: v.optional(v.id("users")),
    siteSupers: v.optional(v.array(v.string())),
    budgetDocumentUrl: v.optional(v.string()),
    safetyDocumentUrl: v.optional(v.string()),
    projectSheetUrl: v.optional(v.string()),
    summaryLinkUrl: v.optional(v.string()),
    summaryLinkLabel: v.optional(v.string()),
    cashFlowNotes: v.optional(v.string()),
    forecastingNotes: v.optional(v.string()),
    insuranceAndBondsNotes: v.optional(v.string()),
    purchaseOrdersNotes: v.optional(v.string()),
    progressClaimsNotes: v.optional(v.string()),
    quotesNotes: v.optional(v.string()),
    /** When provided, we resolve to URLs and store in the project row. */
    budgetDocumentStorageId: v.optional(v.id("_storage")),
    safetyDocumentStorageId: v.optional(v.id("_storage")),
    projectSheetStorageId: v.optional(v.id("_storage")),
    inProjectTracker: v.optional(v.boolean()),
    startupSummaryComplete: v.optional(v.boolean()),
    accountingJobCode: v.optional(v.string()),
    jobHandoffChecklist: v.optional(jobHandoffChecklistValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    let budgetDocumentUrl = args.budgetDocumentUrl;
    let safetyDocumentUrl = args.safetyDocumentUrl;
    let projectSheetUrl = args.projectSheetUrl;
    if (args.budgetDocumentStorageId) {
      const url = await ctx.storage.getUrl(args.budgetDocumentStorageId);
      if (!url) {
        throw new Error("Budget document file not found");
      }
      budgetDocumentUrl = url;
    }
    if (args.safetyDocumentStorageId) {
      const url = await ctx.storage.getUrl(args.safetyDocumentStorageId);
      if (!url) {
        throw new Error("Safety document file not found");
      }
      safetyDocumentUrl = url;
    }
    if (args.projectSheetStorageId) {
      const url = await ctx.storage.getUrl(args.projectSheetStorageId);
      if (!url) {
        throw new Error("Project sheet file not found");
      }
      projectSheetUrl = url;
    }
    const inserted = await ctx.db.insert("projects", {
      name: args.name,
      clientName: args.clientName,
      location: args.location,
      startDate: args.startDate,
      closingDay: args.closingDay,
      endDate: args.endDate,
      status: args.status,
      budget: args.budget,
      pmId: args.pmId,
      coordinatorId: args.coordinatorId,
      principalId: args.principalId,
      siteSuperId: args.siteSuperId,
      accountsPayableId: args.accountsPayableId,
      safetyMemberId: args.safetyMemberId,
      siteSupers: args.siteSupers,
      budgetDocumentUrl,
      safetyDocumentUrl,
      projectSheetUrl,
      summaryLinkUrl: args.summaryLinkUrl,
      summaryLinkLabel: args.summaryLinkLabel,
      cashFlowNotes: args.cashFlowNotes,
      forecastingNotes: args.forecastingNotes,
      insuranceAndBondsNotes: args.insuranceAndBondsNotes,
      purchaseOrdersNotes: args.purchaseOrdersNotes,
      progressClaimsNotes: args.progressClaimsNotes,
      quotesNotes: args.quotesNotes,
      inProjectTracker: args.inProjectTracker ?? true,
      startupSummaryComplete: args.startupSummaryComplete ?? true,
      accountingJobCode: args.accountingJobCode,
      jobHandoffChecklist: args.jobHandoffChecklist,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "projects.createProject",
      resourceType: "projects",
      resourceId: inserted,
      summary: args.name,
    });
    return inserted;
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    clientName: v.optional(v.string()),
    location: v.optional(v.string()),
    startDate: v.optional(v.number()),
    closingDay: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.optional(projectStatusValidator),
    budget: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    budgetVariance: v.optional(v.number()),
    profitStatus: v.optional(v.string()),
    /** Team + misc fields */
    pmId: v.optional(v.union(v.id("users"), v.null())),
    coordinatorId: v.optional(v.union(v.id("users"), v.null())),
    principalId: v.optional(v.union(v.id("users"), v.null())),
    siteSuperId: v.optional(v.union(v.id("users"), v.null())),
    accountsPayableId: v.optional(v.union(v.id("users"), v.null())),
    safetyMemberId: v.optional(v.union(v.id("users"), v.null())),
    siteSupers: v.optional(v.array(v.string())),
    siteContactSuperName: v.optional(v.string()),
    siteContactSuperPhone: v.optional(v.string()),
    siteContactSuperEmail: v.optional(v.string()),
    siteEmergencyPlanNotes: v.optional(v.string()),
    budgetDocumentUrl: v.optional(v.string()),
    safetyDocumentUrl: v.optional(v.string()),
    safetyLastInspectionAt: v.optional(v.union(v.number(), v.null())),
    safetyNextInspectionAt: v.optional(v.union(v.number(), v.null())),
    projectSheetUrl: v.optional(v.string()),
    summaryLinkUrl: v.optional(v.union(v.string(), v.null())),
    summaryLinkLabel: v.optional(v.union(v.string(), v.null())),
    cashFlowNotes: v.optional(v.string()),
    forecastingNotes: v.optional(v.string()),
    insuranceAndBondsNotes: v.optional(v.string()),
    purchaseOrdersNotes: v.optional(v.string()),
    progressClaimsNotes: v.optional(v.string()),
    quotesNotes: v.optional(v.string()),
    subtradeList: v.optional(v.array(v.string())),
    /** Allow updating health from the summary editor as well. */
    healthStatus: v.optional(
      v.union(v.literal("green"), v.literal("amber"), v.literal("red"))
    ),
    healthNotes: v.optional(v.string()),
    /** When provided, resolve storage IDs to URLs and update project row. */
    budgetDocumentStorageId: v.optional(v.id("_storage")),
    safetyDocumentStorageId: v.optional(v.id("_storage")),
    projectSheetStorageId: v.optional(v.id("_storage")),
    inProjectTracker: v.optional(v.union(v.boolean(), v.null())),
    startupSummaryComplete: v.optional(v.union(v.boolean(), v.null())),
    inCloseOut: v.optional(v.union(v.boolean(), v.null())),
    accountingJobCode: v.optional(v.union(v.string(), v.null())),
    jobHandoffChecklist: v.optional(v.union(jobHandoffChecklistValidator, v.null())),
  },
  handler: async (ctx, args) => {
    const {
      projectId,
      budgetDocumentStorageId,
      safetyDocumentStorageId,
      projectSheetStorageId,
      ...updates
    } = args;
    await requireAuthenticatedProject(ctx, projectId);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      // Allow null to clear optional id fields
      if (
        (k === "pmId" ||
          k === "coordinatorId" ||
          k === "principalId" ||
          k === "siteSuperId" ||
          k === "accountsPayableId" ||
          k === "safetyMemberId") &&
        v === null
      ) {
        filtered[k] = undefined;
      } else if (
        (k === "inProjectTracker" || k === "startupSummaryComplete" || k === "inCloseOut") &&
        v === null
      ) {
        filtered[k] = undefined;
      } else if (k === "accountingJobCode" && v === null) {
        filtered[k] = undefined;
      } else if ((k === "summaryLinkUrl" || k === "summaryLinkLabel") && v === null) {
        filtered[k] = undefined;
      } else if (k === "jobHandoffChecklist" && v === null) {
        filtered[k] = undefined;
      } else if (
        (k === "safetyLastInspectionAt" || k === "safetyNextInspectionAt") &&
        v === null
      ) {
        filtered[k] = undefined;
      } else {
        filtered[k] = v;
      }
    }
    if (budgetDocumentStorageId) {
      const url = await ctx.storage.getUrl(budgetDocumentStorageId);
      if (!url) {
        throw new Error("Budget document file not found");
      }
      filtered.budgetDocumentUrl = url;
    }
    if (safetyDocumentStorageId) {
      const url = await ctx.storage.getUrl(safetyDocumentStorageId);
      if (!url) {
        throw new Error("Safety document file not found");
      }
      filtered.safetyDocumentUrl = url;
    }
    if (projectSheetStorageId) {
      const url = await ctx.storage.getUrl(projectSheetStorageId);
      if (!url) {
        throw new Error("Project sheet file not found");
      }
      filtered.projectSheetUrl = url;
    }
    if (Object.keys(filtered).length === 0) return projectId;
    await ctx.db.patch(projectId, {
      ...filtered,
      updatedAt: Date.now(),
    } as Record<string, unknown>);
    const proj = await ctx.db.get(projectId);
    await recordAuditLog(ctx, {
      action: "projects.updateProject",
      resourceType: "projects",
      resourceId: projectId,
      summary: proj?.name,
    });
    return projectId;
  },
});

export const setProjectSheet = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { project } = await requireAuthenticatedProject(ctx, args.projectId);
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Project sheet file not found");
    }
    await ctx.db.patch(args.projectId, {
      projectSheetUrl: url,
      updatedAt: Date.now(),
    });
    await recordAuditLog(ctx, {
      action: "projects.setProjectSheet",
      resourceType: "projects",
      resourceId: args.projectId,
      summary: project.name,
    });
    return { projectSheetUrl: url };
  },
});

export const promoteProjectToTracker = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    assertProjectAccess(project, userId, user);
    await ctx.db.patch(args.projectId, {
      inProjectTracker: true,
      updatedAt: Date.now(),
    });
    return args.projectId;
  },
});

export const promoteProjectToCloseOut = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    assertProjectAccess(project, userId, user);
    await ctx.db.patch(args.projectId, {
      inCloseOut: true,
      inProjectTracker: false,
      updatedAt: Date.now(),
    });
    const proj = await ctx.db.get(args.projectId);
    await recordAuditLog(ctx, {
      action: "projects.promoteProjectToCloseOut",
      resourceType: "projects",
      resourceId: args.projectId,
      summary: proj?.name,
    });
    return args.projectId;
  },
});

export const returnProjectToTracker = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    assertProjectAccess(project, userId, user);
    await ctx.db.patch(args.projectId, {
      inProjectTracker: true,
      inCloseOut: undefined,
      updatedAt: Date.now(),
    });
    const proj = await ctx.db.get(args.projectId);
    await recordAuditLog(ctx, {
      action: "projects.returnProjectToTracker",
      resourceType: "projects",
      resourceId: args.projectId,
      summary: proj?.name,
    });
    return args.projectId;
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
    await requireAuthenticatedProject(ctx, args.projectId);
    await ctx.db.patch(args.projectId, {
      healthStatus: args.healthStatus,
      healthNotes: args.healthNotes,
      updatedAt: Date.now(),
    });
    const proj = await ctx.db.get(args.projectId);
    await recordAuditLog(ctx, {
      action: "projects.updateProjectHealth",
      resourceType: "projects",
      resourceId: args.projectId,
      summary: proj?.name,
    });
    return args.projectId;
  },
});

export const deleteProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { projectId } = args;
    const projectRow = await ctx.db.get(projectId);

    // Delete related project tasks
    const tasks = await ctx.db
      .query("projectTasks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const task of tasks) {
      await ctx.db.delete(task._id);
    }

    // Delete related documents
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }

    // Delete document folders
    const documentFolders = await ctx.db
      .query("documentFolders")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const folder of documentFolders) {
      await ctx.db.delete(folder._id);
    }

    // Delete project drawings
    const drawings = await ctx.db
      .query("drawings")
      .withIndex("by_project_uploadedAt", (q) => q.eq("projectId", projectId))
      .collect();
    for (const drawing of drawings) {
      await ctx.db.delete(drawing._id);
    }

    // Delete project drawing folders
    const drawingFolders = await ctx.db
      .query("drawingFolders")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const folder of drawingFolders) {
      await ctx.db.delete(folder._id);
    }

    // Delete safety employee documents
    const safetyDocs = await ctx.db
      .query("safetyEmployeeDocuments")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const d of safetyDocs) {
      await ctx.db.delete(d._id);
    }

    // Delete incident reports
    const incidentReports = await ctx.db
      .query("incidentReports")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const r of incidentReports) {
      await ctx.db.delete(r._id);
    }

    // Delete equipment inventory rows
    const equipment = await ctx.db
      .query("equipmentInventory")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const e of equipment) {
      await ctx.db.delete(e._id);
    }

    // Delete project subtrades
    const subtrades = await ctx.db
      .query("projectSubtrades")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const s of subtrades) {
      await ctx.db.delete(s._id);
    }

    // Delete project calendar events
    const calendarEvents = await ctx.db
      .query("projectCalendarEvents")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const ev of calendarEvents) {
      await ctx.db.delete(ev._id);
    }

    // Delete accounting records
    const accountingRecords = await ctx.db
      .query("accountingRecords")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const record of accountingRecords) {
      await ctx.db.delete(record._id);
    }

    // Delete reminder notifications for this project
    const reminders = await ctx.db
      .query("documentReminderNotifications")
      .filter((q) => q.eq(q.field("projectId"), projectId))
      .collect();
    for (const reminder of reminders) {
      await ctx.db.delete(reminder._id);
    }

    const projectDocuments = await ctx.db
      .query("documents")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const document of projectDocuments) {
      const personalReminders = await ctx.db
        .query("documentPersonalReminders")
        .withIndex("by_document", (q) => q.eq("documentId", document._id))
        .collect();
      for (const personalReminder of personalReminders) {
        await ctx.db.delete(personalReminder._id);
      }
    }

    // Delete to-do items linked to this project
    const todoItems = await ctx.db
      .query("pmTodoList")
      .filter((q) => q.eq(q.field("projectId"), projectId))
      .collect();
    for (const item of todoItems) {
      await ctx.db.delete(item._id);
    }

    // Finally delete the project itself
    await ctx.db.delete(projectId);
    await recordAuditLog(ctx, {
      action: "projects.deleteProject",
      resourceType: "projects",
      resourceId: projectId,
      summary: projectRow?.name,
    });
    return projectId;
  },
});
