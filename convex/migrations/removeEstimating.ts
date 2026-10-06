import { internalMutation } from "../_generated/server";

/** One-time: reassign estimating users and remove bid-deadline notifications. */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    let usersReassigned = 0;
    for (const user of await ctx.db.query("users").collect()) {
      if ((user.role as string | undefined) === "estimating") {
        await ctx.db.patch(user._id, { role: "coordinator" });
        usersReassigned++;
      }
    }

    let notificationsDeleted = 0;
    for (const n of await ctx.db.query("notifications").collect()) {
      if (n.type === "bid_deadline_approaching") {
        await ctx.db.delete(n._id);
        notificationsDeleted++;
      }
    }

    return { usersReassigned, notificationsDeleted };
  },
});
