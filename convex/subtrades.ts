import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { emitNotificationInternal } from "./notifications";
import { recordAuditLog } from "./auditLog";

function normalizeTradeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function ensureTradePortalAssignment(
  ctx: MutationCtx,
  args: {
    portalAccountId: Id<"tradePortalAccounts">;
    projectId: Id<"projects">;
    subtradeId: Id<"projectSubtrades">;
    createdAt: number;
  },
) {
  const existingAssignment = (
    await ctx.db
      .query("tradePortalAssignments")
      .withIndex("by_portal_account", (q) => q.eq("portalAccountId", args.portalAccountId))
      .collect()
  ).find((row: Doc<"tradePortalAssignments">) => row.projectId === args.projectId && row.subtradeId === args.subtradeId);
  if (existingAssignment) return existingAssignment._id;
  return await ctx.db.insert("tradePortalAssignments", {
    portalAccountId: args.portalAccountId,
    projectId: args.projectId,
    subtradeId: args.subtradeId,
    createdAt: args.createdAt,
  });
}

async function ensurePendingTradePortalAssignment(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    subtradeId: Id<"projectSubtrades">;
    tradeNameExact: string;
    tradeNameNormalized: string;
    source: "job_tracker";
    createdAt: number;
  },
) {
  const existingPending = (
    await ctx.db
      .query("tradePortalPendingAssignments")
      .withIndex("by_project_subtrade", (q) =>
        q.eq("projectId", args.projectId).eq("subtradeId", args.subtradeId),
      )
      .collect()
  ).find((row: Doc<"tradePortalPendingAssignments">) => row.tradeNameNormalized === args.tradeNameNormalized);
  if (existingPending) return existingPending._id;
  return await ctx.db.insert("tradePortalPendingAssignments", args);
}

