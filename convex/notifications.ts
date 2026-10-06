import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import type {
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { recordAuditLog } from "./auditLog";
import {
  getDayKeyCentral,
  dueTimestampToDayKeyCentral,
  wholeDaysBetweenDayKeys,
} from "./lib/centralTime";

/** Document types that count as "changes" (RFI, SI, COR, CO, PCN). */
const CHANGE_DOC_TYPES = ["RFI", "SI", "COR", "CO", "PCN"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

const NOTIFICATION_TYPES = [
  "project_contract_update",
  "project_change_followup",
  "boardroom_booking",
  "boardroom_approved",
  "safety_change",
  "boardroom_admin_new_request",
  /** RFI: ball-in-court users must respond. */
  "rfi_action_required",
  /** Submittal: ball-in-court users must review/respond. */
  "submittal_action_required",
  "weekly_update_ready",
  "task_due_soon",
  "task_overdue",
  "daily_report_missing",
  "document_expiring",
  "safety_doc_expiring",
  "boardroom_rejected",
  "boardroom_schedule_updated",
  "trade_login_setup_required",
  /** Personal stale-document reminder set by the user on a change row. */
  "change_personal_reminder",
  /** Principal-role popup: overdue schedule task or stale changes on any project. */
  "principal_overdue_alert",
  /** User-created notification from Account settings. */
  "user_custom_notification",
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type AnyCtx = MutationCtx;

type PreferenceRow = {
  _id: Id<"notificationPreferences">;
  userId: Id<"users">;
  projectContractsEnabled: boolean;
  projectChangesFollowupEnabled: boolean;
  boardroomBookingsEnabled: boolean;
  boardroomApprovalsEnabled: boolean;
  safetyChangesEnabled: boolean;
  adminBoardroomRequestsEnabled: boolean;
  taskDueRemindersEnabled: boolean;
  dailyReportRemindersEnabled: boolean;
  safetyDocExpiryRemindersEnabled: boolean;
  boardroomStatusUpdatesEnabled: boolean;
  principalOverdueAlertsEnabled: boolean;
  rfiActionRequiredEnabled: boolean;
  submittalActionRequiredEnabled: boolean;
  weeklyUpdateEnabled: boolean;
  tradeLoginSetupRequiredEnabled: boolean;
  personalChangeRemindersEnabled: boolean;
};

async function getPrincipalUserIds(ctx: AnyCtx | QueryCtx): Promise<Id<"users">[]> {
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u) => u.role === "principal" && u.isActive !== false)
    .map((u) => u._id);
}

async function formatProjectContactLine(
  ctx: AnyCtx | QueryCtx,
  project: Doc<"projects">,
): Promise<string> {
  const parts: string[] = [];
  if (project.pmId) {
    const pm = await ctx.db.get(project.pmId);
    parts.push(`${pm?.name?.trim() || "—"} (PM)`);
  }
  if (project.coordinatorId) {
    const coord = await ctx.db.get(project.coordinatorId);
    parts.push(`${coord?.name?.trim() || "—"} (Coordinator)`);
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

async function hasUnreadPrincipalOverdueAlert(
  ctx: AnyCtx,
  userId: Id<"users">,
  projectId: Id<"projects">,
  title: string,
): Promise<boolean> {
  const all = await ctx.db
    .query("notifications")
    .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
    .collect();
  return all.some(
    (n) =>
      n.type === "principal_overdue_alert" &&
      n.readAt == null &&
      n.projectId === projectId &&
      n.title === title,
  );
}

async function emitPrincipalOverdueAlertToAll(
  ctx: AnyCtx,
  params: {
    project: Doc<"projects">;
    title: string;
    detailLine: string;
    link: string;
  },
) {
  const principalIds = await getPrincipalUserIds(ctx);
  if (principalIds.length === 0) return;
  const contactLine = await formatProjectContactLine(ctx, params.project);
  const body = `${params.detailLine} Contact: ${contactLine}.`;
  for (const uid of principalIds) {
    if (await hasUnreadPrincipalOverdueAlert(ctx, uid, params.project._id, params.title)) continue;
    await emitNotificationInternal(ctx, uid, "principal_overdue_alert", params.title, body, {
      projectId: params.project._id,
      link: params.link,
    });
  }
}

async function getOrCreatePreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<PreferenceRow> {
  const existing = await ctx.db
    .query("notificationPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (existing) return normalizePreferenceRow(existing);

  const defaults: Omit<PreferenceRow, "_id"> = {
    userId,
    projectContractsEnabled: true,
    projectChangesFollowupEnabled: true,
    boardroomBookingsEnabled: true,
    boardroomApprovalsEnabled: true,
    safetyChangesEnabled: true,
    adminBoardroomRequestsEnabled: true,
    taskDueRemindersEnabled: true,
    dailyReportRemindersEnabled: true,
    safetyDocExpiryRemindersEnabled: true,
    boardroomStatusUpdatesEnabled: true,
    principalOverdueAlertsEnabled: true,
    rfiActionRequiredEnabled: true,
    submittalActionRequiredEnabled: true,
    weeklyUpdateEnabled: true,
    tradeLoginSetupRequiredEnabled: true,
    personalChangeRemindersEnabled: true,
  };
  const _id = (await ctx.db.insert(
    "notificationPreferences",
    defaults,
  )) as Id<"notificationPreferences">;
  return { _id, ...defaults };
}

function normalizePreferenceRow(row: Doc<"notificationPreferences">): PreferenceRow {
  return {
    ...row,
    taskDueRemindersEnabled: row.taskDueRemindersEnabled ?? true,
    dailyReportRemindersEnabled: row.dailyReportRemindersEnabled ?? true,
    safetyDocExpiryRemindersEnabled: row.safetyDocExpiryRemindersEnabled ?? true,
    boardroomStatusUpdatesEnabled: row.boardroomStatusUpdatesEnabled ?? true,
    principalOverdueAlertsEnabled: row.principalOverdueAlertsEnabled ?? true,
    rfiActionRequiredEnabled: row.rfiActionRequiredEnabled ?? true,
    submittalActionRequiredEnabled: row.submittalActionRequiredEnabled ?? true,
    weeklyUpdateEnabled: row.weeklyUpdateEnabled ?? true,
    tradeLoginSetupRequiredEnabled: row.tradeLoginSetupRequiredEnabled ?? true,
    personalChangeRemindersEnabled: row.personalChangeRemindersEnabled ?? true,
  };
}

function isEnabledForType(prefs: PreferenceRow, type: NotificationType) {
  switch (type) {
    case "project_contract_update":
      return prefs.projectContractsEnabled;
    case "project_change_followup":
      return prefs.projectChangesFollowupEnabled;
    case "change_personal_reminder":
      return prefs.personalChangeRemindersEnabled;
    case "boardroom_booking":
      return prefs.boardroomBookingsEnabled;
    case "boardroom_approved":
      return prefs.boardroomApprovalsEnabled;
    case "safety_change":
      return prefs.safetyChangesEnabled;
    case "boardroom_admin_new_request":
      return prefs.adminBoardroomRequestsEnabled;
    case "weekly_update_ready":
      return prefs.weeklyUpdateEnabled;
    case "task_due_soon":
    case "task_overdue":
      return prefs.taskDueRemindersEnabled;
    case "daily_report_missing":
      return prefs.dailyReportRemindersEnabled;
    case "document_expiring":
    case "safety_doc_expiring":
      return prefs.safetyDocExpiryRemindersEnabled;
    case "boardroom_rejected":
    case "boardroom_schedule_updated":
      return prefs.boardroomStatusUpdatesEnabled;
    case "principal_overdue_alert":
      return prefs.principalOverdueAlertsEnabled;
    case "rfi_action_required":
      return prefs.rfiActionRequiredEnabled;
    case "submittal_action_required":
      return prefs.submittalActionRequiredEnabled;
    case "trade_login_setup_required":
      return prefs.tradeLoginSetupRequiredEnabled;
    case "user_custom_notification":
      return true;
    default:
      return true;
  }
}

export async function emitNotificationInternal(
  ctx: AnyCtx,
  userId: Id<"users">,
  type: NotificationType,
  title: string,
  body?: string,
  options?: {
    link?: string;
    projectId?: Id<"projects">;
    bookingId?: Id<"boardroomBookings">;
    incidentId?: Id<"incidentReports">;
  },
) {
  const prefs = await getOrCreatePreferences(ctx, userId);
  if (!isEnabledForType(prefs, type)) return;

  const now = Date.now();
  await ctx.db.insert("notifications", {
    userId,
    type,
    title,
    body,
    link: options?.link,
    projectId: options?.projectId,
    bookingId: options?.bookingId,
    incidentId: options?.incidentId,
    createdAt: now,
    readAt: undefined,
  });
}

function docKindToChangesSlug(docType: string) {
  const t = docType.trim().toUpperCase();
  if (t === "RFI") return "rfi";
  if (t === "SUBMITTAL") return "submittal";
  // Default fallback so the notification still routes somewhere useful.
  return t.toLowerCase();
}

function isChangeDocType(docType: string) {
  const t = docType.trim().toUpperCase();
  return (
    t === "RFI" ||
    t === "SI" ||
    t === "COR" ||
    t === "CO" ||
    t === "PCN" ||
    t === "SUBMITTAL" ||
    t === "PO"
  );
}

const personalReminderIntervalValidator = v.union(
  v.literal(3),
  v.literal(5),
  v.literal(7),
  v.literal(14),
);

function formatReminderInterval(days: 3 | 5 | 7 | 14): string {
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  return `${days} days`;
}

/** Clear lastNotifiedAt on all personal reminders for a document after it is updated. */
export async function resetPersonalRemindersLastNotified(
  ctx: AnyCtx,
  documentId: Id<"documents">,
) {
  const reminders = await ctx.db
    .query("documentPersonalReminders")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  for (const reminder of reminders) {
    if (reminder.lastNotifiedAt != null) {
      await ctx.db.patch(reminder._id, { lastNotifiedAt: undefined });
    }
  }
}

/** Remove all personal reminders when a change document is deleted. */
export async function deletePersonalRemindersForDocument(
  ctx: AnyCtx,
  documentId: Id<"documents">,
) {
  const reminders = await ctx.db
    .query("documentPersonalReminders")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  for (const reminder of reminders) {
    await ctx.db.delete(reminder._id);
  }
}

function formatDate(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString();
}

/**
 * Emit an "action required" notification to every ball-in-court user.
 * Used for Procore/ACC-like RFIs + Submittals.
 */
export async function emitActionRequiredToBallInCourt(
  ctx: AnyCtx,
  params: {
    projectId: Id<"projects">;
    documentId: Id<"documents">;
    documentType: string; // e.g. RFI / SUBMITTAL
    documentName: string;
    ballInCourtUserIds: Id<"users">[];
    dueDate?: number;
    alreadyDue?: boolean;
  },
) {
  const normalizedType = params.documentType.trim().toUpperCase();
  const slug = docKindToChangesSlug(normalizedType);
  const link = `/projects/${params.projectId}/changes/${slug}`;
  const dueSuffix = params.dueDate
    ? params.alreadyDue
      ? ` (was due ${formatDate(params.dueDate)})`
      : ` (due ${formatDate(params.dueDate)})`
    : "";

  if (normalizedType === "RFI") {
    for (const uid of params.ballInCourtUserIds) {
      await emitNotificationInternal(
        ctx,
        uid,
        "rfi_action_required",
        `RFI: action required`,
        `Please respond to "${params.documentName}"${dueSuffix}.`,
        { link, projectId: params.projectId },
      );
    }
  } else if (normalizedType === "SUBMITTAL") {
    for (const uid of params.ballInCourtUserIds) {
      await emitNotificationInternal(
        ctx,
        uid,
        "submittal_action_required",
        `Submittal: action required`,
        `Please review/respond to "${params.documentName}"${dueSuffix}.`,
        { link, projectId: params.projectId },
      );
    }
  }
}

/**
 * Emit immediate notifications to PM + Coordinator when a change-doc is created/updated/deleted.
 */
export async function emitProjectChangeUpdatedToPmAndCoordinator(
  ctx: AnyCtx,
  params: {
    projectId: Id<"projects">;
    documentType: string;
    documentName: string;
    action: "created" | "updated" | "deleted";
  },
) {
  if (!isChangeDocType(params.documentType)) return;

  const project = await ctx.db.get(params.projectId);
  if (!project) return;

  const recipientIds = Array.from(
    new Set([project.pmId, project.coordinatorId].filter(Boolean)),
  ) as Id<"users">[];

  if (recipientIds.length === 0) return;

  const normalizedType = params.documentType.trim().toUpperCase();
  const slug = docKindToChangesSlug(normalizedType);
  const link = `/projects/${params.projectId}/changes/${slug}`;
  const actionWord =
    params.action === "created"
      ? "created"
      : params.action === "updated"
        ? "updated"
        : "deleted";
  const projectName = project.name;

  for (const userId of recipientIds) {
    await emitNotificationInternal(
      ctx,
      userId,
      "project_change_followup",
      `Changes updated: ${projectName}`,
      `${projectName}: ${normalizedType} "${params.documentName}" was ${actionWord}.`,
      {
        link,
        projectId: params.projectId,
      },
    );
  }
}

// ——— Existing document reminder notifications (toast-style) ———

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("documentReminderNotifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Unread only, for toasts. */
export const listUnreadForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("documentReminderNotifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return all.filter((n) => n.readAt == null);
  },
});

export const markAsRead = mutation({
  args: { notificationId: v.id("documentReminderNotifications") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const doc = await ctx.db.get(args.notificationId);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
  },
});

export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const list = await ctx.db
      .query("documentReminderNotifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    for (const n of list) {
      if (n.readAt == null) await ctx.db.patch(n._id, { readAt: now });
    }
  },
});

