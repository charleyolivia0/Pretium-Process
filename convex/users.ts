import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId, createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import { recordAuditLog } from "./auditLog";
import { requireAdmin } from "./lib/requireAdmin";
import { userCanAccessProject } from "./lib/projectAccess";

const ROLES = [
  "project_manager",
  "coordinator",
  "accounting",
  "safety",
  "admin",
  "principal",
  "site_superintendent",
] as const;

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

/** Self-heal auth/user linkage when auth succeeds but the users row is missing. */
export const repairCurrentUserProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) throw new Error("Not authenticated");

    const existing = await ctx.db.get(authUserId);
    if (existing) {
      return { status: "ok", userId: authUserId };
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authenticated identity missing");
    }

    const identityEmail =
      typeof identity.email === "string" ? identity.email.trim().toLowerCase() : undefined;
    const identityName = typeof identity.name === "string" ? identity.name.trim() : undefined;
    const defaultRole = "project_manager" as const;
    const now = Date.now();

    let targetUserId = authUserId;
    if (identityEmail) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identityEmail))
        .unique();
      if (byEmail) {
        targetUserId = byEmail._id;
      }
    }

    if (targetUserId === authUserId) {
      targetUserId = await ctx.db.insert("users", {
        email: identityEmail,
        name: identityName || identityEmail || "User",
        role: defaultRole,
        createdAt: now,
        lastLoginAt: now,
        isActive: true,
      });
    } else {
      await ctx.db.patch(targetUserId, { lastLoginAt: now });
    }

    const danglingAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", authUserId))
      .collect();
    for (const account of danglingAccounts) {
      await ctx.db.patch(account._id, { userId: targetUserId });
    }

    const danglingSessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", authUserId))
      .collect();
    for (const session of danglingSessions) {
      await ctx.db.patch(session._id, { userId: targetUserId });
    }

    return { status: "relinked", userId: targetUserId };
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      lastLoginAt: u.lastLoginAt,
      isActive: u.isActive ?? true,
    }));
  },
});

/** Admin-only: get a user's email (for setting temp password). */
export const getUserEmail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const u = await ctx.db.get(args.userId);
    if (!u || !u.email) throw new Error("User not found or has no email");
    return { email: u.email };
  },
});

const optionalClearString = v.optional(v.union(v.string(), v.null()));
const optionalClearNumber = v.optional(v.union(v.number(), v.null()));
const optionalClearStorageId = v.optional(v.union(v.id("_storage"), v.null()));

/** Admin-only: profile fields for the user detail page. */
export const getUserForAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const u = await ctx.db.get(args.userId);
    if (!u) return null;
    let resumeUrl: string | undefined;
    if (u.resumeStorageId) {
      resumeUrl = (await ctx.storage.getUrl(u.resumeStorageId)) ?? undefined;
    }
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      lastLoginAt: u.lastLoginAt,
      isActive: u.isActive ?? true,
      birthdayAt: u.birthdayAt,
      employmentStartAt: u.employmentStartAt,
      resumeStorageId: u.resumeStorageId,
      resumeUrl,
    };
  },
});

/** Admin-only: update phone, dates, and resume file for a user. Pass null to clear optional fields. */
export const updateUserAdminProfile = mutation({
  args: {
    userId: v.id("users"),
    phone: optionalClearString,
    birthdayAt: optionalClearNumber,
    employmentStartAt: optionalClearNumber,
    resumeStorageId: optionalClearStorageId,
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(args.userId);
    if (!existing) throw new Error("User not found");

    if (args.resumeStorageId !== undefined && existing.resumeStorageId) {
      const nextId = args.resumeStorageId;
      const removing = nextId === null;
      const replacing = nextId !== null && nextId !== existing.resumeStorageId;
      if (removing || replacing) {
        try {
          await ctx.storage.delete(existing.resumeStorageId);
        } catch {
          /* ignore missing blob */
        }
      }
    }

    const patch: {
      phone?: string | undefined;
      birthdayAt?: number | undefined;
      employmentStartAt?: number | undefined;
      resumeStorageId?: typeof existing.resumeStorageId;
    } = {};

    if (args.phone !== undefined) {
      patch.phone = args.phone === null ? undefined : args.phone.trim() || undefined;
    }
    if (args.birthdayAt !== undefined) {
      patch.birthdayAt = args.birthdayAt === null ? undefined : args.birthdayAt;
    }
    if (args.employmentStartAt !== undefined) {
      patch.employmentStartAt = args.employmentStartAt === null ? undefined : args.employmentStartAt;
    }
    if (args.resumeStorageId !== undefined) {
      patch.resumeStorageId = args.resumeStorageId === null ? undefined : args.resumeStorageId;
    }

    await ctx.db.patch(args.userId, patch);
    await recordAuditLog(ctx, {
      action: "users.updateUserAdminProfile",
      resourceType: "users",
      resourceId: args.userId,
      summary: existing.email ?? existing.name,
    });
    return args.userId;
  },
});

/** List users that can be assigned as PM, Coordinator, or Site Superintendent on projects (any authenticated user). */
export const listUsersForAssignment = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const users = await ctx.db.query("users").collect();
    const allowedRoles = [
      "project_manager",
      "coordinator",
      "admin",
      "principal",
      "site_superintendent",
      "accounting",
      "safety",
    ];
    return users
      .filter((u) => u.isActive !== false && u.role && allowedRoles.includes(u.role))
      .map((u) => ({
        _id: u._id,
        name: u.name ?? u.email ?? "Unnamed",
        role: u.role,
      }));
  },
});