const contractStatusValidator = v.union(
  v.literal("unsigned"),
  v.literal("signed_by_subtrade"),
  v.literal("signed_by_justin")
);
const confirmedToBidValidator = v.union(
  v.literal("yes"),
  v.literal("no"),
  v.literal("waiting_to_hear")
);

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("projectSubtrades")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listProjectsForTradeName = query({
  args: { tradeName: v.string() },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const normalizedTradeName = normalizeTradeName(args.tradeName);
    if (!normalizedTradeName) return [];

    const matchingSubtrades = (await ctx.db.query("projectSubtrades").collect()).filter(
      (row) => normalizeTradeName(row.name) === normalizedTradeName,
    );

    const uniqueProjectIds = [...new Set(matchingSubtrades.map((row) => row.projectId))];
    const projects = await Promise.all(uniqueProjectIds.map((projectId) => ctx.db.get(projectId)));

    return projects
      .filter((project): project is NonNullable<typeof project> => project !== null)
      .map((project) => ({
        projectId: project._id,
        projectName: project.name,
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" }));
  },
});

export const listBidDivisionsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const rows = await ctx.db
      .query("projectBidDivisions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return rows.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  },
});

/** Public: list trades/subtrades for a project (no auth). */
export const listByProjectPublic = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectSubtrades")
      .withIndex("by_project_name", (q) => q.eq("projectId", args.projectId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    bidDivisionId: v.optional(v.id("projectBidDivisions")),
    name: v.string(),
    contractStatus: contractStatusValidator,
    budget: v.optional(v.number()),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    contractSentOut: v.optional(v.boolean()),
    contractNotes: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    confirmedToBid: v.optional(confirmedToBidValidator),
    companyName: v.optional(v.string()),
    amountPaid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    let fileUrl: string | undefined;
    if (args.storageId) {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("File not found");
      fileUrl = url;
    } else if (args.fileUrl) {
      fileUrl = args.fileUrl;
    }
    const now = Date.now();
    const tradeName = args.name.trim();
    if (!tradeName) throw new Error("Trade name is required");
    const existingSubtrade = (
      await ctx.db
        .query("projectSubtrades")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect()
    ).find((row) => row.name === tradeName);
    const notes = args.contractNotes?.trim();
    const contactPhone = args.contactPhone?.trim();
    const contactEmail = args.contactEmail?.trim();
    const companyName = args.companyName?.trim();
    const subtradeId =
      existingSubtrade?._id ??
      (await ctx.db.insert("projectSubtrades", {
        projectId: args.projectId,
        bidDivisionId: args.bidDivisionId,
        name: tradeName,
        contractStatus: args.contractStatus,
        budget: args.budget,
        fileUrl,
        uploadedAt: fileUrl ? now : undefined,
        contractSentOut: args.contractSentOut ?? false,
        contractNotes: notes === "" ? undefined : notes,
        contactPhone: contactPhone === "" || contactPhone === undefined ? undefined : contactPhone,
        contactEmail: contactEmail === "" || contactEmail === undefined ? undefined : contactEmail,
        confirmedToBid: args.confirmedToBid,
        companyName: companyName === "" || companyName === undefined ? undefined : companyName,
        amountPaid: args.amountPaid,
      }));

    // Notify PM and PC that a contract has been added/updated for this project.
    const project = await ctx.db.get(args.projectId);
    if (project) {
      const pmId = (project as { pmId?: Id<"users"> }).pmId;
      const coordinatorId = (project as { coordinatorId?: Id<"users"> }).coordinatorId;
      const recipients: Id<"users">[] = [pmId, coordinatorId].filter(Boolean) as Id<"users">[];
      const projectName = (project as { name?: string }).name ?? "Project";
      for (const recipient of recipients) {
        await emitNotificationInternal(
          ctx,
          recipient,
          "project_contract_update",
          `Contract updated – ${tradeName}`,
          `Contract for ${tradeName} on ${projectName} was created.`,
          { projectId: args.projectId, link: `/projects/${args.projectId}/changes` },
        );
      }

      const isPmCreator = user?.role === "project_manager";
      const normalizedTradeName = normalizeTradeName(tradeName);
      if (normalizedTradeName) {
        const portalAccount = await ctx.db
          .query("tradePortalAccounts")
          .withIndex("by_trade_name_normalized", (q) =>
            q.eq("tradeNameNormalized", normalizedTradeName),
          )
          .first();
        if (portalAccount) {
          await ensureTradePortalAssignment(ctx, {
            portalAccountId: portalAccount._id,
            projectId: args.projectId,
            subtradeId,
            createdAt: now,
          });
          const pendingMatches = await ctx.db
            .query("tradePortalPendingAssignments")
            .withIndex("by_project_subtrade", (q) =>
              q.eq("projectId", args.projectId).eq("subtradeId", subtradeId),
            )
            .collect();
          for (const pending of pendingMatches) {
            if (pending.tradeNameNormalized === normalizedTradeName) {
              await ctx.db.delete(pending._id);
            }
          }
        } else {
          await ensurePendingTradePortalAssignment(ctx, {
            projectId: args.projectId,
            subtradeId,
            tradeNameExact: tradeName,
            tradeNameNormalized: normalizedTradeName,
            source: "job_tracker",
            createdAt: now,
          });
          if (isPmCreator) {
            const admins = await ctx.db
              .query("users")
              .filter((q) => q.eq(q.field("role"), "admin"))
              .collect();
            for (const admin of admins) {
              await emitNotificationInternal(
                ctx,
                admin._id as Id<"users">,
                "trade_login_setup_required",
                "Trade login setup required",
                `PM created "${args.name.trim()}" on ${projectName}. Create a trade login account.`,
                { projectId: args.projectId, link: "/admin/trade-logins" },
              );
            }
          }
        }
      }
    }

    return subtradeId;
  },
});