export const listPersonalRemindersForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const projectDocs = await ctx.db
      .query("documents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const projectDocIds = new Set(projectDocs.map((d) => d._id as string));

    const reminders = await ctx.db
      .query("documentPersonalReminders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return reminders
      .filter((r) => projectDocIds.has(r.documentId as string))
      .map((r) => ({
        documentId: r.documentId,
        intervalDays: r.intervalDays,
      }));
  },
});

export const setDocumentPersonalReminder = mutation({
  args: {
    documentId: v.id("documents"),
    intervalDays: v.union(personalReminderIntervalValidator, v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (!isChangeDocType(doc.type)) {
      throw new Error("Personal reminders are only available for change documents");
    }

    const existing = await ctx.db
      .query("documentPersonalReminders")
      .withIndex("by_document_user", (q) =>
        q.eq("documentId", args.documentId).eq("userId", userId),
      )
      .first();

    if (args.intervalDays == null) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        intervalDays: args.intervalDays,
        lastNotifiedAt: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("documentPersonalReminders", {
      documentId: args.documentId,
      userId,
      intervalDays: args.intervalDays,
      createdAt: now,
    });
  },
});

/** Creates one test notification for the current user so you can see the toast. */
export const createTestNotification = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const firstProject = await ctx.db.query("projects").withIndex("by_updated").order("desc").first();
    if (!firstProject) throw new Error("Create a project first so the test notification can link to it.");
    return await ctx.db.insert("documentReminderNotifications", {
      userId,
      projectId: firstProject._id,
      projectName: firstProject.name,
      message: `No updates to Changes (RFI/SI/COR/CO/PCN) for **${firstProject.name}** in over 5 days. Consider following up.`,
      createdAt: Date.now(),
    });
  },
});

