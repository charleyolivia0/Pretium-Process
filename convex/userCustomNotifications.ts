import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { emitNotificationInternal } from "./notifications";

const CHANGE_DOC_TYPES = ["RFI", "SI", "COR", "CO", "PCN"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const intervalDaysValidator = v.union(
  v.literal(3),
  v.literal(5),
  v.literal(7),
  v.literal(14),
);

const conditionTypeValidator = v.union(
  v.literal("project_changes_stale"),
  v.literal("document_stale"),
  v.literal("task_overdue"),
  v.literal("custom"),
);

function docKindToChangesSlug(docType: string) {
  const t = docType.trim().toUpperCase();
  if (t === "RFI") return "rfi";
  if (t === "SUBMITTAL") return "submittal";
  return t.toLowerCase();
}

function formatInterval(days: 3 | 5 | 7 | 14): string {
  if (days === 7) return "1 week";
  if (days === 14) return "2 weeks";
  return `${days} days`;
}

function conditionTypeLabel(type: string): string {
  if (type === "project_changes_stale") return "No project changes activity";
  if (type === "document_stale") return "No document updates";
  if (type === "task_overdue") return "Task overdue";
  if (type === "custom") return "Custom condition";
  return type;
}

async function enrichRow(ctx: QueryCtx, row: Doc<"userCustomNotifications">) {
  const project = row.projectId ? await ctx.db.get(row.projectId) : null;
  const document = row.documentId ? await ctx.db.get(row.documentId) : null;
  const task = row.taskId ? await ctx.db.get(row.taskId) : null;
  return {
    ...row,
    projectName: project?.name,
    documentName: document?.name,
    taskName: task?.title,
    conditionLabel: row.conditionType
      ? row.conditionType === "custom" && row.customConditionText
        ? row.customConditionText
        : conditionTypeLabel(row.conditionType)
      : undefined,
  };
}

export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("userCustomNotifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return Promise.all(rows.map((row) => enrichRow(ctx, row)));
  },
});

export const createScheduled = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    remindAt: v.number(),
    projectId: v.optional(v.id("projects")),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    if (args.remindAt <= Date.now()) throw new Error("Reminder time must be in the future");
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new Error("Project not found");
    }
    const now = Date.now();
    const link =
      args.link?.trim() ||
      (args.projectId ? `/projects/${args.projectId}` : undefined);
    return await ctx.db.insert("userCustomNotifications", {
      userId,
      kind: "scheduled",
      title,
      body: args.body?.trim() || undefined,
      link,
      projectId: args.projectId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      remindAt: args.remindAt,
    });
  },
});

export const createCondition = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    conditionType: conditionTypeValidator,
    projectId: v.optional(v.id("projects")),
    documentId: v.optional(v.id("documents")),
    taskId: v.optional(v.id("projectTasks")),
    intervalDays: intervalDaysValidator,
    customConditionText: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");

    if (args.conditionType === "project_changes_stale") {
      if (!args.projectId) throw new Error("Project is required for this rule");
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new Error("Project not found");
    }

    if (args.conditionType === "document_stale") {
      if (!args.documentId) throw new Error("Document is required for this rule");
      const doc = await ctx.db.get(args.documentId);
      if (!doc) throw new Error("Document not found");
    }

    let projectId = args.projectId;
    if (args.conditionType === "document_stale" && args.documentId) {
      const doc = await ctx.db.get(args.documentId);
      if (doc) projectId = doc.projectId;
    }
    if (args.conditionType === "task_overdue") {
      if (!args.taskId) throw new Error("Task is required for this rule");
      const task = await ctx.db.get(args.taskId);
      if (!task) throw new Error("Task not found");
      projectId = task.projectId;
    }

    if (args.conditionType === "custom") {
      const customText = args.customConditionText?.trim();
      if (!customText) throw new Error("Describe your custom condition");
    }

    const now = Date.now();
    let link = args.link?.trim();
    if (!link) {
      if (args.documentId) {
        const doc = await ctx.db.get(args.documentId);
        if (doc) {
          const slug = docKindToChangesSlug(doc.type);
          link = `/projects/${doc.projectId}/changes/${slug}`;
        }
      } else if (args.taskId) {
        const task = await ctx.db.get(args.taskId);
        if (task) link = `/projects/${task.projectId}/schedule`;
      } else if (projectId) {
        link = `/projects/${projectId}/changes`;
      }
    }

    return await ctx.db.insert("userCustomNotifications", {
      userId,
      kind: "condition",
      title,
      body: args.body?.trim() || undefined,
      link,
      projectId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      conditionType: args.conditionType,
      documentId: args.documentId,
      taskId: args.taskId,
      intervalDays: args.intervalDays,
      customConditionText:
        args.conditionType === "custom" ? args.customConditionText?.trim() : undefined,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("userCustomNotifications"),
    title: v.optional(v.string()),
    body: v.optional(v.union(v.string(), v.null())),
    remindAt: v.optional(v.number()),
    intervalDays: v.optional(intervalDaysValidator),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== userId) throw new Error("Not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Title is required");
      patch.title = title;
    }
    if (args.body !== undefined) {
      patch.body = args.body === null ? undefined : args.body.trim() || undefined;
    }
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    if (args.intervalDays !== undefined) patch.intervalDays = args.intervalDays;

    if (args.remindAt !== undefined) {
      if (row.kind !== "scheduled") throw new Error("Cannot change time on a condition rule");
      if (row.sentAt != null) throw new Error("This reminder has already been sent");
      if (args.remindAt <= Date.now()) throw new Error("Reminder time must be in the future");
      patch.remindAt = args.remindAt;
    }

    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const remove = mutation({
  args: { id: v.id("userCustomNotifications") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.id);
  },
});

