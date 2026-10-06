import { query, mutation } from "./_generated/server";

import { v } from "convex/values";

import { getAuthUserId } from "@convex-dev/auth/server";

import { recordAuditLog } from "./auditLog";
import { requireAdmin } from "./lib/requireAdmin";



/** pathId -> default roles (matches AppLayout NAV_ITEM_ROLES + site_superintendent where applicable). */

const DEFAULT_ROLE_ACCESS: Record<string, string[]> = {

  dashboard: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  projects: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  close_out: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  todo: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal"],

  safety: ["safety", "admin", "principal"],

  inventory: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  boardroom: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal"],

  accounting: ["accounting", "admin", "principal"],

  email: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  admin: ["admin"],

  admin_users: ["admin"],

  admin_access: ["admin"],

  admin_job_access: ["admin"],

  /** /project-start-up */

  project_start_up: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  /** /drawings */

  drawings: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  /** /weekly, /weekly-updates */

  weekly: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  /** /personal-calendar */

  personal_calendar: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  /** /assistant (Chuck) */

  assistant: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

  /** /account */

  account: ["project_manager", "coordinator", "accounting", "safety", "admin", "principal", "site_superintendent"],

};



export const PATH_IDS = Object.keys(DEFAULT_ROLE_ACCESS) as string[];

/** Get role access for all paths. Any path without a stored row returns default. Used by Access page and AppLayout. */

export const getRoleAccess = query({

  args: {},

  handler: async (ctx) => {

    await getAuthUserId(ctx);

    const rows = await ctx.db.query("roleAccess").collect();

    const byPath = new Map(rows.map((r) => [r.pathId, r.roles]));

    return PATH_IDS.map((pathId) => ({

      pathId,

      roles: byPath.get(pathId) ?? DEFAULT_ROLE_ACCESS[pathId] ?? [],

    }));

  },

});



/** Admin-only: set which roles can access a path. */

export const setRoleAccess = mutation({

  args: {

    pathId: v.string(),

    roles: v.array(v.string()),

  },

  handler: async (ctx, args) => {

    await requireAdmin(ctx);

    if (!PATH_IDS.includes(args.pathId)) throw new Error("Invalid pathId");

    const existing = await ctx.db

      .query("roleAccess")

      .withIndex("pathId", (q) => q.eq("pathId", args.pathId))

      .unique();

    if (existing) {

      await ctx.db.patch(existing._id, { roles: args.roles });

    } else {

      await ctx.db.insert("roleAccess", { pathId: args.pathId, roles: args.roles });

    }

    await recordAuditLog(ctx, {

      action: "roleAccess.setRoleAccess",

      resourceType: "roleAccess",

      resourceId: args.pathId,

      summary: args.pathId,

    });

  },

});



/** Admin-only: get all user-path grants for the Access page (per-person access). */

export const getGrants = query({

  args: {},

  handler: async (ctx) => {

    await requireAdmin(ctx);

    const rows = await ctx.db.query("userAccess").collect();

    return rows.map((r) => ({ pathId: r.pathId, userId: r.userId }));

  },

});



/** Admin-only: set which users can access a path. Replaces all grants for that path. */

export const setUserAccess = mutation({

  args: {

    pathId: v.string(),

    userIds: v.array(v.id("users")),

  },

  handler: async (ctx, args) => {

    await requireAdmin(ctx);

    if (!PATH_IDS.includes(args.pathId)) throw new Error("Invalid pathId");

    const existing = await ctx.db

      .query("userAccess")

      .withIndex("pathId", (q) => q.eq("pathId", args.pathId))

      .collect();

    for (const row of existing) {

      await ctx.db.delete(row._id);

    }

    for (const userId of args.userIds) {

      await ctx.db.insert("userAccess", { pathId: args.pathId, userId });

    }

    await recordAuditLog(ctx, {

      action: "roleAccess.setUserAccess",

      resourceType: "userAccess",

      resourceId: args.pathId,

      summary: `${args.pathId} (${args.userIds.length} users)`,

    });

  },

});



/** PathIds the current user can access. If they have any userAccess rows, use only those; else fall back to role-based. */

export const getMyPathIds = query({

  args: {},

  handler: async (ctx) => {

    const userId = await getAuthUserId(ctx);

    if (!userId) return [];

    const user = await ctx.db.get(userId);

    const role = user?.role ?? "";

    // Admin should always have access to all paths, regardless of per-user grants.

    if (role === "admin") {

      return PATH_IDS;

    }

    const userAccessRows = await ctx.db

      .query("userAccess")

      .withIndex("userId_pathId", (q) => q.eq("userId", userId))

      .collect();

    if (userAccessRows.length > 0) {

      return [...new Set(userAccessRows.map((r) => r.pathId))];

    }

    const roleRows = await ctx.db.query("roleAccess").collect();

    const byPath = new Map(roleRows.map((r) => [r.pathId, r.roles]));

    const pathIds: string[] = [];

    for (const pathId of PATH_IDS) {

      const roles = byPath.get(pathId) ?? DEFAULT_ROLE_ACCESS[pathId] ?? [];

      if (roles.includes(role)) pathIds.push(pathId);

    }

    return pathIds;

  },

});