/** Called by cron: create reminder notifications for projects with no change-doc activity in 5 days. */
export const createReminderNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const cutoff = now - FIVE_DAYS_MS;

    const allDocs = await ctx.db.query("documents").collect();
    const changeDocs = allDocs.filter((d) => {
      const isChangeType = CHANGE_DOC_TYPES.includes(
        d.type.toUpperCase() as (typeof CHANGE_DOC_TYPES)[number],
      );
      // Only consider change documents that are not explicitly paid.
      const isUnpaid = (d as { status?: "paid" | "unpaid" }).status !== "paid";
      return isChangeType && isUnpaid;
    });
    if (changeDocs.length === 0) return;

    const lastActivityByProject = new Map<string, number>();
    for (const d of changeDocs) {
      const pid = d.projectId as string;
      const last = Math.max(d.uploadedAt, d.updatedAt ?? d.uploadedAt);
      const prev = lastActivityByProject.get(pid);
      lastActivityByProject.set(pid, prev == null ? last : Math.max(prev, last));
    }

    const staleProjectIds: string[] = [];
    for (const [projectId, lastActivity] of lastActivityByProject) {
      if (lastActivity < cutoff) staleProjectIds.push(projectId);
    }
    if (staleProjectIds.length === 0) return;

    const projects = await ctx.db.query("projects").collect();
    const projectMap = new Map(projects.map((p) => [p._id as string, p]));

    for (const projectId of staleProjectIds) {
      const project = projectMap.get(projectId);
      if (!project) continue;
      const pmId = project.pmId;
      const coordinatorId = project.coordinatorId;
      const userIds: Id<"users">[] = [pmId, coordinatorId].filter(Boolean) as Id<"users">[];
      const projectName = project.name;
      const pid = projectId as Id<"projects">;

      for (const userId of userIds) {
        const existingForUserProject = await ctx.db
          .query("documentReminderNotifications")
          .withIndex("by_userId_projectId", (q) => q.eq("userId", userId).eq("projectId", pid))
          .collect();
        if (existingForUserProject.some((n) => n.readAt == null)) continue;
        const message = `No updates to Changes (RFI/SI/COR/CO/PCN) for **${projectName}** in over 5 days. Consider following up.`;
        await ctx.db.insert("documentReminderNotifications", {
          userId,
          projectId: pid,
          projectName,
          message,
          createdAt: now,
        });
        await emitNotificationInternal(
          ctx,
          userId,
          "project_change_followup",
          "Changes need follow-up",
          message,
          {
            projectId: pid,
            link: `/projects/${pid}/changes`,
          },
        );
      }

      const staleTitle = "Changes need follow-up";
      await emitPrincipalOverdueAlertToAll(ctx, {
        project,
        title: staleTitle,
        detailLine: `${projectName} — no RFI/SI/COR/CO/PCN activity in over 5 days.`,
        link: `/projects/${pid}/changes`,
      });
    }
  },
});