export const update = mutation({
  args: {
    subtradeId: v.id("projectSubtrades"),
    bidDivisionId: v.optional(v.union(v.id("projectBidDivisions"), v.null())),
    name: v.optional(v.string()),
    contractStatus: v.optional(contractStatusValidator),
    budget: v.optional(v.number()),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    contractSentOut: v.optional(v.boolean()),
    contractNotes: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    confirmedToBid: v.optional(confirmedToBidValidator),
    companyName: v.optional(v.string()),
    amountPaid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { subtradeId, ...updates } = args;
    const doc = await ctx.db.get(subtradeId);
    if (!doc) throw new Error("Subtrade not found");
    const patch: Record<string, unknown> = {};
    if (updates.bidDivisionId !== undefined) patch.bidDivisionId = updates.bidDivisionId === null ? undefined : updates.bidDivisionId;
    if (updates.name !== undefined) patch.name = updates.name.trim();
    if (updates.contractStatus !== undefined) patch.contractStatus = updates.contractStatus;
    if (updates.budget !== undefined) patch.budget = updates.budget;
    if (updates.storageId != null) {
      const url = await ctx.storage.getUrl(updates.storageId);
      if (!url) throw new Error("File not found");
      patch.fileUrl = url;
      patch.uploadedAt = Date.now();
    } else if (updates.fileUrl !== undefined) {
      patch.fileUrl = updates.fileUrl;
      patch.uploadedAt = updates.fileUrl ? Date.now() : undefined;
    }
    if (updates.contractSentOut !== undefined) patch.contractSentOut = updates.contractSentOut;
    if (updates.contractNotes !== undefined) {
      const t = updates.contractNotes.trim();
      patch.contractNotes = t === "" ? undefined : t;
    }
    if (updates.contactPhone !== undefined) {
      const t = updates.contactPhone.trim();
      patch.contactPhone = t === "" ? undefined : t;
    }
    if (updates.contactEmail !== undefined) {
      const t = updates.contactEmail.trim();
      patch.contactEmail = t === "" ? undefined : t;
    }
    if (updates.confirmedToBid !== undefined) {
      patch.confirmedToBid = updates.confirmedToBid;
    }
    if (updates.companyName !== undefined) {
      const t = updates.companyName.trim();
      patch.companyName = t === "" ? undefined : t;
    }
    if (updates.amountPaid !== undefined) patch.amountPaid = updates.amountPaid;
    if (Object.keys(patch).length === 0) return subtradeId;
    await ctx.db.patch(subtradeId, patch);

    // Notify PM and PC that a contract has been updated for this project.
    const projectId = doc.projectId as Id<"projects">;
    const project = await ctx.db.get(projectId);
    if (project) {
      const pmId = (project as { pmId?: Id<"users"> }).pmId;
      const coordinatorId = (project as { coordinatorId?: Id<"users"> }).coordinatorId;
      const recipients: Id<"users">[] = [pmId, coordinatorId].filter(Boolean) as Id<"users">[];
      const projectName = (project as { name?: string }).name ?? "Project";
      const subtradeName = (patch.name as string | undefined) ?? doc.name;
      for (const recipient of recipients) {
        await emitNotificationInternal(
          ctx,
          recipient,
          "project_contract_update",
          `Contract updated – ${subtradeName}`,
          `Contract for ${subtradeName} on ${projectName} was updated.`,
          { projectId, link: `/projects/${projectId}/changes` },
        );
      }
    }

    await recordAuditLog(ctx, {
      action: "subtrades.update",
      resourceType: "projectSubtrades",
      resourceId: subtradeId,
      summary: (patch.name as string | undefined) ?? doc.name,
    });
    return subtradeId;
  },
});

export const createBidDivision = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const trimmed = args.name.trim();
    if (!trimmed) throw new Error("Division name is required");
    const existing = await ctx.db
      .query("projectBidDivisions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const duplicate = existing.find((d) => d.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) return duplicate._id;
    return await ctx.db.insert("projectBidDivisions", {
      projectId: args.projectId,
      name: trimmed,
      createdAt: Date.now(),
    });
  },
});

export const updateBidDivision = mutation({
  args: {
    divisionId: v.id("projectBidDivisions"),
    bidDeadlineAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const div = await ctx.db.get(args.divisionId);
    if (!div) throw new Error("Division not found");
    if (args.bidDeadlineAt === undefined) return args.divisionId;
    const nextDeadline = args.bidDeadlineAt === null ? undefined : args.bidDeadlineAt;
    const prev = div.bidDeadlineAt;
    await ctx.db.patch(args.divisionId, {
      bidDeadlineAt: nextDeadline,
      ...(nextDeadline !== prev ? { bidDeadlineReminderMilestonesSent: [] } : {}),
    });
    await recordAuditLog(ctx, {
      action: "subtrades.updateBidDivision",
      resourceType: "projectBidDivisions",
      resourceId: args.divisionId,
      summary: div.name,
    });
    return args.divisionId;
  },
});

export const remove = mutation({
  args: { subtradeId: v.id("projectSubtrades") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const doc = await ctx.db.get(args.subtradeId);
    await ctx.db.delete(args.subtradeId);
    await recordAuditLog(ctx, {
      action: "subtrades.remove",
      resourceType: "projectSubtrades",
      resourceId: args.subtradeId,
      summary: doc?.name,
    });
    return args.subtradeId;
  },
});
