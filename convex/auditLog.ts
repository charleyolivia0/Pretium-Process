import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdmin } from "./lib/requireAdmin";

export async function recordAuditLog(
  ctx: MutationCtx,
  entry: {
    action: string;
    resourceType?: string;
    resourceId?: string;
    summary?: string;
  },
): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return;
  const user = await ctx.db.get(userId);
  const actorLabel =
    (user?.name && user.name.trim()) || user?.email?.trim() || String(userId);
  await ctx.db.insert("appAuditLogs", {
    actorId: userId,
    actorLabel,
    createdAt: Date.now(),
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId != null ? String(entry.resourceId) : undefined,
    summary: entry.summary,
  });
}

/** Called from actions (no mutation ctx) after verifying the acting admin. */
export const insertInternal = internalMutation({
  args: {
    actorId: v.id("users"),
    action: v.string(),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.actorId);
    const actorLabel =
      (user?.name && user.name.trim()) || user?.email?.trim() || String(args.actorId);
    await ctx.db.insert("appAuditLogs", {
      actorId: args.actorId,
      actorLabel,
      createdAt: Date.now(),
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId != null ? String(args.resourceId) : undefined,
      summary: args.summary,
    });
  },
});

/** Admin-only: recent entries. Returns a tagged result so the UI can show auth errors instead of failing silently. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { status: "unauthenticated" as const };
    }
    const user = await ctx.db.get(userId);
    if (!user || user.role !== "admin") {
      return { status: "forbidden" as const, yourRole: user?.role ?? null };
    }
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const all = await ctx.db.query("appAuditLogs").collect();
    const entries = all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    return { status: "ok" as const, entries };
  },
});

/** Admin-only: insert one test row to verify the audit pipeline (Convex deployed + auth). */
export const writeTestEntry = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await recordAuditLog(ctx, {
      action: "auditLog.writeTestEntry",
      summary: "Connectivity test",
    });
  },
});

/**
 * After a fresh Convex reset there is often no admin, so the audit UI never appears.
 * Call once: if zero users have role "admin", promote the current user to admin.
 */
export const bootstrapFirstAdminIfNone = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const users = await ctx.db.query("users").collect();
    const hasAdmin = users.some((u) => u.role === "admin");
    if (hasAdmin) {
      throw new Error("An admin already exists. Use Admin → Users to change roles.");
    }
    await ctx.db.patch(userId, { role: "admin" });
    await recordAuditLog(ctx, {
      action: "auditLog.bootstrapFirstAdminIfNone",
      summary: "First admin after empty deployment",
    });
    return { promoted: true as const };
  },
});

/** Any signed-in user: how many admins exist (for post-reset recovery UI). */
export const adminCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { authenticated: false as const, admins: 0, users: 0 };
    const users = await ctx.db.query("users").collect();
    const admins = users.filter((u) => u.role === "admin").length;
    return { authenticated: true as const, admins, users: users.length };
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("appAuditLogs")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