async function emitCustomNotification(
  ctx: Parameters<typeof emitNotificationInternal>[0],
  row: Doc<"userCustomNotifications">,
  body: string,
) {
  await emitNotificationInternal(
    ctx,
    row.userId,
    "user_custom_notification",
    row.title,
    body,
    {
      link: row.link,
      projectId: row.projectId,
    },
  );
}

/** Hourly: fire user-scheduled one-time reminders. */
export const processScheduledReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("userCustomNotifications")
      .withIndex("by_kind_enabled", (q) => q.eq("kind", "scheduled").eq("enabled", true))
      .collect();

    for (const row of rows) {
      if (row.sentAt != null || row.remindAt == null) continue;
      if (row.remindAt > now) continue;
      const body = row.body ?? "Your scheduled reminder.";
      await emitCustomNotification(ctx, row, body);
      await ctx.db.patch(row._id, { sentAt: now, updatedAt: now });
    }
  },
});

function isChangeDocType(docType: string) {
  return CHANGE_DOC_TYPES.includes(
    docType.trim().toUpperCase() as (typeof CHANGE_DOC_TYPES)[number],
  );
}

async function evaluateProjectChangesStale(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  intervalDays: number,
): Promise<{ triggered: boolean; body: string }> {
  const docs = await ctx.db.query("documents").collect();
  const changeDocs = docs.filter(
    (d) => d.projectId === projectId && isChangeDocType(d.type),
  );
  if (changeDocs.length === 0) {
    return { triggered: false, body: "" };
  }
  const lastActivity = Math.max(
    ...changeDocs.map((d) => Math.max(d.updatedAt ?? d.uploadedAt, d.uploadedAt)),
  );
  const intervalMs = intervalDays * DAY_MS;
  if (Date.now() - lastActivity < intervalMs) {
    return { triggered: false, body: "" };
  }
  const project = await ctx.db.get(projectId);
  const projectName = project?.name ?? "Project";
  return {
    triggered: true,
    body: `${projectName}: no RFI/SI/COR/CO/PCN activity in ${formatInterval(intervalDays as 3 | 5 | 7 | 14)}.`,
  };
}

/** Daily: evaluate user condition-based notification rules. */
export const processConditionRules = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("userCustomNotifications")
      .withIndex("by_kind_enabled", (q) => q.eq("kind", "condition").eq("enabled", true))
      .collect();

    for (const row of rows) {
      if (!row.conditionType) continue;
      const intervalDays = row.intervalDays ?? 5;
      const intervalMs = intervalDays * DAY_MS;
      if (row.lastTriggeredAt != null && now - row.lastTriggeredAt < intervalMs) continue;

      let triggered = false;
      let body = row.body ?? "";

      if (row.conditionType === "project_changes_stale" && row.projectId) {
        const result = await evaluateProjectChangesStale(ctx, row.projectId, intervalDays);
        triggered = result.triggered;
        body = result.body || body;
      } else if (row.conditionType === "document_stale" && row.documentId) {
        const doc = await ctx.db.get(row.documentId);
        if (!doc) {
          await ctx.db.delete(row._id);
          continue;
        }
        const lastActivity = Math.max(doc.updatedAt ?? doc.uploadedAt, doc.uploadedAt);
        if (now - lastActivity >= intervalMs) {
          triggered = true;
          const project = await ctx.db.get(doc.projectId);
          const projectName = project?.name ?? "Project";
          const docType = doc.type.trim().toUpperCase();
          body =
            body ||
            `${projectName}: ${docType} "${doc.name}" has had no updates in ${formatInterval(intervalDays as 3 | 5 | 7 | 14)}.`;
        }
      } else if (row.conditionType === "task_overdue" && row.taskId) {
        const task = await ctx.db.get(row.taskId);
        if (!task) {
          await ctx.db.delete(row._id);
          continue;
        }
        if (task.status !== "done" && task.dueDate != null && task.dueDate < now) {
          triggered = true;
          const project = await ctx.db.get(task.projectId);
          const projectName = project?.name ?? "Project";
          const dueLabel = new Date(task.dueDate).toLocaleDateString("en-US", {
            timeZone: "America/Chicago",
          });
          body = body || `${projectName}: task "${task.title}" is overdue (due ${dueLabel}).`;
        }
      } else if (row.conditionType === "custom") {
        triggered = true;
        const customText = row.customConditionText?.trim();
        body =
          body ||
          (customText
            ? `Check your condition: ${customText}`
            : "Check your custom condition.");
      }

      if (!triggered) continue;
      await emitCustomNotification(ctx, row, body);
      await ctx.db.patch(row._id, { lastTriggeredAt: now, updatedAt: now });
    }
  },
});
