import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { recordAuditLog } from "./auditLog";

const FORM_TYPE = v.union(
  v.literal("rfi"),
  v.literal("pcn"),
  v.literal("co"),
  v.literal("cor"),
  v.literal("si"),
  v.literal("submittal"),
  v.literal("po"),
);

const FIELD_KIND = v.union(
  v.literal("text"),
  v.literal("longtext"),
  v.literal("date"),
  v.literal("number"),
  v.literal("select"),
  v.literal("checkbox"),
);

const FIELD_SCHEMA = v.object({
  id: v.string(),
  label: v.string(),
  kind: FIELD_KIND,
  required: v.boolean(),
  options: v.optional(v.array(v.string())),
});

async function requireManageTemplates(ctx: MutationCtx | QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  const r = user?.role;
  if (r === "admin" || r === "project_manager" || r === "coordinator") return userId;
  throw new Error("Only project managers, coordinators, and admins can manage form templates");
}

const ALL_FORM_TYPES = [
  "rfi",
  "pcn",
  "co",
  "cor",
  "si",
  "submittal",
  "po",
] as const;

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const rows = await ctx.db.query("changeFormTemplates").collect();
    const byType = new Map(rows.map((row) => [row.type, row]));
    return ALL_FORM_TYPES.map((type) => {
      const row = byType.get(type);
      return {
        type,
        fields: row?.fields ?? [],
        updatedAt: row?.updatedAt ?? 0,
      };
    });
  },
});

export const getByType = query({
  args: { type: FORM_TYPE },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const row = await ctx.db
      .query("changeFormTemplates")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .unique();
    if (!row) {
      return { type: args.type, fields: [] as Array<{
        id: string;
        label: string;
        kind: "text" | "longtext" | "date" | "number" | "select" | "checkbox";
        required: boolean;
        options?: string[];
      }>, updatedAt: 0 };
    }
    return {
      type: row.type,
      fields: row.fields,
      updatedAt: row.updatedAt,
    };
  },
});

export const setForType = mutation({
  args: {
    type: FORM_TYPE,
    fields: v.array(FIELD_SCHEMA),
  },
  handler: async (ctx, args) => {
    const userId = await requireManageTemplates(ctx);
    const seenIds = new Set<string>();
    for (const f of args.fields) {
      const label = f.label.trim();
      if (!label) throw new Error("Field label is required");
      if (!f.id.trim()) throw new Error("Field id is required");
      if (seenIds.has(f.id)) throw new Error("Field ids must be unique");
      seenIds.add(f.id);
      if (f.kind === "select") {
        const opts = (f.options ?? []).map((o) => o.trim()).filter((o) => o.length > 0);
        if (opts.length === 0) {
          throw new Error(`Dropdown field "${label}" must have at least one option`);
        }
      }
    }
    const existing = await ctx.db
      .query("changeFormTemplates")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        fields: args.fields,
        updatedByUserId: userId,
        updatedAt: now,
      });
      await recordAuditLog(ctx, {
        action: "changeFormTemplates.update",
        resourceType: "changeFormTemplates",
        resourceId: existing._id,
        summary: `${args.type} (${args.fields.length} fields)`,
      });
      return existing._id;
    }
    const inserted = await ctx.db.insert("changeFormTemplates", {
      type: args.type,
      fields: args.fields,
      updatedByUserId: userId,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "changeFormTemplates.create",
      resourceType: "changeFormTemplates",
      resourceId: inserted,
      summary: `${args.type} (${args.fields.length} fields)`,
    });
    return inserted;
  },
});
