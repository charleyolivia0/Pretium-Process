import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { emitNotificationInternal } from "./notifications";
import { recordAuditLog } from "./auditLog";
import { requireAdmin } from "./lib/requireAdmin";

export const listApprovedForCalendar = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const currentUser = await ctx.db.get(userId);
    const bookings = await ctx.db
      .query("boardroomBookings")
      .withIndex("by_date", (q) =>
        q.gte("date", args.startDate).lte("date", args.endDate)
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();
    const filtered =
      currentUser?.role === "admin"
        ? bookings
        : bookings.filter(
            (b) =>
              b.requestedByUserId === userId ||
              (b.attendeeUserIds ?? []).some((id) => id === userId),
          );
    const withNames = await Promise.all(
      filtered.map(async (b) => {
        const user = await ctx.db.get(b.requestedByUserId);
        return {
          ...b,
          requestedByName: user?.name ?? user?.email ?? "Unknown",
          calendarEventType: "booking" as const,
        };
      })
    );

    return withNames.sort((a, b) => {
      if (a.date !== b.date) return a.date - b.date;
      return a.startTimeMinutes - b.startTimeMinutes;
    });
  },
});

/** Month/day for birthdays & anniversaries must be expanded in the browser so `date` keys match the calendar grid (local TZ). */
export const listMilestoneUsers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: u.name ?? u.email ?? "Team member",
      birthdayAt: u.birthdayAt,
      employmentStartAt: u.employmentStartAt,
    }));
  },
});

export const listMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("boardroomBookings")
      .withIndex("by_requested_by", (q) => q.eq("requestedByUserId", userId))
      .order("desc")
      .take(50);
    // Hide requests that have already been approved from the "My requests" list.
    return all.filter((b) => b.status !== "approved");
  },
});

export const listPendingForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    const pending = await ctx.db
      .query("boardroomBookings")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .collect();
    const withNames = await Promise.all(
      pending.map(async (b) => {
        const u = await ctx.db.get(b.requestedByUserId);
        return {
          ...b,
          requestedByName: u?.name ?? u?.email ?? "Unknown",
        };
      })
    );
    return withNames;
  },
});

export const pendingCountForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return 0;
    const pending = await ctx.db
      .query("boardroomBookings")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.length;
  },
});

export const createRequest = mutation({
  args: {
    date: v.number(),
    startTimeMinutes: v.number(),
    durationMinutes: v.number(),
    title: v.optional(v.string()),
    attendeeUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (args.durationMinutes < 15 || args.durationMinutes > 480)
      throw new Error("Duration must be between 15 and 480 minutes");
    if (args.startTimeMinutes < 0 || args.startTimeMinutes >= 24 * 60)
      throw new Error("Invalid start time");
    const now = Date.now();
    const uniqueAttendees =
      args.attendeeUserIds
        ?.filter((id) => id !== userId)
        .filter((id, idx, arr) => arr.indexOf(id) === idx) ?? [];
    const bookingId = await ctx.db.insert("boardroomBookings", {
      requestedByUserId: userId,
      date: args.date,
      startTimeMinutes: args.startTimeMinutes,
      durationMinutes: args.durationMinutes,
      title: args.title,
      attendeeUserIds: uniqueAttendees.length > 0 ? uniqueAttendees : undefined,
      status: "pending",
      createdAt: now,
    });

    const dateLabel = new Date(args.date).toLocaleDateString();
    const timeLabel = minutesToTime(args.startTimeMinutes);

    // Notify only the requester about the new booking request. Invited attendees get notified only when it's approved.
    await emitNotificationInternal(
      ctx,
      userId as Id<"users">,
      "boardroom_booking",
      "Boardroom request created",
      `Boardroom requested for ${dateLabel} at ${timeLabel}.`,
      { bookingId, link: "/boardroom" },
    );

    // Notify admins that there is a new boardroom request waiting.
    const admins = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
    for (const admin of admins) {
      await emitNotificationInternal(
        ctx,
        admin._id as Id<"users">,
        "boardroom_admin_new_request",
        "New boardroom request pending",
        `New boardroom request for ${dateLabel} at ${timeLabel} is waiting for review.`,
        { bookingId, link: "/boardroom" },
      );
    }

    await recordAuditLog(ctx, {
      action: "boardroom.createRequest",
      resourceType: "boardroomBookings",
      resourceId: bookingId,
    });
    return bookingId;
  },
});

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export const approveRequest = mutation({
  args: { bookingId: v.id("boardroomBookings") },
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "pending") throw new Error("Booking is not pending");
    await ctx.db.patch(args.bookingId, {
      status: "approved",
      approvedByUserId: adminId,
    });

    // Notify requester that their booking was approved.
    const dateLabel = new Date(booking.date).toLocaleDateString();
    const timeLabel = minutesToTime(booking.startTimeMinutes);
    await emitNotificationInternal(
      ctx,
      booking.requestedByUserId as Id<"users">,
      "boardroom_approved",
      "Boardroom request approved",
      `Boardroom booking for ${dateLabel} at ${timeLabel} was approved.`,
      { bookingId: args.bookingId, link: "/boardroom" },
    );

    // Notify attendees only when approved: "You've been invited to '[meeting title]'".
    const meetingTitle = booking.title?.trim() || `Boardroom meeting (${dateLabel} at ${timeLabel})`;
    const attendeeIds = (booking.attendeeUserIds ?? []) as Id<"users">[];
    for (const attendeeId of attendeeIds) {
      await emitNotificationInternal(
        ctx,
        attendeeId,
        "boardroom_approved",
        `You've been invited to "${meetingTitle}"`,
        `${dateLabel} at ${timeLabel}.`,
        { bookingId: args.bookingId, link: "/boardroom" },
      );
    }

    return args.bookingId;
  },
});