/** Called by cron: notify users who set personal stale-document reminders on change rows. */
export const processPersonalChangeReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const reminders = await ctx.db.query("documentPersonalReminders").collect();
    if (reminders.length === 0) return;

    const projectCache = new Map<string, Doc<"projects"> | null>();

    for (const reminder of reminders) {
      const doc = await ctx.db.get(reminder.documentId);
      if (!doc) {
        await ctx.db.delete(reminder._id);
        continue;
      }

      const lastActivity = Math.max(doc.updatedAt ?? doc.uploadedAt, doc.uploadedAt);
      const intervalMs = reminder.intervalDays * DAY_MS;
      if (now - lastActivity < intervalMs) continue;

      const lastNotifiedAt = reminder.lastNotifiedAt;
      if (lastNotifiedAt != null && now - lastNotifiedAt < intervalMs) continue;

      const projectKey = doc.projectId as string;
      let project = projectCache.get(projectKey);
      if (project === undefined) {
        project = await ctx.db.get(doc.projectId);
        projectCache.set(projectKey, project);
      }
      if (!project) continue;

      const normalizedType = doc.type.trim().toUpperCase();
      const slug = docKindToChangesSlug(normalizedType);
      const intervalLabel = formatReminderInterval(reminder.intervalDays);
      const projectName = project.name;
      const body = `${projectName}: ${normalizedType} "${doc.name}" has had no updates in ${intervalLabel}.`;

      await emitNotificationInternal(
        ctx,
        reminder.userId,
        "change_personal_reminder",
        `No updates: ${doc.name}`,
        body,
        {
          projectId: doc.projectId,
          link: `/projects/${doc.projectId}/changes/${slug}`,
        },
      );

      await ctx.db.patch(reminder._id, { lastNotifiedAt: now });
    }
  },
});

