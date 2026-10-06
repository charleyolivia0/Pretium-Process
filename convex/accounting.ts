import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";
import { isVisibleInProjectTracker } from "./lib/projectAccess";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const RECORD_TYPES = ["invoice", "payment", "change_order", "cost_code_entry"] as const;

async function requireAuthUser(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  return { userId, user };
}

async function requireAccountingOrAdmin(ctx: MutationCtx | QueryCtx) {
  const { userId, user } = await requireAuthUser(ctx);
  const role = user.role;
  if (role !== "accounting" && role !== "admin") {
    throw new Error("Only accounting or admin can modify records");
  }
  return userId;
}

/** Same as viewing records: any signed-in user can remove a mistaken budget expense row. */
async function requireCanDeleteAccountingRecord(ctx: MutationCtx | QueryCtx) {
  const { userId } = await requireAuthUser(ctx);
  return userId;
}

export const listAccountingRecordsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("accountingRecords")
      .withIndex("by_project_date", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

/** Budget health from budget vs actual + pending: green / amber / red. */
function budgetHealth(
  budget: number | undefined,
  actualCost: number | undefined,
  pendingOrOverdue: number
): "green" | "amber" | "red" | undefined {
  if (budget == null || budget <= 0) return undefined;
  const actual = (actualCost ?? 0) + pendingOrOverdue;
  const pct = actual / budget;
  if (pct <= 0.85) return "green";
  if (pct <= 1) return "amber";
  return "red";
}

const RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Accounting Dashboard: user's favourited projects with budget health and recent change-order / PO activity. */
export const getAccountingFavouriteDashboard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];
    const favouriteIds = (user.favouriteProjectIds ?? []) as string[];

    /** Admins see every job in Project Tracker (same scope as listProjects for admin). */
    let projectIdsToShow: string[];
    if (user.role === "admin") {
      const list = await ctx.db.query("projects").withIndex("by_updated").order("desc").take(100);
      projectIdsToShow = list
        .filter((p) => isVisibleInProjectTracker(p))
        .map((p) => p._id as string);
    } else {
      if (favouriteIds.length === 0) return [];
      projectIdsToShow = favouriteIds;
    }

    const recentCutoff = Date.now() - RECENT_WINDOW_MS;

    const allRecords = await ctx.db.query("accountingRecords").collect();
    const byProject = new Map<string, typeof allRecords>();
    for (const r of allRecords) {
      const id = r.projectId as string;
      if (!byProject.has(id)) byProject.set(id, []);
      byProject.get(id)!.push(r);
    }

    type Row = {
      project: Doc<"projects">;
      isFavourite: boolean;
      budgetHealth: ReturnType<typeof budgetHealth>;
      overdueAmount: number;
      pendingAmount: number;
      changeOrderCountRecent: number;
      changeOrderLatestRecent: number | undefined;
      poUpdateCountRecent: number;
      poUpdateLatestRecent: number | undefined;
    };

    const result: Row[] = [];

    const seen = new Set<string>();
    for (const fid of projectIdsToShow) {
      if (seen.has(fid)) continue;
      seen.add(fid);
      const project = await ctx.db.get(fid as Id<"projects">);
      if (!project) continue;
      if (!isVisibleInProjectTracker(project)) continue;

      const projectId = project._id as string;
      const records = byProject.get(projectId) ?? [];
      const overdueAmount = records
        .filter((r) => r.status === "overdue")
        .reduce((s, r) => s + r.amount, 0);
      const pendingAmount = records
        .filter((r) => r.status === "pending")
        .reduce((s, r) => s + r.amount, 0);

      const projectDocs = await ctx.db
        .query("documents")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const coDocsRecent = projectDocs.filter((d) => {
        if (d.type.toUpperCase() !== "CO") return false;
        const docDate = d.createdDate ?? d.uploadedAt ?? 0;
        return docDate >= recentCutoff;
      });
      const poUpdatesRecent = records.filter(
        (r) => r.type === "cost_code_entry" && r.date >= recentCutoff
      );

      const changeOrderLatestRecent =
        coDocsRecent.length > 0
          ? Math.max(...coDocsRecent.map((d) => d.createdDate ?? d.uploadedAt ?? 0))
          : undefined;
      const poUpdateLatestRecent =
        poUpdatesRecent.length > 0
          ? Math.max(...poUpdatesRecent.map((r) => r.date))
          : undefined;

      result.push({
        project,
        isFavourite: favouriteIds.includes(projectId),
        budgetHealth: budgetHealth(
          project.budget,
          project.actualCost,
          pendingAmount + overdueAmount
        ),
        overdueAmount,
        pendingAmount,
        changeOrderCountRecent: coDocsRecent.length,
        changeOrderLatestRecent,
        poUpdateCountRecent: poUpdatesRecent.length,
        poUpdateLatestRecent,
      });
    }

    result.sort((a, b) =>
      a.project.name.localeCompare(b.project.name, undefined, { sensitivity: "base" })
    );

    return result;
  },
});

export const createAccountingRecord = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(
      v.literal("invoice"),
      v.literal("payment"),
      v.literal("change_order"),
      v.literal("cost_code_entry")
    ),
    amount: v.number(),
    status: v.string(),
    date: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAccountingOrAdmin(ctx);
    if (args.amount < 0) throw new Error("Amount must be non-negative");
    return await ctx.db.insert("accountingRecords", {
      projectId: args.projectId,
      type: args.type,
      amount: args.amount,
      status: args.status,
      date: args.date,
      notes: args.notes,
      createdByUserId: userId,
    });
  },
});

export const updateAccountingRecord = mutation({
  args: {
    recordId: v.id("accountingRecords"),
    type: v.optional(v.union(
      v.literal("invoice"),
      v.literal("payment"),
      v.literal("change_order"),
      v.literal("cost_code_entry")
    )),
    amount: v.optional(v.number()),
    status: v.optional(v.string()),
    date: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccountingOrAdmin(ctx);
    const { recordId, ...updates } = args;
    if (updates.amount != null && updates.amount < 0) throw new Error("Amount must be non-negative");
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    if (Object.keys(filtered).length === 0) return recordId;
    await ctx.db.patch(recordId, filtered as Record<string, unknown>);
    await recordAuditLog(ctx, {
      action: "accounting.updateAccountingRecord",
      resourceType: "accountingRecords",
      resourceId: recordId,
    });
    return recordId;
  },
});

export const deleteAccountingRecord = mutation({
  args: { recordId: v.id("accountingRecords") },
  handler: async (ctx, args) => {
    await requireCanDeleteAccountingRecord(ctx);
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Accounting record not found");
    await ctx.db.delete(args.recordId);
    await recordAuditLog(ctx, {
      action: "accounting.deleteAccountingRecord",
      resourceType: "accountingRecords",
      resourceId: args.recordId,
      summary: `${record.type} $${record.amount}`,
    });
    return args.recordId;
  },
});