export const rejectRequest = mutation({
  args: { bookingId: v.id("boardroomBookings") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "pending") throw new Error("Booking is not pending");
    await ctx.db.patch(args.bookingId, { status: "rejected" });
    const dateLabel = new Date(booking.date).toLocaleDateString();
    const timeLabel = minutesToTime(booking.startTimeMinutes);
    await emitNotificationInternal(
      ctx,
      booking.requestedByUserId as Id<"users">,
      "boardroom_rejected",
      "Boardroom request rejected",
      `Your request for ${dateLabel} at ${timeLabel} was not approved.`,
      { bookingId: args.bookingId, link: "/boardroom" },
    );
    await recordAuditLog(ctx, {
      action: "boardroom.rejectRequest",
      resourceType: "boardroomBookings",
      resourceId: args.bookingId,
    });
    return args.bookingId;
  },
});

/** Requester can clear (remove) their own rejected request from "My requests". */
export const clearRejectedRequest = mutation({
  args: { bookingId: v.id("boardroomBookings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.requestedByUserId !== userId) throw new Error("You can only clear your own requests");
    if (booking.status !== "rejected") throw new Error("Only rejected requests can be cleared");
    await ctx.db.delete(args.bookingId);
    await recordAuditLog(ctx, {
      action: "boardroom.clearRejectedRequest",
      resourceType: "boardroomBookings",
      resourceId: args.bookingId,
    });
    return args.bookingId;
  },
});

/** Admin only: remove an approved booking from the calendar (deletes the booking). */
export const removeApprovedBooking = mutation({
  args: { bookingId: v.id("boardroomBookings") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "approved") throw new Error("Only approved bookings can be removed");
    await ctx.db.delete(args.bookingId);
    await recordAuditLog(ctx, {
      action: "boardroom.removeApprovedBooking",
      resourceType: "boardroomBookings",
      resourceId: args.bookingId,
    });
    return args.bookingId;
  },
});

/** Admin only: edit an approved booking (date, time, duration, title). */
export const updateApprovedBooking = mutation({
  args: {
    bookingId: v.id("boardroomBookings"),
    date: v.optional(v.number()),
    startTimeMinutes: v.optional(v.number()),
    durationMinutes: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status !== "approved") throw new Error("Only approved bookings can be edited");
    const prevDate = booking.date;
    const prevStart = booking.startTimeMinutes;
    const prevDuration = booking.durationMinutes;
    const updates: {
      date?: number;
      startTimeMinutes?: number;
      durationMinutes?: number;
      title?: string;
    } = {};
    if (args.date !== undefined) updates.date = args.date;
    if (args.startTimeMinutes !== undefined) {
      if (args.startTimeMinutes < 0 || args.startTimeMinutes >= 24 * 60) throw new Error("Invalid start time");
      updates.startTimeMinutes = args.startTimeMinutes;
    }
    if (args.durationMinutes !== undefined) {
      if (args.durationMinutes < 15 || args.durationMinutes > 480) throw new Error("Duration must be between 15 and 480 minutes");
      updates.durationMinutes = args.durationMinutes;
    }
    if (args.title !== undefined) updates.title = args.title;
    if (Object.keys(updates).length === 0) return args.bookingId;
    const scheduleChanged =
      (updates.date !== undefined && updates.date !== prevDate) ||
      (updates.startTimeMinutes !== undefined && updates.startTimeMinutes !== prevStart) ||
      (updates.durationMinutes !== undefined && updates.durationMinutes !== prevDuration);
    await ctx.db.patch(args.bookingId, updates);
    if (scheduleChanged) {
      const b = await ctx.db.get(args.bookingId);
      if (b) {
        const dateLabel = new Date(b.date).toLocaleDateString();
        const timeLabel = minutesToTime(b.startTimeMinutes);
        const body = `Updated to ${dateLabel} at ${timeLabel} (${b.durationMinutes} min).`;
        const recipientSet = new Set<Id<"users">>([
          b.requestedByUserId as Id<"users">,
          ...((b.attendeeUserIds ?? []) as Id<"users">[]),
        ]);
        for (const uid of recipientSet) {
          await emitNotificationInternal(
            ctx,
            uid,
            "boardroom_schedule_updated",
            "Boardroom booking rescheduled",
            body,
            { bookingId: args.bookingId, link: "/boardroom" },
          );
        }
      }
    }
    await recordAuditLog(ctx, {
      action: "boardroom.updateApprovedBooking",
      resourceType: "boardroomBookings",
      resourceId: args.bookingId,
    });
    return args.bookingId;
  },
});