/** Called by cron: action-required reminders for open RFI/Submittal workflows when due date passes. */
export const createWorkflowDueDateReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const documents = await ctx.db.query("documents").collect();

    const dueDocs = documents.filter((d) => {
      const type = d.type.trim().toUpperCase();
      const isWorkflowType = type === "RFI" || type === "SUBMITTAL";
      const inferredWorkflowStatus = d.workflowStatus ?? (d.status === "paid" ? "closed" : "open");
      const isOpen = inferredWorkflowStatus === "open";
      const dueDate = d.workflowDueDate ?? d.createdDate ?? undefined;
      if (!isWorkflowType || !isOpen || dueDate == null) return false;
      if (dueDate > now) return false;
      const last = d.workflowLastDueReminderAt;
      // Send once per due date value.
      return last == null || last < dueDate;
    });

    if (dueDocs.length === 0) return;

    for (const doc of dueDocs) {
      const dueDate = doc.workflowDueDate ?? doc.createdDate ?? undefined;
      const inferredWorkflowStatus = doc.workflowStatus ?? (doc.status === "paid" ? "closed" : "open");
      const ball = (doc.ballInCourtUserIds ?? []) as Id<"users">[];
      if (ball.length === 0 || dueDate == null) continue;

      await emitActionRequiredToBallInCourt(ctx, {
        projectId: doc.projectId,
        documentId: doc._id,
        documentType: doc.type,
        documentName: doc.name,
        ballInCourtUserIds: ball,
        dueDate,
        alreadyDue: true,
      });

      await ctx.db.patch(doc._id, { workflowLastDueReminderAt: dueDate });
      await ctx.db.insert("documentWorkflowEvents", {
        documentId: doc._id,
        eventType: "due_reminder_sent",
        actorUserId: undefined,
        fromWorkflowStatus: inferredWorkflowStatus,
        toWorkflowStatus: inferredWorkflowStatus,
        ballInCourtUserIds: ball,
        message: `Due-date reminder sent (due ${formatDate(dueDate)}).`,
        createdAt: now,
      });
    }
  },
});

