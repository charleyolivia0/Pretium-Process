import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";
import { createInboxSubscription, renewSubscription, deleteSubscription } from "./graphClient";

const SUBSCRIPTION_MAX_LIFETIME_MINUTES = 60 * 24; // 24 hours; Graph enforces its own limits.

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("outlookSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsertSettings = mutation({
  args: {
    mailbox: v.string(),
    enabled: v.boolean(),
    processingMode: v.union(
      v.literal("sort_only"),
      v.literal("drafts"),
      v.literal("auto_send")
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();

    const existing = await ctx.db
      .query("outlookSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mailbox: args.mailbox,
        enabled: args.enabled,
        processingMode: args.processingMode,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("outlookSettings", {
      userId,
      mailbox: args.mailbox,
      enabled: args.enabled,
      processingMode: args.processingMode,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createOrRenewSubscription = mutation({
  args: {
    notificationUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const settings = await ctx.db
      .query("outlookSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!settings || !settings.enabled) {
      throw new Error("Outlook integration is not enabled for this user.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("outlookGraphSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    const expiresAt = now + SUBSCRIPTION_MAX_LIFETIME_MINUTES * 60 * 1000;
    const expirationDateTime = new Date(expiresAt).toISOString();

    if (existing && existing.status === "active" && existing.expiresAt - now > 10 * 60 * 1000) {
      // Renew slightly ahead of expiry.
      await renewSubscription(existing.subscriptionId, expirationDateTime);
      await ctx.db.patch(existing._id, {
        expiresAt,
        updatedAt: now,
      });
      await recordAuditLog(ctx, {
        action: "outlookSubscriptions.createOrRenewSubscription",
        resourceType: "outlookGraphSubscriptions",
        resourceId: existing._id,
        summary: "renew",
      });
      return existing.subscriptionId;
    }

    // Create a new subscription.
    const mailbox = settings.mailbox;
    const clientState = `user:${userId.toString()}`;
    const created = await createInboxSubscription({
      userPrincipalName: mailbox,
      notificationUrl: args.notificationUrl,
      expirationDateTime,
      clientState,
    });

    const subscriptionId: string = created.id;
    const resource: string = created.resource;

    if (existing) {
      await ctx.db.patch(existing._id, {
        subscriptionId,
        resource,
        notificationUrl: args.notificationUrl,
        clientState,
        expiresAt,
        status: "active",
        updatedAt: now,
      });
      await recordAuditLog(ctx, {
        action: "outlookSubscriptions.createOrRenewSubscription",
        resourceType: "outlookGraphSubscriptions",
        resourceId: existing._id,
        summary: "create",
      });
    } else {
      const subRow = await ctx.db.insert("outlookGraphSubscriptions", {
        userId,
        subscriptionId,
        resource,
        notificationUrl: args.notificationUrl,
        clientState,
        expiresAt,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await recordAuditLog(ctx, {
        action: "outlookSubscriptions.createOrRenewSubscription",
        resourceType: "outlookGraphSubscriptions",
        resourceId: subRow,
        summary: "create",
      });
    }

    return subscriptionId;
  },
});

export const disableSubscription = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("outlookGraphSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!existing) return;

    try {
      await deleteSubscription(existing.subscriptionId);
    } catch {
      // Ignore Graph errors when deleting; we'll still mark it disabled locally.
    }

    await ctx.db.patch(existing._id, {
      status: "expired",
      updatedAt: Date.now(),
    });
    await recordAuditLog(ctx, {
      action: "outlookSubscriptions.disableSubscription",
      resourceType: "outlookGraphSubscriptions",
      resourceId: existing._id,
    });
  },
});

/** Webhook auth: notification must match an active Graph subscription we created. */
export const verifyGraphNotification = internalQuery({
  args: {
    subscriptionId: v.string(),
    clientState: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("outlookGraphSubscriptions")
      .withIndex("by_subscriptionId", (q) => q.eq("subscriptionId", args.subscriptionId))
      .first();
    if (!row || row.status !== "active") return false;
    if (row.clientState && args.clientState !== row.clientState) return false;
    return true;
  },
});

