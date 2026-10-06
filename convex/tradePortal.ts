import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CENTRAL_TIMEZONE = "America/Chicago";

function normalizeTradeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getDayKeyCentral(ts: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return Date.UTC(year, month - 1, day);
}

type PortalIdentity = {
  account: Doc<"tradePortalAccounts">;
  session: Doc<"tradePortalSessions">;
  assignments: Array<{
    assignmentId: Id<"tradePortalAssignments">;
    projectId: Id<"projects">;
    projectName: string;
    subtradeId: Id<"projectSubtrades">;
    subtradeName: string;
  }>;
};

type PortalCtx = MutationCtx | QueryCtx;

async function requirePortalSession(ctx: PortalCtx, sessionToken: string): Promise<PortalIdentity> {
  const token = sessionToken.trim();
  if (!token) throw new Error("Session token is required");
  const session = await ctx.db
    .query("tradePortalSessions")
    .withIndex("by_session_token", (q) => q.eq("sessionToken", token))
    .first();
  if (!session) throw new Error("Portal session not found");
  if (session.expiresAt < Date.now()) {
    if (typeof (ctx.db as { delete?: unknown }).delete === "function") {
      await (ctx.db as { delete: (id: Id<"tradePortalSessions">) => Promise<void> }).delete(session._id);
    }
    throw new Error("Portal session expired");
  }

  const account = await ctx.db.get(session.portalAccountId);
  if (!account || !account.isActive) throw new Error("Portal account is inactive");

  const assignments = await ctx.db
    .query("tradePortalAssignments")
    .withIndex("by_portal_account", (q) => q.eq("portalAccountId", account._id))
    .collect();

  const hydrated = await Promise.all(
    assignments.map(async (assignment: Doc<"tradePortalAssignments">) => {
      const [project, subtrade] = await Promise.all([
        ctx.db.get(assignment.projectId),
        ctx.db.get(assignment.subtradeId),
      ]);
      if (!project || !subtrade || subtrade.projectId !== project._id) return null;
      return {
        assignmentId: assignment._id,
        projectId: project._id,
        projectName: project.name,
        subtradeId: subtrade._id,
        subtradeName: subtrade.name,
      };
    }),
  );

  // Queries run with a read-only DB interface in Convex, so only touch
  // `lastSeenAt` when this helper is called from a mutation context.
  if (typeof (ctx.db as { patch?: unknown }).patch === "function") {
    await (ctx.db as { patch: (id: Id<"tradePortalSessions">, value: { lastSeenAt: number }) => Promise<void> }).patch(
      session._id,
      { lastSeenAt: Date.now() },
    );
  }
  const dedupedAssignments = new Map<string, NonNullable<typeof hydrated[number]>>();
  for (const row of hydrated) {
    if (!row) continue;
    const key = `${row.projectId}:${row.subtradeId}`;
    if (!dedupedAssignments.has(key)) dedupedAssignments.set(key, row);
  }
  return {
    account,
    session,
    assignments: [...dedupedAssignments.values()],
  };
}

async function requireAdminUserId(ctx: PortalCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "admin") throw new Error("Admin access required");
  return userId;
}

async function resolveStorageUrls(ctx: PortalCtx, storageIds: Id<"_storage">[] | undefined) {
  if (!storageIds || storageIds.length === 0) return undefined;
  const urls = await Promise.all(storageIds.map((id) => ctx.storage.getUrl(id)));
  const valid = urls.filter((url): url is string => !!url);
  return valid.length ? valid : undefined;
}

async function ensurePortalAssignment(
  ctx: MutationCtx,
  input: {
    portalAccountId: Id<"tradePortalAccounts">;
    projectId: Id<"projects">;
    subtradeId: Id<"projectSubtrades">;
    createdAt?: number;
  },
) {
  const existing = await ctx.db
    .query("tradePortalAssignments")
    .withIndex("by_portal_account", (q) => q.eq("portalAccountId", input.portalAccountId))
    .collect();
  const found = existing.find(
    (row: Doc<"tradePortalAssignments">) =>
      row.projectId === input.projectId && row.subtradeId === input.subtradeId,
  );
  if (found) return found._id;
  return await ctx.db.insert("tradePortalAssignments", {
    portalAccountId: input.portalAccountId,
    projectId: input.projectId,
    subtradeId: input.subtradeId,
    createdAt: input.createdAt ?? Date.now(),
  });
}

