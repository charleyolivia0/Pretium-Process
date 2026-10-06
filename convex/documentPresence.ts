import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { assertProjectAccess } from "./lib/projectAccess";

export const PRESENCE_TTL_MS = 45_000;
const STALE_CLEANUP_MS = 120_000;

export const resourceKindValidator = v.union(
  v.literal("document"),
  v.literal("drawing"),
  v.literal("sitePhoto"),
);

type ResourceKind = "document" | "drawing" | "sitePhoto";

async function assertPresenceResourceAccess(
  ctx: MutationCtx | QueryCtx,
  resourceKind: ResourceKind,
  resourceId: string,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Not authenticated");

  let projectId: Id<"projects"> | null = null;

  if (resourceKind === "document") {
    const doc = await ctx.db.get(resourceId as Id<"documents">);
    if (!doc) throw new Error("Document not found");
    projectId = doc.projectId;
  } else if (resourceKind === "drawing") {
    const drawing = await ctx.db.get(resourceId as Id<"drawings">);
    if (!drawing) throw new Error("Drawing not found");
    projectId = drawing.projectId;
  } else {
    const photo = await ctx.db.get(resourceId as Id<"projectSitePhotos">);
    if (!photo) throw new Error("Site photo not found");
    projectId = photo.projectId;
  }

  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  assertProjectAccess(project, userId, user);
}

async function pruneStaleForResource(
  ctx: MutationCtx,
  resourceKind: ResourceKind,
  resourceId: string,
) {
  const cutoff = Date.now() - STALE_CLEANUP_MS;
  const rows = await ctx.db
    .query("documentViewPresence")
    .withIndex("by_resource", (q) =>
      q.eq("resourceKind", resourceKind).eq("resourceId", resourceId),
    )
    .collect();
  for (const row of rows) {
    if (row.lastSeenAt < cutoff) {
      await ctx.db.delete(row._id);
    }
  }
}

export const touchPresence = mutation({
  args: {
    resourceKind: resourceKindValidator,
    resourceId: v.string(),
    pageIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await assertPresenceResourceAccess(ctx, args.resourceKind, args.resourceId, userId);

    const now = Date.now();
    const existing = await ctx.db
      .query("documentViewPresence")
      .withIndex("by_user_resource", (q) =>
        q
          .eq("userId", userId)
          .eq("resourceKind", args.resourceKind)
          .eq("resourceId", args.resourceId),
      )
      .unique();

    const patch: { lastSeenAt: number; pageIndex?: number } = { lastSeenAt: now };
    if (args.pageIndex !== undefined) {
      patch.pageIndex = args.pageIndex;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("documentViewPresence", {
        resourceKind: args.resourceKind,
        resourceId: args.resourceId,
        userId,
        lastSeenAt: now,
        pageIndex: args.pageIndex,
      });
    }

    await pruneStaleForResource(ctx, args.resourceKind, args.resourceId);
  },
});

export const leavePresence = mutation({
  args: {
    resourceKind: resourceKindValidator,
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const existing = await ctx.db
      .query("documentViewPresence")
      .withIndex("by_user_resource", (q) =>
        q
          .eq("userId", userId)
          .eq("resourceKind", args.resourceKind)
          .eq("resourceId", args.resourceId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const listActiveViewers = query({
  args: {
    resourceKind: resourceKindValidator,
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    try {
      await assertPresenceResourceAccess(ctx, args.resourceKind, args.resourceId, userId);
    } catch {
      return [];
    }

    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const rows = await ctx.db
      .query("documentViewPresence")
      .withIndex("by_resource", (q) =>
        q.eq("resourceKind", args.resourceKind).eq("resourceId", args.resourceId),
      )
      .collect();

    const active = rows.filter((r) => r.lastSeenAt >= cutoff);
    const out = [];
    for (const row of active) {
      const user = await ctx.db.get(row.userId);
      out.push({
        userId: row.userId,
        name: user?.name?.trim() || user?.email?.trim() || "Unknown",
        pageIndex: row.pageIndex,
        lastSeenAt: row.lastSeenAt,
      });
    }
    return out;
  },
});
