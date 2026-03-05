import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const RECORD_TYPES = ["invoice", "payment", "change_order", "cost_code_entry"] as const;

async function requireAccountingOrAdmin(ctx: { db: { get: (id: unknown) => Promise<{ role?: string } | null> } }) {
  // getAuthUserId accepts Convex query/mutation context
  const userId = await getAuthUserId(ctx as { auth: { getUserIdentity: () => Promise<unknown> } });
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  const role = user.role;
  if (role !== "accounting" && role !== "admin") {
    throw new Error("Only accounting or admin can modify records");
  }
  return userId;
}

export const listAccountingRecordsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("accountingRecords")
      .withIndex("by_project_date", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const createAccountingRecord = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(
      v.literal("invoice"),
      v.literal("payment"),
      v.literal("change_order"),
      v.literal("cost_code_entry")
    ),
    amount: v.number(),
    status: v.string(),
    date: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAccountingOrAdmin(ctx);
    if (args.amount < 0) throw new Error("Amount must be non-negative");
    return await ctx.db.insert("accountingRecords", {
      projectId: args.projectId,
      type: args.type,
      amount: args.amount,
      status: args.status,
      date: args.date,
      notes: args.notes,
      createdByUserId: userId,
    });
  },
});

export const updateAccountingRecord = mutation({
  args: {
    recordId: v.id("accountingRecords"),
    type: v.optional(v.union(
      v.literal("invoice"),
      v.literal("payment"),
      v.literal("change_order"),
      v.literal("cost_code_entry")
    )),
    amount: v.optional(v.number()),
    status: v.optional(v.string()),
    date: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccountingOrAdmin(ctx);
    const { recordId, ...updates } = args;
    if (updates.amount != null && updates.amount < 0) throw new Error("Amount must be non-negative");
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    if (Object.keys(filtered).length === 0) return recordId;
    await ctx.db.patch(recordId, filtered as Record<string, unknown>);
    return recordId;
  },
});