/** Called by weekly cron: create a "Weekly update ready" notification for each user (dashboard access). */
export const createWeeklyUpdateNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await emitNotificationInternal(
        ctx,
        user._id,
        "weekly_update_ready",
        "Weekly update ready",
        "View daily reports from all projects this week.",
        { link: "/weekly" },
      );
    }
  },
});

/** Daily ~7pm CST / 8pm CDT: hourUTC 1 — nudge when no daily report task for CT today (active projects). */
export const createDailyReportMissingNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayKey = getDayKeyCentral(now);
    const projects = await ctx.db.query("projects").collect();
    const active = projects.filter((p) => p.status === "active");
    const tasks = await ctx.db.query("projectTasks").collect();

    for (const project of active) {
      const pid = project._id;
      const hasReportToday = tasks.some((t) => {
        if (t.projectId !== pid || t.dueDate == null) return false;
        const isDaily =
          t.isDailyReport === true ||
          t.createdFromPortal === true;
        if (!isDaily) return false;
        return dueTimestampToDayKeyCentral(t.dueDate) === todayKey;
      });
      if (hasReportToday) continue;
      if (project.lastDailyReportMissingNotifyDayKey === todayKey) continue;

      const recipients = [
        project.pmId,
        project.coordinatorId,
        project.siteSuperId,
      ].filter(Boolean) as Id<"users">[];
      if (recipients.length === 0) continue;

      const label = new Date(now).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
      for (const uid of [...new Set(recipients)]) {
        await emitNotificationInternal(
          ctx,
          uid,
          "daily_report_missing",
          `Daily report missing: ${project.name}`,
          `No daily report filed for ${label} (CT).`,
          { projectId: pid, link: `/projects/${pid}` },
        );
      }
      await ctx.db.patch(project._id, { lastDailyReportMissingNotifyDayKey: todayKey });
    }
  },
});

/** Morning CT-ish: hourUTC 13 — schedule tasks due tomorrow or overdue (excludes daily report rows). */
export const createTaskDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayKey = getDayKeyCentral(now);
    const tasks = await ctx.db.query("projectTasks").collect();
    const projectCache = new Map<Id<"projects">, Doc<"projects">>();

    for (const task of tasks) {
      if (task.status === "done" || task.dueDate == null) continue;
      if (task.isDailyReport === true || task.createdFromPortal === true) continue;

      const dueKey = dueTimestampToDayKeyCentral(task.dueDate);
      let project = projectCache.get(task.projectId);
      if (!project) {
        const p = await ctx.db.get(task.projectId);
        if (!p) continue;
        project = p;
        projectCache.set(task.projectId, p);
      }

      const recipients = [
        project.pmId,
        project.coordinatorId,
        task.ownerUserId,
      ].filter(Boolean) as Id<"users">[];
      const uniqueRecipients = [...new Set(recipients)];
      const scheduleLink = `/projects/${task.projectId}/schedule`;
      const dueLabel = new Date(task.dueDate).toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
      });

      if (dueKey === todayKey + DAY_MS) {
        if (task.lastTaskDueSoonNotifiedDayKey === todayKey) continue;
        for (const uid of uniqueRecipients) {
          await emitNotificationInternal(
            ctx,
            uid,
            "task_due_soon",
            `Task due tomorrow: ${task.title}`,
            `${project.name}: due ${dueLabel} (CT calendar).`,
            { projectId: task.projectId, link: scheduleLink },
          );
        }
        await ctx.db.patch(task._id, { lastTaskDueSoonNotifiedDayKey: todayKey });
      } else if (todayKey > dueKey) {
        if (task.lastTaskOverdueNotifiedDayKey === todayKey) continue;
        for (const uid of uniqueRecipients) {
          await emitNotificationInternal(
            ctx,
            uid,
            "task_overdue",
            `Task overdue: ${task.title}`,
            `${project.name}: was due ${dueLabel} (CT calendar).`,
            { projectId: task.projectId, link: scheduleLink },
          );
        }
        const overdueTitle = `Overdue task: ${task.title}`;
        await emitPrincipalOverdueAlertToAll(ctx, {
          project,
          title: overdueTitle,
          detailLine: `${project.name} — due ${dueLabel} (CT).`,
          link: scheduleLink,
        });
        await ctx.db.patch(task._id, { lastTaskOverdueNotifiedDayKey: todayKey });
      }
    }
  },
});

