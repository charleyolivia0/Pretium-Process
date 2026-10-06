import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";

function cleanTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("Title is required");
  return title;
}

function cleanDescription(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validateTime(startTimeMinutes: number, durationMinutes: number) {
  if (!Number.isInteger(startTimeMinutes) || startTimeMinutes < 0 || startTimeMinutes >= 24 * 60) {
    throw new Error("Invalid start time");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    throw new Error("Duration must be between 15 and 480 minutes");
  }
}

const personalCalendarColorPreset = v.union(v.literal("emerald"), v.literal("blue"), v.literal("amber"));

export const listMyEvents = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.db
      .query("personalCalendarEvents")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerUserId", userId).gte("date", args.startDate).lte("date", args.endDate)
      )
      .collect();
  },
});

export const createMyEvent = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    date: v.number(),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    colorPreset: v.optional(personalCalendarColorPreset),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    validateTime(args.startTimeMinutes, args.durationMinutes);
    const now = Date.now();
    return await ctx.db.insert("personalCalendarEvents", {
      ownerUserId: userId,
      title: cleanTitle(args.title),
      description: cleanDescription(args.description),
      date: args.date,
      startTimeMinutes: args.startTimeMinutes,
      durationMinutes: args.durationMinutes,
      colorPreset: args.colorPreset ?? "emerald",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMyEvent = mutation({
  args: {
    eventId: v.id("personalCalendarEvents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    date: v.optional(v.number()),
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    colorPreset: v.optional(personalCalendarColorPreset),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.ownerUserId !== userId) throw new Error("Forbidden");

    const nextStart = args.startTimeMinutes ?? event.startTimeMinutes;
    const nextDuration = args.durationMinutes ?? event.durationMinutes;
    validateTime(nextStart, nextDuration);

    const patch: {
      title?: string;
      description?: string;
      date?: number;
      startTimeMinutes?: number;
      durationMinutes?: number;
      colorPreset?: "emerald" | "blue" | "amber";
      updatedAt?: number;
    } = {};
    if (args.title !== undefined) patch.title = cleanTitle(args.title);
    if (args.description !== undefined) patch.description = cleanDescription(args.description);
    if (args.date !== undefined) patch.date = args.date;
    if (args.startTimeMinutes !== undefined) patch.startTimeMinutes = args.startTimeMinutes;
    if (args.durationMinutes !== undefined) patch.durationMinutes = args.durationMinutes;
    if (args.colorPreset !== undefined) patch.colorPreset = args.colorPreset;
    if (Object.keys(patch).length === 0) return args.eventId;

    patch.updatedAt = Date.now();
    await ctx.db.patch(args.eventId, patch);
    await recordAuditLog(ctx, {
      action: "personalCalendar.updateMyEvent",
      resourceType: "personalCalendarEvents",
      resourceId: args.eventId,
      summary: event.title,
    });
    return args.eventId;
  },
});

export const deleteMyEvent = mutation({
  args: { eventId: v.id("personalCalendarEvents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.ownerUserId !== userId) throw new Error("Forbidden");
    await ctx.db.delete(args.eventId);
    await recordAuditLog(ctx, {
      action: "personalCalendar.deleteMyEvent",
      resourceType: "personalCalendarEvents",
      resourceId: args.eventId,
      summary: event.title,
    });
    return args.eventId;
  },
});