async function resolvePendingAssignmentsForAccount(
  ctx: MutationCtx,
  args: {
    portalAccountId: Id<"tradePortalAccounts">;
    tradeNameNormalized: string;
    createdAt?: number;
  },
) {
  const pending = await ctx.db
    .query("tradePortalPendingAssignments")
    .withIndex("by_trade_name_normalized", (q) =>
      q.eq("tradeNameNormalized", args.tradeNameNormalized),
    )
    .collect();
  for (const row of pending) {
    await ensurePortalAssignment(ctx, {
      portalAccountId: args.portalAccountId,
      projectId: row.projectId,
      subtradeId: row.subtradeId,
      createdAt: args.createdAt ?? row.createdAt,
    });
    await ctx.db.delete(row._id);
  }
}

async function getSystemActorId(ctx: PortalCtx): Promise<Id<"users">> {
  const admin = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("role"), "admin"))
    .first();
  const actor = admin?._id ?? (await ctx.db.query("users").first())?._id;
  if (!actor) throw new Error("No internal user found to attribute portal actions");
  return actor;
}

function requireAssignment(
  identity: PortalIdentity,
  assignmentId: Id<"tradePortalAssignments">,
) {
  const assignment = identity.assignments.find((row) => row.assignmentId === assignmentId);
  if (!assignment) throw new Error("This job is not assigned to your trade account");
  return assignment;
}

export const signIn = mutation({
  args: {
    tradeName: v.string(),
    passcode: v.string(),
  },
  handler: async (ctx, args) => {
    const tradeNameNormalized = normalizeTradeName(args.tradeName);
    if (!tradeNameNormalized) throw new Error("Trade name is required");
    const account = await ctx.db
      .query("tradePortalAccounts")
      .withIndex("by_trade_name_normalized", (q) => q.eq("tradeNameNormalized", tradeNameNormalized))
      .first();
    if (!account || !account.isActive) throw new Error("Invalid trade portal login");
    if (account.passcode.trim() !== args.passcode.trim()) throw new Error("Invalid trade portal login");

    const now = Date.now();
    const sessionToken = randomToken();
    await ctx.db.insert("tradePortalSessions", {
      portalAccountId: account._id,
      sessionToken,
      expiresAt: now + SESSION_TTL_MS,
      lastSeenAt: now,
      createdAt: now,
    });
    return { sessionToken, expiresAt: now + SESSION_TTL_MS };
  },
});

export const signOut = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const token = args.sessionToken.trim();
    if (!token) return true;
    const existing = await ctx.db
      .query("tradePortalSessions")
      .withIndex("by_session_token", (q) => q.eq("sessionToken", token))
      .first();
    if (!existing) return true;
    await ctx.db.delete(existing._id);
    return true;
  },
});

export const getSessionState = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    try {
      const identity = await requirePortalSession(ctx, args.sessionToken);
      return {
        tradeName: identity.account.tradeName,
        expiresAt: identity.session.expiresAt,
        assignments: identity.assignments,
        sessionError: null,
      };
    } catch (error) {
      return {
        tradeName: "",
        expiresAt: 0,
        assignments: [],
        sessionError: error instanceof Error ? error.message : "Portal session could not be loaded",
      };
    }
  },
});

export const listAssignedJobs = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    try {
      const identity = await requirePortalSession(ctx, args.sessionToken);
      return identity.assignments;
    } catch {
      return [];
    }
  },
});

