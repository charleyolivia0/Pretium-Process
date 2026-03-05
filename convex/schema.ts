import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const USER_ROLES = [
  "project_manager",
  "coordinator",
  "accounting",
  "estimating",
  "safety",
  "admin",
] as const;

const PROJECT_STATUSES = [
  "planning",
  "active",
  "substantial_completion",
  "closed",
] as const;

const HEALTH_STATUSES = ["green", "amber", "red"] as const;

const TASK_STATUSES = ["not_started", "in_progress", "blocked", "done"] as const;

const TASK_CATEGORIES = [
  "safety",
  "coordination",
  "paperwork",
  "scheduling",
] as const;

const schema = defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.union(...USER_ROLES.map((r) => v.literal(r)))),
    createdAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  }).index("email", ["email"]),

  projects: defineTable({
    name: v.string(),
    clientName: v.string(),
    location: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.union(...PROJECT_STATUSES.map((s) => v.literal(s))),
    healthStatus: v.optional(v.union(...HEALTH_STATUSES.map((h) => v.literal(h)))),
    healthNotes: v.optional(v.string()),
    pmId: v.optional(v.id("users")),
    coordinatorId: v.optional(v.id("users")),
    budget: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_updated", ["updatedAt"]),

  projectTasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    description: v.optional(v.string()),
    ownerRole: v.optional(v.union(...USER_ROLES.map((r) => v.literal(r)))),
    ownerUserId: v.optional(v.id("users")),
    status: v.union(...TASK_STATUSES.map((s) => v.literal(s))),
    dueDate: v.optional(v.number()),
    category: v.optional(v.union(...TASK_CATEGORIES.map((c) => v.literal(c)))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  documents: defineTable({
    projectId: v.id("projects"),
    uploadedByUserId: v.id("users"),
    type: v.string(),
    name: v.string(),
    fileUrl: v.string(),
    uploadedAt: v.number(),
  }).index("by_project", ["projectId"]),

  accountingRecords: defineTable({
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
    createdByUserId: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_project_date", ["projectId", "date"]),
});

export default schema;