const DOCUMENT_EXPIRY_MILESTONES = [30, 14, 7] as const;

function complianceCategoryLabel(category?: string) {
  switch (category) {
    case "insurance":
      return "Insurance";
    case "wcb_wsib":
      return "WCB/WSIB";
    case "safety_certificate":
      return "Safety certificate";
    case "license":
      return "License";
    case "subtrade_compliance":
      return "Subtrade compliance";
    case "other":
      return "Compliance document";
    default:
      return "Document";
  }
}

/** Document expiry — 30 / 14 / 7 days before (CT calendar). */
export const createSafetyDocExpiryReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayKey = getDayKeyCentral(now);
    const employeeDocs = await ctx.db.query("safetyEmployeeDocuments").collect();
    const projectDocs = await ctx.db.query("documents").collect();
    const safetyUsers = (
      await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "safety"))
        .collect()
    ).map((u) => u._id as Id<"users">);
    const projectCache = new Map<Id<"projects">, Doc<"projects">>();

    async function getProject(projectId: Id<"projects">) {
      const cached = projectCache.get(projectId);
      if (cached) return cached;
      const project = await ctx.db.get(projectId);
      if (!project) return null;
      projectCache.set(projectId, project);
      return project;
    }

    for (const doc of employeeDocs) {
      if (doc.expiryDate == null || doc.expiryDate <= now) continue;
      const expiryKey = dueTimestampToDayKeyCentral(doc.expiryDate);
      const daysUntil = wholeDaysBetweenDayKeys(todayKey, expiryKey);
      const milestone = DOCUMENT_EXPIRY_MILESTONES.find((m) => m === daysUntil);
      if (milestone == null) continue;
      const sent = doc.expiryReminderMilestonesSent ?? [];
      if (sent.includes(milestone)) continue;

      const project = await getProject(doc.projectId);
      if (!project) continue;
      const pmPc = [
        project.pmId,
        project.coordinatorId,
      ].filter(Boolean) as Id<"users">[];
      const recipients = [...new Set([...safetyUsers, ...pmPc])];
      if (recipients.length === 0) continue;

      const expLabel = new Date(doc.expiryDate).toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
      });
      for (const uid of recipients) {
        await emitNotificationInternal(
          ctx,
          uid,
          "document_expiring",
          `Document expiring in ${milestone} days`,
          `${project.name}: "${doc.name}" (${doc.documentType}) expires ${expLabel}.`,
          {
            projectId: doc.projectId,
            link: `/safety/project/${doc.projectId}`,
          },
        );
      }
      await ctx.db.patch(doc._id, {
        expiryReminderMilestonesSent: [...sent, milestone],
      });
    }

    for (const doc of projectDocs) {
      if (doc.complianceCategory == null || doc.expiryDate == null || doc.expiryDate <= now) continue;
      const expiryKey = dueTimestampToDayKeyCentral(doc.expiryDate);
      const daysUntil = wholeDaysBetweenDayKeys(todayKey, expiryKey);
      const milestone = DOCUMENT_EXPIRY_MILESTONES.find((m) => m === daysUntil);
      if (milestone == null) continue;
      const sent = doc.expiryReminderMilestonesSent ?? [];
      if (sent.includes(milestone)) continue;

      const project = await getProject(doc.projectId);
      if (!project) continue;
      const recipients = [
        ...safetyUsers,
        project.pmId,
        project.coordinatorId,
      ].filter(Boolean) as Id<"users">[];
      const uniqueRecipients = [...new Set(recipients)];
      if (uniqueRecipients.length === 0) continue;

      const expLabel = new Date(doc.expiryDate).toLocaleDateString("en-US", {
        timeZone: "America/Chicago",
      });
      const category = complianceCategoryLabel(doc.complianceCategory);
      for (const uid of uniqueRecipients) {
        await emitNotificationInternal(
          ctx,
          uid,
          "document_expiring",
          `${category} expiring in ${milestone} days`,
          `${project.name}: "${doc.name}" expires ${expLabel}.`,
          {
            projectId: doc.projectId,
            link: `/projects/${doc.projectId}`,
          },
        );
      }
      await ctx.db.patch(doc._id, {
        expiryReminderMilestonesSent: [...sent, milestone],
      });
    }
  },
});