export const portalGenerateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requirePortalSession(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const listEmployeeDocuments = query({
  args: {
    sessionToken: v.string(),
    assignmentId: v.id("tradePortalAssignments"),
  },
  handler: async (ctx, args) => {
    try {
      const identity = await requirePortalSession(ctx, args.sessionToken);
      const assignment = requireAssignment(identity, args.assignmentId);
      return await ctx.db
        .query("safetyEmployeeDocuments")
        .withIndex("by_project_subtrade", (q) =>
          q.eq("projectId", assignment.projectId).eq("subtradeId", assignment.subtradeId),
        )
        .order("desc")
        .collect();
    } catch {
      return [];
    }
  },
});

export const submitEmployeeDocument = mutation({
  args: {
    sessionToken: v.string(),
    assignmentId: v.id("tradePortalAssignments"),
    employeeName: v.string(),
    documentType: v.string(),
    name: v.string(),
    storageId: v.optional(v.id("_storage")),
    fileUrl: v.optional(v.string()),
    documentDate: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requirePortalSession(ctx, args.sessionToken);
    const assignment = requireAssignment(identity, args.assignmentId);
    const actorId = await getSystemActorId(ctx);
    let fileUrl: string | undefined;
    if (args.storageId) {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("File not found");
      fileUrl = url;
    } else if (args.fileUrl?.trim()) {
      fileUrl = args.fileUrl.trim();
    }
    return await ctx.db.insert("safetyEmployeeDocuments", {
      projectId: assignment.projectId,
      subtradeId: assignment.subtradeId,
      employeeName: args.employeeName.trim() || "—",
      documentType: args.documentType.trim(),
      name: args.name.trim(),
      fileUrl,
      uploadedByUserId: actorId,
      uploadedAt: Date.now(),
      documentDate: args.documentDate,
      expiryDate: args.expiryDate,
    });
  },
});

export const submitAttendance = mutation({
  args: {
    sessionToken: v.string(),
    assignmentId: v.id("tradePortalAssignments"),
    workerName: v.string(),
    action: v.union(v.literal("in"), v.literal("out")),
    signedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await requirePortalSession(ctx, args.sessionToken);
    const assignment = requireAssignment(identity, args.assignmentId);
    const workerName = args.workerName.trim();
    if (!workerName) throw new Error("Name is required");
    const actorId = await getSystemActorId(ctx);
    const signedAt = args.signedAt ?? Date.now();
    const dayKey = getDayKeyCentral(signedAt);
    return await ctx.db.insert("jobAttendanceLogs", {
      projectId: assignment.projectId,
      projectNumber: assignment.projectName,
      subtradeId: assignment.subtradeId,
      tradeName: assignment.subtradeName,
      workerName,
      action: args.action,
      signedAt,
      dayKey,
      createdByUserId: actorId,
      createdAt: Date.now(),
    });
  },
});

export const submitProgressReport = mutation({
  args: {
    sessionToken: v.string(),
    assignmentId: v.id("tradePortalAssignments"),
    title: v.string(),
    description: v.optional(v.string()),
    weatherSummary: v.optional(v.string()),
    reportDate: v.optional(v.number()),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    documentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const identity = await requirePortalSession(ctx, args.sessionToken);
    const assignment = requireAssignment(identity, args.assignmentId);
    const actorId = await getSystemActorId(ctx);
    const [photoUrls, documentUrls] = await Promise.all([
      resolveStorageUrls(ctx, args.photoStorageIds),
      resolveStorageUrls(ctx, args.documentStorageIds),
    ]);
    const now = Date.now();
    const dueDate = args.reportDate ?? now;
    return await ctx.db.insert("projectTasks", {
      projectId: assignment.projectId,
      title: args.title.trim(),
      description: args.description?.trim() || undefined,
      weatherSummary: args.weatherSummary?.trim() || undefined,
      photoUrls,
      documentUrls,
      ownerRole: undefined,
      ownerUserId: actorId,
      status: "not_started",
      dueDate,
      subtradeIdsOnSite: [assignment.subtradeId],
      material: assignment.subtradeName,
      createdFromPortal: true,
      portalAccountId: identity.account._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listProgressReports = query({
  args: {
    sessionToken: v.string(),
    assignmentId: v.id("tradePortalAssignments"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const identity = await requirePortalSession(ctx, args.sessionToken);
      const assignment = requireAssignment(identity, args.assignmentId);
      const rows = await ctx.db
        .query("projectTasks")
        .withIndex("by_project", (q) => q.eq("projectId", assignment.projectId))
        .order("desc")
        .take(400);
      const cap = Math.max(1, Math.min(args.limit ?? 25, 100));
      return rows
        .filter(
          (row) =>
            row.portalAccountId === identity.account._id &&
            row.createdFromPortal === true &&
            row.subtradeIdsOnSite?.includes(assignment.subtradeId),
        )
        .slice(0, cap);
    } catch {
      return [];
    }
  },
});

export const listWorkerSuggestions = query({
  args: {
    sessionToken: v.string(),
    assignmentId: v.id("tradePortalAssignments"),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const identity = await requirePortalSession(ctx, args.sessionToken);
      const assignment = requireAssignment(identity, args.assignmentId);
      const searchNormalized = (args.search ?? "").trim().toLowerCase();
      const rows = await ctx.db
        .query("jobAttendanceLogs")
        .withIndex("by_project", (q) => q.eq("projectId", assignment.projectId))
        .order("desc")
        .take(700);
      const names = new Set<string>();
      for (const row of rows) {
        if (row.subtradeId !== assignment.subtradeId) continue;
        const trimmed = row.workerName.trim();
        if (!trimmed) continue;
        if (searchNormalized && !trimmed.toLowerCase().includes(searchNormalized)) continue;
        names.add(trimmed);
        if (names.size >= 12) break;
      }
      return [...names];
    } catch {
      return [];
    }
  },
});

export const adminUpsertPortalAccount = mutation({
  args: {
    tradeName: v.string(),
    passcode: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const tradeName = args.tradeName.trim();
    if (!tradeName) throw new Error("Trade name is required");
    const tradeNameNormalized = normalizeTradeName(tradeName);
    const existing = await ctx.db
      .query("tradePortalAccounts")
      .withIndex("by_trade_name_normalized", (q) => q.eq("tradeNameNormalized", tradeNameNormalized))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        tradeName,
        passcode: args.passcode?.trim() ? args.passcode.trim() : existing.passcode,
        isActive: args.isActive ?? existing.isActive,
        updatedAt: now,
      });
      await resolvePendingAssignmentsForAccount(ctx, {
        portalAccountId: existing._id,
        tradeNameNormalized,
        createdAt: now,
      });
      return existing._id;
    }
    const passcode = args.passcode?.trim();
    if (!passcode) throw new Error("Passcode is required for a new trade login");
    const portalAccountId = await ctx.db.insert("tradePortalAccounts", {
      tradeName,
      tradeNameNormalized,
      passcode,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await resolvePendingAssignmentsForAccount(ctx, {
      portalAccountId,
      tradeNameNormalized,
      createdAt: now,
    });
    return portalAccountId;
  },
});

export const adminSetAssignments = mutation({
  args: {
    portalAccountId: v.id("tradePortalAccounts"),
    assignments: v.array(
      v.object({
        projectId: v.id("projects"),
        subtradeId: v.id("projectSubtrades"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const account = await ctx.db.get(args.portalAccountId);
    if (!account) throw new Error("Portal account not found");

    const current = await ctx.db
      .query("tradePortalAssignments")
      .withIndex("by_portal_account", (q) => q.eq("portalAccountId", args.portalAccountId))
      .collect();
    for (const row of current) {
      await ctx.db.delete(row._id);
    }
    const now = Date.now();
    const uniqueAssignments: Array<{
      projectId: Id<"projects">;
      subtradeId: Id<"projectSubtrades">;
    }> = [];
    const seen = new Set<string>();
    for (const assignment of args.assignments) {
      const key = `${assignment.projectId}:${assignment.subtradeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueAssignments.push(assignment);
    }
    for (const assignment of uniqueAssignments) {
      const subtrade = await ctx.db.get(assignment.subtradeId);
      if (!subtrade || subtrade.projectId !== assignment.projectId) {
        throw new Error("Subtrade does not belong to the selected project");
      }
      await ensurePortalAssignment(ctx, {
        portalAccountId: args.portalAccountId,
        projectId: assignment.projectId,
        subtradeId: assignment.subtradeId,
        createdAt: now,
      });
    }
    return true;
  },
});

async function deletePortalLinksForSubtrade(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  subtradeId: Id<"projectSubtrades">,
) {
  const pending = await ctx.db
    .query("tradePortalPendingAssignments")
    .withIndex("by_project_subtrade", (q) => q.eq("projectId", projectId).eq("subtradeId", subtradeId))
    .collect();
  for (const row of pending) {
    await ctx.db.delete(row._id);
  }

  const assignments = await ctx.db
    .query("tradePortalAssignments")
    .withIndex("by_project_subtrade", (q) => q.eq("projectId", projectId).eq("subtradeId", subtradeId))
    .collect();
  for (const row of assignments) {
    await ctx.db.delete(row._id);
  }
}

export const adminDeletePortalAccount = mutation({
  args: {
    portalAccountId: v.id("tradePortalAccounts"),
  },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const account = await ctx.db.get(args.portalAccountId);
    if (!account) throw new Error("Portal account not found");

    const [sessions, assignments, pendingByName] = await Promise.all([
      ctx.db
        .query("tradePortalSessions")
        .withIndex("by_portal_account", (q) => q.eq("portalAccountId", args.portalAccountId))
        .collect(),
      ctx.db
        .query("tradePortalAssignments")
        .withIndex("by_portal_account", (q) => q.eq("portalAccountId", args.portalAccountId))
        .collect(),
      ctx.db
        .query("tradePortalPendingAssignments")
        .withIndex("by_trade_name_normalized", (q) =>
          q.eq("tradeNameNormalized", account.tradeNameNormalized),
        )
        .collect(),
    ]);

    for (const row of sessions) {
      await ctx.db.delete(row._id);
    }
    for (const row of pendingByName) {
      await ctx.db.delete(row._id);
    }
    for (const row of assignments) {
      await ctx.db.delete(row._id);
    }

    const subtradeIdsToDelete = new Set<Id<"projectSubtrades">>();
    for (const row of assignments) {
      subtradeIdsToDelete.add(row.subtradeId);
    }
    let deletedSubtradeCount = 0;
    for (const subtradeId of subtradeIdsToDelete) {
      const existing = await ctx.db.get(subtradeId);
      if (!existing) continue;
      await ctx.db.delete(subtradeId);
      deletedSubtradeCount += 1;
    }

    await ctx.db.delete(args.portalAccountId);

    return {
      deletedSessionCount: sessions.length,
      deletedAssignmentCount: assignments.length,
      deletedPendingCount: pendingByName.length,
      deletedSubtradeCount,
    };
  },
});

/** Remove a trade that exists on project subtrade lists but has no portal login yet. */
export const adminDeleteOrphanTradeByName = mutation({
  args: { tradeName: v.string() },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const tradeName = args.tradeName.trim();
    const tradeNameNormalized = normalizeTradeName(tradeName);
    if (!tradeNameNormalized) throw new Error("Trade name is required");

    const existingAccount = await ctx.db
      .query("tradePortalAccounts")
      .withIndex("by_trade_name_normalized", (q) => q.eq("tradeNameNormalized", tradeNameNormalized))
      .first();
    if (existingAccount) {
      throw new Error(
        "This trade already has a portal login. Delete it from Existing Trade Logins instead.",
      );
    }

    const matchingSubtrades = (await ctx.db.query("projectSubtrades").collect()).filter(
      (row) => normalizeTradeName(row.name) === tradeNameNormalized,
    );

    for (const subtrade of matchingSubtrades) {
      await deletePortalLinksForSubtrade(ctx, subtrade.projectId, subtrade._id);
      await ctx.db.delete(subtrade._id);
    }

    const pendingByName = await ctx.db
      .query("tradePortalPendingAssignments")
      .withIndex("by_trade_name_normalized", (q) => q.eq("tradeNameNormalized", tradeNameNormalized))
      .collect();
    for (const row of pendingByName) {
      await ctx.db.delete(row._id);
    }

    return {
      deletedSubtradeCount: matchingSubtrades.length,
      deletedPendingCount: pendingByName.length,
    };
  },
});

export const adminListPortalAccounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminUserId(ctx);
    const accounts = await ctx.db.query("tradePortalAccounts").collect();
    accounts.sort((a, b) => a.tradeName.localeCompare(b.tradeName, undefined, { sensitivity: "base" }));
    return await Promise.all(
      accounts.map(async (account) => {
        const assignments = await ctx.db
          .query("tradePortalAssignments")
          .withIndex("by_portal_account", (q) => q.eq("portalAccountId", account._id))
          .collect();
        const hydrated = await Promise.all(
          assignments.map(async (assignment) => {
            const [project, subtrade] = await Promise.all([
              ctx.db.get(assignment.projectId),
              ctx.db.get(assignment.subtradeId),
            ]);
            if (!project || !subtrade || subtrade.projectId !== project._id) return null;
            return {
              assignmentId: assignment._id,
              projectId: project._id,
              projectName: project.name,
              subtradeId: subtrade._id,
              subtradeName: subtrade.name,
            };
          }),
        );
        const hydratedAssignments = hydrated.filter((row): row is NonNullable<typeof row> => row !== null);
        const uniqueAssignedProjectCount = new Set(hydratedAssignments.map((row) => row.projectId)).size;
        return {
          ...account,
          assignments: hydratedAssignments,
          uniqueAssignedProjectCount,
        };
      }),
    );
  },
});

export const adminListPendingTradeAssignments = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminUserId(ctx);
    const pending = await ctx.db.query("tradePortalPendingAssignments").collect();
    const grouped = new Map<
      string,
      {
        tradeName: string;
        tradeNameNormalized: string;
        uniqueProjectIds: Set<Id<"projects">>;
      }
    >();
    for (const row of pending) {
      const existing = grouped.get(row.tradeNameNormalized);
      if (existing) {
        existing.uniqueProjectIds.add(row.projectId);
        if (row.tradeNameExact.localeCompare(existing.tradeName, undefined, { sensitivity: "base" }) < 0) {
          existing.tradeName = row.tradeNameExact;
        }
        continue;
      }
      grouped.set(row.tradeNameNormalized, {
        tradeName: row.tradeNameExact,
        tradeNameNormalized: row.tradeNameNormalized,
        uniqueProjectIds: new Set([row.projectId]),
      });
    }
    return [...grouped.values()]
      .map((row) => ({
        tradeName: row.tradeName,
        tradeNameNormalized: row.tradeNameNormalized,
        uniquePendingProjectCount: row.uniqueProjectIds.size,
      }))
      .sort((a, b) => a.tradeName.localeCompare(b.tradeName, undefined, { sensitivity: "base" }));
  },
});

export const adminListMissingTradeLogins = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminUserId(ctx);
    const [subtrades, accounts] = await Promise.all([
      ctx.db.query("projectSubtrades").collect(),
      ctx.db.query("tradePortalAccounts").collect(),
    ]);
    const accountNames = new Set(accounts.map((row) => row.tradeNameNormalized));
    const missingByNormalized = new Map<string, string>();
    for (const subtrade of subtrades) {
      const displayName = subtrade.name.trim();
      const normalizedName = normalizeTradeName(displayName);
      if (!normalizedName) continue;
      if (accountNames.has(normalizedName)) continue;
      const existing = missingByNormalized.get(normalizedName);
      if (!existing || displayName.localeCompare(existing, undefined, { sensitivity: "base" }) < 0) {
        missingByNormalized.set(normalizedName, displayName);
      }
    }
    return [...missingByNormalized.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  },
});