/** List all active users that can be invited to meetings (any authenticated user). */
export const listUsersForMeetings = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => u.isActive !== false)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? u.email ?? "Unnamed",
        email: u.email,
        role: u.role,
      }));
  },
});

export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(...ROLES.map((r) => v.literal(r))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    // Prevent removing the last admin
    if (target.role === "admin" && args.role !== "admin") {
      const admins = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "admin"))
        .collect();
      if (admins.length <= 1) throw new Error("Cannot change role: at least one admin must remain.");
    }
    await ctx.db.patch(args.userId, { role: args.role });
    return args.userId;
  },
});

export const setUserActive = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const t = await ctx.db.get(args.userId);
    await ctx.db.patch(args.userId, { isActive: args.isActive });
    await recordAuditLog(ctx, {
      action: "users.setUserActive",
      resourceType: "users",
      resourceId: args.userId,
      summary: t ? `${t.email ?? t.name} (${args.isActive ? "active" : "inactive"})` : undefined,
    });
    return args.userId;
  },
});

/** Admin-only: delete a user and their auth data. Clears pmId/coordinatorId on projects. Cannot delete the last admin. */
export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target.role === "admin") {
      const admins = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "admin"))
        .collect();
      if (admins.length <= 1) throw new Error("Cannot delete the last admin.");
    }

    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const rt of refreshTokens) await ctx.db.delete(rt._id);
      const verifiers = await ctx.db
        .query("authVerifiers")
        .filter((q) => q.eq(q.field("sessionId"), session._id))
        .collect();
      for (const v of verifiers) await ctx.db.delete(v._id);
      await ctx.db.delete(session._id);
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const c of codes) await ctx.db.delete(c._id);
      await ctx.db.delete(account._id);
    }

    const projectsAsPm = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("pmId"), args.userId))
      .collect();
    for (const p of projectsAsPm) await ctx.db.patch(p._id, { pmId: undefined });
    const projectsAsCoord = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("coordinatorId"), args.userId))
      .collect();
    for (const p of projectsAsCoord) await ctx.db.patch(p._id, { coordinatorId: undefined });

    if (target.resumeStorageId) {
      try {
        await ctx.storage.delete(target.resumeStorageId);
      } catch {
        /* ignore missing blob */
      }
    }

    await recordAuditLog(ctx, {
      action: "users.deleteUser",
      resourceType: "users",
      resourceId: args.userId,
      summary: target.email ?? target.name,
    });
    await ctx.db.delete(args.userId);
    return args.userId;
  },
});

/** Admin-only: create a new user with email/password. Sign-up is disabled for the public; admins create accounts and share the password. */
export const createUser = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    role: v.union(...ROLES.map((r) => v.literal(r))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.current);
    if (!user || user.role !== "admin") throw new Error("Admin only");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters");
    await createAccount(ctx, {
      provider: "password",
      account: { id: args.email.trim().toLowerCase(), secret: args.password },
      profile: {
        email: args.email.trim().toLowerCase(),
        name: args.name.trim() || undefined,
        role: args.role,
      },
    });
    await ctx.runMutation(internal.auditLog.insertInternal, {
      actorId: user._id,
      action: "users.createUser",
      summary: args.email.trim().toLowerCase(),
    });
  },
});

/** Admin-only: set a temporary password for a user (e.g. for login checks). Password is not stored; show it once in the UI after calling. */
export const setTemporaryPassword = action({
  args: {
    userId: v.id("users"),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const current = await ctx.runQuery(api.users.current);
    if (!current || current.role !== "admin") throw new Error("Admin only");
    if (args.newPassword.length < 8) throw new Error("Password must be at least 8 characters");
    const { email } = await ctx.runQuery(api.users.getUserEmail, { userId: args.userId });
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.newPassword },
    });
  },
});

/** Add a project to the current user's favourites (PM/Coordinator dashboard). */
export const addFavourite = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!userCanAccessProject(project, userId, user)) {
      throw new Error("Not authorized to access this project");
    }
    const ids = user.favouriteProjectIds ?? [];
    if (ids.includes(args.projectId)) return userId;
    await ctx.db.patch(userId, {
      favouriteProjectIds: [...ids, args.projectId],
    });
    const proj = await ctx.db.get(args.projectId);
    await recordAuditLog(ctx, {
      action: "users.addFavourite",
      resourceType: "projects",
      resourceId: args.projectId,
      summary: proj?.name,
    });
    return userId;
  },
});

/** Remove a project from the current user's favourites. */
export const removeFavourite = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    const ids = (user.favouriteProjectIds ?? []).filter((id) => id !== args.projectId);
    await ctx.db.patch(userId, { favouriteProjectIds: ids });
    const proj = await ctx.db.get(args.projectId);
    await recordAuditLog(ctx, {
      action: "users.removeFavourite",
      resourceType: "projects",
      resourceId: args.projectId,
      summary: proj?.name,
    });
    return userId;
  },
});

/** Set the current user's profile image from an uploaded file (storageId). */
export const setUserImage = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("File not found");
    await ctx.db.patch(userId, { image: url });
    await recordAuditLog(ctx, {
      action: "users.setUserImage",
      resourceType: "users",
      resourceId: userId,
    });
    return userId;
  },
});

/** Clear the current user's profile image. */
export const removeUserImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    await ctx.db.patch(userId, { image: undefined });
    await recordAuditLog(ctx, {
      action: "users.removeUserImage",
      resourceType: "users",
      resourceId: userId,
    });
  },
});

/** Show or hide decorative mascots app-wide (Assistant Chuck header image is not affected). */
export const setMascotsEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    await ctx.db.patch(userId, { mascotsEnabled: args.enabled });
    return userId;
  },
});