// ——— General in-app notifications for the bell ———

export const listRecentNotifications = query({
  args: { limit: v.optional(v.number()), includeRead: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const limit = args.limit ?? 20;
    const includeRead = args.includeRead ?? false;
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    const list = includeRead ? all : all.filter((n) => n.readAt == null);
    return list.slice(0, limit);
  },
});

/** Unread principal overdue popup alerts (oldest first for queue display). */
export const listPrincipalOverdueAlerts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return all
      .filter((n) => n.type === "principal_overdue_alert" && n.readAt == null)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const listNotificationsInRange = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) =>
        q.eq("userId", userId).gte("createdAt", args.startDate).lte("createdAt", args.endDate),
      )
      .order("desc")
      .collect();
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .collect();
    return all.filter((n) => n.readAt == null).length;
  },
});

export const markNotificationAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const doc = await ctx.db.get(args.notificationId);
    if (!doc) throw new Error("Notification not found");
    if (doc.userId !== userId) throw new Error("Not allowed");
    if (doc.readAt != null) return { ok: true as const };
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    return { ok: true as const };
  },
});

export const markAllNotificationsAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const list = await ctx.db
      .query("notifications")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    let marked = 0;
    for (const n of list) {
      if (n.readAt == null) {
        await ctx.db.patch(n._id, { readAt: now });
        marked += 1;
      }
    }
    return { marked };
  },
});

export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) return normalizePreferenceRow(existing);

    const defaults: Omit<PreferenceRow, "_id"> = {
      userId,
      projectContractsEnabled: true,
      projectChangesFollowupEnabled: true,
      boardroomBookingsEnabled: true,
      boardroomApprovalsEnabled: true,
      safetyChangesEnabled: true,
      adminBoardroomRequestsEnabled: true,
      taskDueRemindersEnabled: true,
      dailyReportRemindersEnabled: true,
      safetyDocExpiryRemindersEnabled: true,
      boardroomStatusUpdatesEnabled: true,
      principalOverdueAlertsEnabled: true,
      rfiActionRequiredEnabled: true,
      submittalActionRequiredEnabled: true,
      weeklyUpdateEnabled: true,
      tradeLoginSetupRequiredEnabled: true,
      personalChangeRemindersEnabled: true,
    };
    return defaults;
  },
});

export const updatePreferences = mutation({
  args: {
    projectContractsEnabled: v.optional(v.boolean()),
    projectChangesFollowupEnabled: v.optional(v.boolean()),
    boardroomBookingsEnabled: v.optional(v.boolean()),
    boardroomApprovalsEnabled: v.optional(v.boolean()),
    safetyChangesEnabled: v.optional(v.boolean()),
    adminBoardroomRequestsEnabled: v.optional(v.boolean()),
    taskDueRemindersEnabled: v.optional(v.boolean()),
    dailyReportRemindersEnabled: v.optional(v.boolean()),
    safetyDocExpiryRemindersEnabled: v.optional(v.boolean()),
    boardroomStatusUpdatesEnabled: v.optional(v.boolean()),
    principalOverdueAlertsEnabled: v.optional(v.boolean()),
    rfiActionRequiredEnabled: v.optional(v.boolean()),
    submittalActionRequiredEnabled: v.optional(v.boolean()),
    weeklyUpdateEnabled: v.optional(v.boolean()),
    tradeLoginSetupRequiredEnabled: v.optional(v.boolean()),
    personalChangeRemindersEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const prefs = await getOrCreatePreferences(ctx, userId);
    const patch = Object.fromEntries(
      Object.entries(args).filter((entry): entry is [keyof PreferenceRow, boolean] => {
        const [, value] = entry;
        return value !== undefined;
      }),
    ) as Partial<PreferenceRow>;
    if (Object.keys(patch).length === 0) return prefs._id;
    await ctx.db.patch(prefs._id, patch as Record<string, unknown>);
    await recordAuditLog(ctx, {
      action: "notifications.updatePreferences",
      resourceType: "notificationPreferences",
      resourceId: prefs._id,
    });
    return prefs._id;
  },
});
