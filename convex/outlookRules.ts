import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export type OutlookImportance = "high" | "medium" | "low";

export type OutlookClassification = {
  importance: OutlookImportance;
  tags: string[];
  /** Optional suggested folder label (e.g. \"Accounting\", \"Safety\"). */
  suggestedFolder?: string;
};

const KEYWORD_RULES: {
  pattern: RegExp;
  tag: string;
  importance?: OutlookImportance;
  suggestedFolder?: string;
}[] = [
  {
    pattern: /\b(invoice|payment|billing|accounts\s*payable)\b/i,
    tag: "Accounting",
    importance: "high",
    suggestedFolder: "Accounting",
  },
  {
    pattern: /\b(change order|CO#?\s*\d+)\b/i,
    tag: "ChangeOrder",
    importance: "high",
    suggestedFolder: "Changes",
  },
  {
    pattern: /\b(safety|incident|near miss|hazard)\b/i,
    tag: "Safety",
    importance: "high",
    suggestedFolder: "Safety",
  },
  {
    pattern: /\b(meeting|schedule|calendar|booking)\b/i,
    tag: "Scheduling",
    importance: "medium",
    suggestedFolder: "Scheduling",
  },
];

export function classifyEmail(subject: string | undefined, bodyPreview: string | undefined): OutlookClassification {
  const text = `${subject ?? ""} ${bodyPreview ?? ""}`;
  const tags = new Set<string>();
  let importance: OutlookImportance = "medium";
  let suggestedFolder: string | undefined;

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      tags.add(rule.tag);
      if (rule.importance === "high") {
        importance = "high";
      } else if (rule.importance === "low" && importance !== "high") {
        importance = "low";
      }
      if (!suggestedFolder && rule.suggestedFolder) {
        suggestedFolder = rule.suggestedFolder;
      }
    }
  }

  if (tags.size === 0) {
    // Default: lower importance for untagged general messages.
    importance = "low";
  }

  return {
    importance,
    tags: Array.from(tags),
    suggestedFolder,
  };
}

/**
 * Internal helper to persist a classified Outlook email record.
 */
export const saveClassifiedEmail = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    mailbox: v.string(),
    subject: v.optional(v.string()),
    from: v.optional(v.string()),
    receivedAt: v.number(),
    importance: v.optional(
      v.union(v.literal("high"), v.literal("medium"), v.literal("low"))
    ),
    tags: v.optional(v.array(v.string())),
    folder: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("classified"),
        v.literal("responded"),
        v.literal("error")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("outlookEmails")
      .withIndex("by_userId_receivedAt", (q) =>
        q.eq("userId", args.userId).eq("receivedAt", args.receivedAt)
      )
      .first();

    const doc = {
      userId: args.userId as Id<"users">,
      messageId: args.messageId,
      mailbox: args.mailbox,
      subject: args.subject,
      from: args.from,
      receivedAt: args.receivedAt,
      importance: args.importance,
      tags: args.tags,
      folder: args.folder,
      status: args.status ?? "classified",
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }

    return await ctx.db.insert("outlookEmails", {
      ...doc,
      createdAt: now,
    });
  },
});

