import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { emitNotificationInternal } from "./notifications";
import { recordAuditLog } from "./auditLog";
import { internal } from "./_generated/api";
import {
  getDayKeyCentral,
  getWeekdayCentral,
  getMinuteOfDayCentral,
  expectedInFromDayKeyAndMinute,
} from "./lib/centralTime";
import { filterProjectsForUser } from "./lib/projectAccess";

function getPmPcRecipientIds(project: {
  pmId?: Id<"users">;
  coordinatorId?: Id<"users">;
}) {
  return [...new Set([project.pmId, project.coordinatorId].filter(Boolean) as Id<"users">[])];
}

/** Dashboard: projects with safety doc counts for card summary. */
export const getSafetyDashboardProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    let projects = await ctx.db.query("projects").withIndex("by_updated").order("desc").collect();
    projects = filterProjectsForUser(projects, userId, user);
    const allEmpDocs = await ctx.db.query("safetyEmployeeDocuments").collect();
    const allIncidents = await ctx.db.query("incidentReports").collect();
    const allEquipment = await ctx.db.query("equipmentInventory").collect();

    const empCountByProject = new Map<string, number>();
    const incCountByProject = new Map<string, number>();
    const eqCountByProject = new Map<string, number>();

    for (const d of allEmpDocs) {
      const id = d.projectId as string;
      empCountByProject.set(id, (empCountByProject.get(id) ?? 0) + 1);
    }
    for (const r of allIncidents) {
      const id = r.projectId as string;
      incCountByProject.set(id, (incCountByProject.get(id) ?? 0) + 1);
    }
    for (const e of allEquipment) {
      const id = e.projectId as string;
      eqCountByProject.set(id, (eqCountByProject.get(id) ?? 0) + 1);
    }

    return projects.map((project) => {
      const id = project._id as string;
      return {
        project,
        employeeDocCount: empCountByProject.get(id) ?? 0,
        incidentCount: incCountByProject.get(id) ?? 0,
        equipmentCount: eqCountByProject.get(id) ?? 0,
      };
    });
  },
});

// ——— Employee documents ———
export const listEmployeeDocumentsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const rows = await ctx.db
      .query("safetyEmployeeDocuments")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return rows.sort((a, b) => b.uploadedAt - a.uploadedAt);
  },
});

export const listEmployeeDocumentsBySubtrade = query({
  args: { projectId: v.id("projects"), subtradeId: v.id("projectSubtrades") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const rows = await ctx.db
      .query("safetyEmployeeDocuments")
      .withIndex("by_project_subtrade", (q) =>
        q.eq("projectId", args.projectId).eq("subtradeId", args.subtradeId)
      )
      .collect();
    return rows.sort((a, b) => b.uploadedAt - a.uploadedAt);
  },
});

export const addEmployeeDocument = mutation({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.optional(v.id("projectSubtrades")),
    employeeName: v.string(),
    documentType: v.string(),
    name: v.string(),
    fileUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    documentDate: v.optional(v.number()),
    expiryDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    let fileUrl: string | undefined;
    if (args.storageId) {
      const url = await ctx.storage.getUrl(args.storageId);
      if (!url) throw new Error("File not found");
      fileUrl = url;
    } else if (args.fileUrl?.trim()) {
      fileUrl = args.fileUrl.trim();
    }
    const now = Date.now();
    const documentId = await ctx.db.insert("safetyEmployeeDocuments", {
      projectId: args.projectId,
      subtradeId: args.subtradeId,
      employeeName: args.employeeName.trim() || "—",
      documentType: args.documentType,
      name: args.name.trim(),
      fileUrl,
      uploadedByUserId: userId,
      uploadedAt: now,
      documentDate: args.documentDate,
      expiryDate: args.expiryDate,
    });

    const project = await ctx.db.get(args.projectId);
    if (project) {
      const projectName = (project as { name?: string }).name ?? "Project";
      const recipientIds = getPmPcRecipientIds(project as { pmId?: Id<"users">; coordinatorId?: Id<"users"> });
      const fileNote = fileUrl ? "with file" : "record (no file yet)";
      for (const recipientId of recipientIds) {
        await emitNotificationInternal(
          ctx,
          recipientId,
          "safety_change",
          `${projectName} safety document uploaded`,
          `New ${args.documentType} document "${args.name}" for ${args.employeeName.trim() || "trade"} (${fileNote}).`,
          {
            projectId: args.projectId,
            link: `/safety/project/${args.projectId}`,
          },
        );
      }
    }

    await recordAuditLog(ctx, {
      action: "safety.addEmployeeDocument",
      resourceType: "safetyEmployeeDocuments",
      resourceId: documentId,
      summary: args.name,
    });
    return documentId;
  },
});

export const removeEmployeeDocument = mutation({
  args: { documentId: v.id("safetyEmployeeDocuments") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const row = await ctx.db.get(args.documentId);
    await ctx.db.delete(args.documentId);
    await recordAuditLog(ctx, {
      action: "safety.removeEmployeeDocument",
      resourceType: "safetyEmployeeDocuments",
      resourceId: args.documentId,
      summary: row?.name,
    });
    return args.documentId;
  },
});

// ——— Incident reports ———
export const listIncidentReportsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("incidentReports")
      .withIndex("by_project_date", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const getIncidentReportForProject = query({
  args: {
    projectId: v.id("projects"),
    reportId: v.id("incidentReports"),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report || report.projectId !== args.projectId) return null;
    const reporter = await ctx.db.get(report.reportedByUserId);
    const reporterDisplay =
      reporter?.name?.trim() ||
      reporter?.email?.trim() ||
      "Unknown";
    return {
      ...report,
      reporterDisplay,
    };
  },
});

const incidentReportTypeValidator = v.union(
  v.literal("near_miss"),
  v.literal("notice_of_violation"),
  v.literal("first_aid_log"),
  v.literal("incident_report"),
);

export const addIncidentReport = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    description: v.string(),
    date: v.number(),
    reportType: incidentReportTypeValidator,
    severity: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"))),
    status: v.optional(v.union(v.literal("open"), v.literal("investigating"), v.literal("resolved"))),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (args.clientMutationId?.trim()) {
      const key = args.clientMutationId.trim();
      const existing = await ctx.db
        .query("incidentReports")
        .withIndex("by_clientMutationId", (q) => q.eq("clientMutationId", key))
        .first();
      if (existing) return existing._id;
    }
    const now = Date.now();
    const reportId = await ctx.db.insert("incidentReports", {
      projectId: args.projectId,
      title: args.title,
      description: args.description,
      date: args.date,
      reportType: args.reportType,
      severity: args.severity,
      status: args.status ?? "open",
      reportedByUserId: userId,
      createdAt: now,
      clientMutationId: args.clientMutationId?.trim() || undefined,
    });

    // Notify safety users plus PM/PC for this project that a safety report was uploaded.
    const project = await ctx.db.get(args.projectId);
    if (project) {
      const safetyUsers = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "safety"))
        .collect();
      const dateLabel = new Date(args.date).toLocaleDateString();
      const projectName = (project as { name?: string }).name ?? "Project";
      const pmPcRecipientIds = getPmPcRecipientIds(project as { pmId?: Id<"users">; coordinatorId?: Id<"users"> });
      const recipientIds = [
        ...new Set([
          ...safetyUsers.map((u) => u._id as Id<"users">),
          ...pmPcRecipientIds,
        ]),
      ];
      for (const recipientId of recipientIds) {
        await emitNotificationInternal(
          ctx,
          recipientId,
          "safety_change",
          `${projectName} safety report uploaded`,
          `New safety report "${args.title}" on ${dateLabel}.`,
          {
            projectId: args.projectId,
            incidentId: reportId,
            link: `/safety/project/${args.projectId}`,
          },
        );
      }
    }

    await recordAuditLog(ctx, {
      action: "safety.addIncidentReport",
      resourceType: "incidentReports",
      resourceId: reportId,
      summary: args.title,
    });
    return reportId;
  },
});

export const updateIncidentReport = mutation({
  args: {
    reportId: v.id("incidentReports"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    date: v.optional(v.number()),
    reportType: v.optional(incidentReportTypeValidator),
    severity: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"))),
    status: v.optional(v.union(v.literal("open"), v.literal("investigating"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { reportId, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    if (Object.keys(filtered).length === 0) return reportId;
    await ctx.db.patch(reportId, filtered as Record<string, unknown>);
    return reportId;
  },
});

export const removeIncidentReport = mutation({
  args: { reportId: v.id("incidentReports") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const report = await ctx.db.get(args.reportId);
    await ctx.db.delete(args.reportId);
    await recordAuditLog(ctx, {
      action: "safety.removeIncidentReport",
      resourceType: "incidentReports",
      resourceId: args.reportId,
      summary: report?.title,
    });
    return args.reportId;
  },
});

// ——— Equipment inventory (legacy, kept for compatibility) ———
export const listEquipmentByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("equipmentInventory")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

/** List all equipment across projects for the Inventory sidebar page. */
export const listAllEquipment = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const equipment = await ctx.db.query("equipmentInventory").collect();
    equipment.sort((a, b) => b.addedAt - a.addedAt);
    const projectIds = [...new Set(equipment.map((e) => e.projectId))];
    const userIds = [...new Set(equipment.map((e) => e.addedByUserId))];
    const projectMap = new Map<string, { name: string }>();
    const userMap = new Map<string, { name?: string; email?: string }>();
    for (const id of projectIds) {
      const p = await ctx.db.get(id);
      if (p != null) projectMap.set(id, p);
    }
    for (const id of userIds) {
      const u = await ctx.db.get(id);
      if (u != null) userMap.set(id, u);
    }
    return equipment.map((e) => ({
      ...e,
      projectName: projectMap.get(e.projectId)?.name ?? "—",
      takenOutByName:
        (e as { takenOutByName?: string }).takenOutByName ??
        (() => {
          const u = userMap.get(e.addedByUserId);
          return u ? (u.name ?? u.email ?? "—") : "—";
        })(),
    }));
  },
});

export const addEquipment = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    category: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    location: v.optional(v.string()),
    lastInspectionDate: v.optional(v.number()),
    status: v.optional(v.union(v.literal("ok"), v.literal("maintenance"), v.literal("out_of_service"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    const eid = await ctx.db.insert("equipmentInventory", {
      projectId: args.projectId,
      name: args.name,
      category: args.category,
      serialNumber: args.serialNumber,
      location: args.location,
      lastInspectionDate: args.lastInspectionDate,
      status: args.status ?? "ok",
      notes: args.notes,
      addedByUserId: userId,
      addedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "safety.addEquipment",
      resourceType: "equipmentInventory",
      resourceId: eid,
      summary: args.name,
    });
    return eid;
  },
});

export const updateEquipment = mutation({
  args: {
    equipmentId: v.id("equipmentInventory"),
    projectId: v.optional(v.id("projects")),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    location: v.optional(v.string()),
    lastInspectionDate: v.optional(v.number()),
    status: v.optional(v.union(v.literal("ok"), v.literal("maintenance"), v.literal("out_of_service"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { equipmentId, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) filtered[k] = val;
    }
    if (Object.keys(filtered).length === 0) return equipmentId;
    await ctx.db.patch(equipmentId, filtered as Record<string, unknown>);
    const eq = await ctx.db.get(equipmentId);
    await recordAuditLog(ctx, {
      action: "safety.updateEquipment",
      resourceType: "equipmentInventory",
      resourceId: equipmentId,
      summary: eq?.name,
    });
    return equipmentId;
  },
});

export const removeEquipment = mutation({
  args: { equipmentId: v.id("equipmentInventory") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const eq = await ctx.db.get(args.equipmentId);
    await ctx.db.delete(args.equipmentId);
    await recordAuditLog(ctx, {
      action: "safety.removeEquipment",
      resourceType: "equipmentInventory",
      resourceId: args.equipmentId,
      summary: eq?.name,
    });
    return args.equipmentId;
  },
});

/** Public form (no auth): add equipment from /inventory-form. Uses Convex client so no CORS. */
export const addEquipmentFromForm = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    takenOutByName: v.optional(v.string()),
    dateTaken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) throw new Error("Equipment name is required");
    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    const botUserId = admin?._id ?? (await ctx.db.query("users").first())?._id;
    if (!botUserId) throw new Error("No user in system; create an admin user first.");
    const now = Date.now();
    const eid = await ctx.db.insert("equipmentInventory", {
      projectId: args.projectId,
      name: args.name.trim(),
      takenOutByName: args.takenOutByName?.trim() || undefined,
      addedByUserId: botUserId,
      addedAt: args.dateTaken ?? now,
    });
    await ctx.runMutation(internal.auditLog.insertInternal, {
      actorId: botUserId,
      action: "safety.addEquipmentFromForm",
      resourceType: "equipmentInventory",
      resourceId: eid,
      summary: args.name.trim(),
    });
    return eid;
  },
});

/** Called from HTTP webhook (e.g. JotForm) to add an equipment row without auth. */
export const addEquipmentFromWebhook = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    name: v.string(),
    takenOutByName: v.optional(v.string()),
    dateTaken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let projectId = args.projectId;
    if (!projectId && args.projectName?.trim()) {
      const byName = await ctx.db
        .query("projects")
        .filter((q) => q.eq(q.field("name"), args.projectName!.trim()))
        .first();
      if (!byName) throw new Error(`No project found with name "${args.projectName}"`);
      projectId = byName._id;
    }
    if (!projectId) throw new Error("Provide projectId or projectName");
    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    const botUserId = admin?._id ?? (await ctx.db.query("users").first())?._id;
    if (!botUserId) throw new Error("No user in system; create an admin user first.");
    const now = Date.now();
    return await ctx.db.insert("equipmentInventory", {
      projectId,
      name: args.name,
      takenOutByName: args.takenOutByName,
      addedByUserId: botUserId,
      addedAt: args.dateTaken ?? now,
    });
  },
});

// ——— Equipment catalog + checkouts (new inventory model) ———

/** List all equipment in the master catalog. */
export const listEquipmentCatalog = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.db
      .query("equipmentCatalog")
      .withIndex("by_name")
      .order("asc")
      .collect();
  },
});

export const addCatalogItem = mutation({
  args: {
    name: v.string(),
    serialNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    yearBought: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    const y = args.yearBought;
    const yearBought =
      y !== undefined && Number.isFinite(y) ? Math.floor(y) : undefined;
    if (yearBought !== undefined) {
      const maxY = new Date().getFullYear() + 1;
      if (yearBought < 1970 || yearBought > maxY) {
        throw new Error(`Year bought must be between 1970 and ${maxY}`);
      }
    }
    const cid = await ctx.db.insert("equipmentCatalog", {
      name: args.name.trim(),
      serialNumber: args.serialNumber?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      yearBought,
      isActive: true,
      createdAt: now,
    });
    await recordAuditLog(ctx, {
      action: "safety.addCatalogItem",
      resourceType: "equipmentCatalog",
      resourceId: cid,
      summary: args.name.trim(),
    });
    return cid;
  },
});

export const updateCatalogItem = mutation({
  args: {
    equipmentId: v.id("equipmentCatalog"),
    name: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    yearBought: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const { equipmentId, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val === undefined) continue;
      if (k === "name" && typeof val === "string") {
        filtered[k] = val.trim();
        continue;
      }
      if (k === "yearBought" && typeof val === "number") {
        const yearBought = Math.floor(val);
        const maxY = new Date().getFullYear() + 1;
        if (yearBought < 1970 || yearBought > maxY) {
          throw new Error(`Year bought must be between 1970 and ${maxY}`);
        }
        filtered[k] = yearBought;
        continue;
      }
      filtered[k] = val;
    }
    if (Object.keys(filtered).length === 0) return equipmentId;
    await ctx.db.patch(equipmentId, filtered as Record<string, unknown>);
    const item = await ctx.db.get(equipmentId);
    await recordAuditLog(ctx, {
      action: "safety.updateCatalogItem",
      resourceType: "equipmentCatalog",
      resourceId: equipmentId,
      summary: item?.name,
    });
    return equipmentId;
  },
});

export const removeCatalogItem = mutation({
  args: { equipmentId: v.id("equipmentCatalog") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const now = Date.now();
    const activeCheckouts = await ctx.db
      .query("equipmentCheckouts")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .filter((q) => q.eq(q.field("returnedAt"), undefined))
      .collect();
    for (const checkout of activeCheckouts) {
      await ctx.db.patch(checkout._id, { returnedAt: now });
      await recordAuditLog(ctx, {
        action: "safety.returnEquipmentCheckout",
        resourceType: "equipmentCheckouts",
        resourceId: checkout._id,
        summary: "Auto-returned when catalog item removed",
      });
    }
    const item = await ctx.db.get(args.equipmentId);
    await ctx.db.delete(args.equipmentId);
    await recordAuditLog(ctx, {
      action: "safety.removeCatalogItem",
      resourceType: "equipmentCatalog",
      resourceId: args.equipmentId,
      summary: item?.name,
    });
    return args.equipmentId;
  },
});

type EquipmentCheckoutKind = "fleet" | "rental" | "project";

type EquipmentCatalogSnapshot = {
  name: string;
  serialNumber?: string;
};

function resolveCheckoutKind(checkout: {
  kind?: EquipmentCheckoutKind;
  equipmentId?: Id<"equipmentCatalog">;
}): EquipmentCheckoutKind {
  if (checkout.kind) return checkout.kind;
  return checkout.equipmentId ? "fleet" : "rental";
}

async function loadEquipmentCatalogMap(
  ctx: { db: { get: (id: Id<"equipmentCatalog">) => Promise<EquipmentCatalogSnapshot | null> } },
  equipmentIds: Id<"equipmentCatalog">[],
) {
  const equipmentMap = new Map<string, EquipmentCatalogSnapshot>();
  for (const id of equipmentIds) {
    const e = await ctx.db.get(id);
    if (e) equipmentMap.set(id, { name: e.name, serialNumber: e.serialNumber });
  }
  return equipmentMap;
}

function enrichEquipmentCheckout<
  T extends {
    kind?: EquipmentCheckoutKind;
    equipmentId?: Id<"equipmentCatalog">;
    displayName?: string;
    projectId: Id<"projects">;
  },
>(
  checkout: T,
  equipmentMap: Map<string, EquipmentCatalogSnapshot>,
  projectMap?: Map<string, { name: string }>,
) {
  const kind = resolveCheckoutKind(checkout);
  let equipmentName: string;
  let equipmentSerialNumber: string | undefined;
  let catalogMissing = false;

  if (checkout.equipmentId) {
    const catalog = equipmentMap.get(checkout.equipmentId);
    equipmentName = catalog?.name ?? "—";
    equipmentSerialNumber = catalog?.serialNumber;
    catalogMissing = !catalog;
  } else {
    equipmentName = checkout.displayName?.trim() || "—";
    equipmentSerialNumber = undefined;
  }

  return {
    ...checkout,
    kind,
    equipmentName,
    equipmentSerialNumber,
    catalogMissing,
    projectName: projectMap?.get(checkout.projectId)?.name ?? "—",
  };
}

function uniqueCatalogIds(
  checkouts: Array<{ equipmentId?: Id<"equipmentCatalog"> }>,
): Id<"equipmentCatalog">[] {
  return [
    ...new Set(
      checkouts.map((c) => c.equipmentId).filter((id): id is Id<"equipmentCatalog"> => id != null),
    ),
  ];
}

/** List active (not yet returned) equipment checkouts across all projects. */
export const listActiveEquipmentCheckouts = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const checkouts = await ctx.db
      .query("equipmentCheckouts")
      .filter((q) => q.eq(q.field("returnedAt"), undefined))
      .order("desc")
      .collect();

    const equipmentMap = await loadEquipmentCatalogMap(ctx, uniqueCatalogIds(checkouts));
    const projectIds = [...new Set(checkouts.map((c) => c.projectId))];
    const projectMap = new Map<string, { name: string }>();
    for (const id of projectIds) {
      const p = await ctx.db.get(id);
      if (p) projectMap.set(id, p);
    }

    return checkouts.map((c) => enrichEquipmentCheckout(c, equipmentMap, projectMap));
  },
});

/** List returned (signed-in) equipment checkouts for history / available list. */
export const listReturnedEquipmentCheckouts = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const checkouts = await ctx.db
      .query("equipmentCheckouts")
      .filter((q) => q.neq(q.field("returnedAt"), undefined))
      .order("desc")
      .collect();

    const equipmentMap = await loadEquipmentCatalogMap(ctx, uniqueCatalogIds(checkouts));
    const projectIds = [...new Set(checkouts.map((c) => c.projectId))];
    const projectMap = new Map<string, { name: string }>();
    for (const id of projectIds) {
      const p = await ctx.db.get(id);
      if (p) projectMap.set(id, p);
    }

    return checkouts.map((c) => enrichEquipmentCheckout(c, equipmentMap, projectMap));
  },
});

/** Inventory form / external link: record an equipment checkout against a catalog item. */
export const addEquipmentCheckoutFromForm = mutation({
  args: {
    equipmentId: v.id("equipmentCatalog"),
    projectId: v.id("projects"),
    takenOutByName: v.optional(v.string()),
    dateTaken: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.equipmentId || !args.projectId) throw new Error("Equipment and project are required");
    if (args.clientMutationId?.trim()) {
      const key = args.clientMutationId.trim();
      const existing = await ctx.db
        .query("equipmentCheckouts")
        .withIndex("by_clientMutationId", (q) => q.eq("clientMutationId", key))
        .first();
      if (existing) return existing._id;
    }
    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    const botUserId = admin?._id ?? (await ctx.db.query("users").first())?._id;
    if (!botUserId) throw new Error("No user in system; create an admin user first.");
    const now = Date.now();
    const checkoutId = await ctx.db.insert("equipmentCheckouts", {
      kind: "fleet",
      equipmentId: args.equipmentId,
      projectId: args.projectId,
      takenOutByName: args.takenOutByName?.trim() || undefined,
      dateTaken: args.dateTaken ?? now,
      returnedAt: undefined,
      createdByUserId: botUserId,
      createdAt: now,
      clientMutationId: args.clientMutationId?.trim() || undefined,
    });
    await ctx.runMutation(internal.auditLog.insertInternal, {
      actorId: botUserId,
      action: "safety.addEquipmentCheckoutFromForm",
      resourceType: "equipmentCheckouts",
      resourceId: checkoutId,
    });
    return checkoutId;
  },
});

/** Mark an equipment checkout as returned (sign-in). */
export const returnEquipmentCheckout = mutation({
  args: { checkoutId: v.id("equipmentCheckouts") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    await ctx.db.patch(args.checkoutId, { returnedAt: Date.now() });
    await recordAuditLog(ctx, {
      action: "safety.returnEquipmentCheckout",
      resourceType: "equipmentCheckouts",
      resourceId: args.checkoutId,
    });
    return args.checkoutId;
  },
});

/** For per-project view: list active equipment checkouts on this project. */
export const listActiveEquipmentByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const checkouts = await ctx.db
      .query("equipmentCheckouts")
      .withIndex("by_project_active", (q) => q.eq("projectId", args.projectId).eq("returnedAt", undefined))
      .order("desc")
      .collect();

    const equipmentMap = await loadEquipmentCatalogMap(ctx, uniqueCatalogIds(checkouts));
    return checkouts.map((c) => enrichEquipmentCheckout(c, equipmentMap));
  },
});

/** Full project inventory log (active + returned). */
export const listEquipmentLogByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const checkouts = await ctx.db
      .query("equipmentCheckouts")
      .withIndex("by_project_dateTaken", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    const equipmentMap = await loadEquipmentCatalogMap(ctx, uniqueCatalogIds(checkouts));
    return checkouts.map((c) => enrichEquipmentCheckout(c, equipmentMap));
  },
});

/** Authenticated fleet checkout from a project inventory log. */
export const addFleetCheckoutToProject = mutation({
  args: {
    equipmentId: v.id("equipmentCatalog"),
    projectId: v.id("projects"),
    takenOutByName: v.optional(v.string()),
    dateTaken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const catalogItem = await ctx.db.get(args.equipmentId);
    if (!catalogItem) throw new Error("Equipment not found in catalog");
    if (catalogItem.isActive === false) throw new Error("Equipment is inactive in catalog");
    const now = Date.now();
    const checkoutId = await ctx.db.insert("equipmentCheckouts", {
      kind: "fleet",
      equipmentId: args.equipmentId,
      projectId: args.projectId,
      takenOutByName: args.takenOutByName?.trim() || undefined,
      dateTaken: args.dateTaken ?? now,
      returnedAt: undefined,
      createdByUserId: userId,
      createdAt: now,
    });
    await recordAuditLog(ctx, {
      action: "safety.addFleetCheckoutToProject",
      resourceType: "equipmentCheckouts",
      resourceId: checkoutId,
      summary: catalogItem.name,
    });
    return checkoutId;
  },
});

/** Add rental or project-specific equipment to a project log (rolls up to master on-site views). */
export const addProjectEquipmentEntry = mutation({
  args: {
    projectId: v.id("projects"),
    kind: v.union(v.literal("rental"), v.literal("project")),
    displayName: v.string(),
    rentalVendor: v.optional(v.string()),
    notes: v.optional(v.string()),
    takenOutByName: v.optional(v.string()),
    dateTaken: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const name = args.displayName.trim();
    if (!name) throw new Error("Equipment name is required");
    const now = Date.now();
    const checkoutId = await ctx.db.insert("equipmentCheckouts", {
      kind: args.kind,
      displayName: name,
      rentalVendor: args.rentalVendor?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      projectId: args.projectId,
      takenOutByName: args.takenOutByName?.trim() || undefined,
      dateTaken: args.dateTaken ?? now,
      returnedAt: undefined,
      createdByUserId: userId,
      createdAt: now,
    });
    await recordAuditLog(ctx, {
      action: "safety.addProjectEquipmentEntry",
      resourceType: "equipmentCheckouts",
      resourceId: checkoutId,
      summary: name,
    });
    return checkoutId;
  },
});

/** Remove a mistaken rental/project entry that was never returned. */
export const removeProjectEquipmentEntry = mutation({
  args: { checkoutId: v.id("equipmentCheckouts") },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const checkout = await ctx.db.get(args.checkoutId);
    if (!checkout) throw new Error("Entry not found");
    const kind = resolveCheckoutKind(checkout);
    if (kind === "fleet") throw new Error("Fleet checkouts must be marked returned, not deleted");
    if (checkout.returnedAt != null) throw new Error("Cannot delete a returned entry");
    await ctx.db.delete(args.checkoutId);
    await recordAuditLog(ctx, {
      action: "safety.removeProjectEquipmentEntry",
      resourceType: "equipmentCheckouts",
      resourceId: args.checkoutId,
      summary: checkout.displayName,
    });
    return args.checkoutId;
  },
});

// ——— Public job attendance (sign-in / sign-out) ———

export const listJobAttendanceByProjectDay = query({
  args: { projectId: v.id("projects"), dayKey: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project_day_signedAt", (q) =>
        q.eq("projectId", args.projectId).eq("dayKey", args.dayKey),
      )
      .order("asc")
      .collect();
  },
});

type JobAttendanceEvent = {
  subtradeId: Id<"projectSubtrades">;
  tradeName: string;
  workerName: string;
  action: "in" | "out";
  signedAt: number;
};

type AttendanceVisitStatus = "on_site" | "complete" | "in_only" | "out_only";

type AttendanceVisitRow = {
  workerName: string;
  tradeName: string;
  subtradeId: string;
  signedInAt?: number;
  signedOutAt?: number;
  status: AttendanceVisitStatus;
};

function visitStatusFromTimes(signedInAt?: number, signedOutAt?: number): AttendanceVisitStatus {
  if (signedInAt != null && signedOutAt == null) return "on_site";
  if (signedInAt != null && signedOutAt != null) return "complete";
  if (signedInAt != null) return "in_only";
  return "out_only";
}

function pairAttendanceVisitsFromEvents(events: JobAttendanceEvent[]): AttendanceVisitRow[] {
  const visits: Omit<AttendanceVisitRow, "status">[] = [];

  for (const ev of events) {
    if (ev.action === "in") {
      visits.push({
        workerName: ev.workerName,
        tradeName: ev.tradeName,
        subtradeId: String(ev.subtradeId),
        signedInAt: ev.signedAt,
      });
      continue;
    }

    let openIdx = -1;
    for (let i = visits.length - 1; i >= 0; i--) {
      if (visits[i].signedInAt != null && visits[i].signedOutAt == null) {
        openIdx = i;
        break;
      }
    }
    if (openIdx >= 0) {
      visits[openIdx] = { ...visits[openIdx], signedOutAt: ev.signedAt };
    } else {
      visits.push({
        workerName: ev.workerName,
        tradeName: ev.tradeName,
        subtradeId: String(ev.subtradeId),
        signedOutAt: ev.signedAt,
      });
    }
  }

  return visits.map((v) => ({
    ...v,
    status: visitStatusFromTimes(v.signedInAt, v.signedOutAt),
  }));
}

function computeWorkerAttendanceStatus(
  events: JobAttendanceEvent[],
  workerNameNormalized: string,
  subtradeId: Id<"projectSubtrades">,
) {
  const filtered = events
    .filter(
      (e) =>
        String(e.subtradeId) === String(subtradeId) &&
        normalizeWorkerName(e.workerName) === workerNameNormalized,
    )
    .sort((a, b) => a.signedAt - b.signedAt);

  const visits = pairAttendanceVisitsFromEvents(filtered);
  const openVisit = visits.find((v) => v.status === "on_site");

  return {
    suggestedAction: openVisit ? ("out" as const) : ("in" as const),
    isOnSite: !!openVisit,
    openSignedInAt: openVisit?.signedInAt,
  };
}

function pairAttendanceVisits(events: JobAttendanceEvent[]): AttendanceVisitRow[] {
  const groups = new Map<string, JobAttendanceEvent[]>();
  for (const ev of events) {
    const key = `${ev.subtradeId}||${normalizeWorkerName(ev.workerName)}`;
    const list = groups.get(key) ?? [];
    list.push(ev);
    groups.set(key, list);
  }

  const rows: AttendanceVisitRow[] = [];
  for (const groupEvents of groups.values()) {
    rows.push(
      ...pairAttendanceVisitsFromEvents(groupEvents.sort((a, b) => a.signedAt - b.signedAt)),
    );
  }

  return rows.sort((a, b) => {
    const ta = a.signedInAt ?? a.signedOutAt ?? 0;
    const tb = b.signedInAt ?? b.signedOutAt ?? 0;
    return ta - tb;
  });
}

/** Suggest sign-in vs sign-out for a worker on a given day (public, for external form). */
export const resolveJobAttendanceAction = query({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    workerName: v.string(),
    dayKey: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const workerNameNormalized = normalizeWorkerName(args.workerName);
    if (!workerNameNormalized) {
      return { suggestedAction: "in" as const, isOnSite: false, openSignedInAt: undefined };
    }

    const dayKey = args.dayKey ?? getDayKeyCentral(Date.now());
    const events = await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project_day_signedAt", (q) =>
        q.eq("projectId", args.projectId).eq("dayKey", dayKey),
      )
      .order("asc")
      .collect();

    return computeWorkerAttendanceStatus(events, workerNameNormalized, args.subtradeId);
  },
});

/** Visit rows (in/out pairs) for the master log table. */
export const listJobAttendanceVisitsByProjectDay = query({
  args: { projectId: v.id("projects"), dayKey: v.number() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project_day_signedAt", (q) =>
        q.eq("projectId", args.projectId).eq("dayKey", args.dayKey),
      )
      .order("asc")
      .collect();

    return pairAttendanceVisits(events);
  },
});

/** Latest sign-in/out rows for one trade (fed by the external job form → same table as master log). */
export const listRecentJobAttendanceBySubtrade = query({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const cap = Math.max(1, Math.min(args.limit ?? 12, 50));
    const logs = await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(800);
    return logs.filter((l) => l.subtradeId === args.subtradeId).slice(0, cap);
  },
});

export const listJobAttendanceHistoryDays = query({
  args: { projectId: v.id("projects"), limitDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limitDays = args.limitDays ?? 30;
    const logs = await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(2000);

    const countsByDay = new Map<number, number>();
    for (const l of logs) {
      countsByDay.set(l.dayKey, (countsByDay.get(l.dayKey) ?? 0) + 1);
    }

    return [...countsByDay.entries()]
      .map(([dayKey, count]) => ({ dayKey, count }))
      .sort((a, b) => b.dayKey - a.dayKey)
      .slice(0, limitDays);
  },
});

export const listRecentWorkersByProjectTrade = query({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.optional(v.id("projectSubtrades")),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
    const search = args.search ? normalizeWorkerName(args.search) : "";
    const logs = await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(2000);

    const grouped = new Map<
      string,
      {
        workerName: string;
        workerNameNormalized: string;
        count: number;
        latestSignedAt: number;
        tradeCounts: Map<string, { subtradeId: Id<"projectSubtrades">; tradeName: string; count: number }>;
      }
    >();

    for (const log of logs) {
      if (args.subtradeId && log.subtradeId !== args.subtradeId) continue;
      const workerNameNormalized = normalizeWorkerName(log.workerName);
      if (!workerNameNormalized) continue;
      if (search && !workerNameNormalized.includes(search)) continue;

      const key = workerNameNormalized;
      const existing = grouped.get(key);
      if (!existing) {
        const tradeCounts = new Map<string, { subtradeId: Id<"projectSubtrades">; tradeName: string; count: number }>();
        tradeCounts.set(String(log.subtradeId), {
          subtradeId: log.subtradeId,
          tradeName: log.tradeName,
          count: 1,
        });
        grouped.set(key, {
          workerName: log.workerName.trim(),
          workerNameNormalized,
          count: 1,
          latestSignedAt: log.signedAt,
          tradeCounts,
        });
      } else {
        existing.count += 1;
        existing.latestSignedAt = Math.max(existing.latestSignedAt, log.signedAt);
        const tradeKey = String(log.subtradeId);
        const trade = existing.tradeCounts.get(tradeKey);
        if (!trade) {
          existing.tradeCounts.set(tradeKey, {
            subtradeId: log.subtradeId,
            tradeName: log.tradeName,
            count: 1,
          });
        } else {
          trade.count += 1;
        }
      }
    }

    return [...grouped.values()]
      .map((g) => ({
        workerName: g.workerName,
        workerNameNormalized: g.workerNameNormalized,
        count: g.count,
        latestSignedAt: g.latestSignedAt,
        trades: [...g.tradeCounts.values()].sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.latestSignedAt - a.latestSignedAt;
      })
      .slice(0, limit);
  },
});

export const computeAttendancePredictionsForDay = internalMutation({
  args: {
    projectId: v.id("projects"),
    dayKey: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dayKey = args.dayKey ?? getDayKeyCentral(Date.now());
    const now = Date.now();
    const targetWeekday = getWeekdayCentral(dayKey);
    const historyStartTs = now - ATTENDANCE_HISTORY_WEEKS * 7 * 24 * 60 * 60_000;
    const logs = await ctx.db
      .query("jobAttendanceLogs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(5000);

    const historical = logs.filter(
      (l) => l.action === "in" && l.signedAt >= historyStartTs && l.dayKey < dayKey,
    );
    type Group = {
      workerName: string;
      workerNameNormalized: string;
      subtradeId: Id<"projectSubtrades">;
      tradeName: string;
      totalCount: number;
      sameWeekdayCount: number;
      minuteSamples: number[];
      sameWeekdayMinuteSamples: number[];
    };
    const grouped = new Map<string, Group>();
    for (const log of historical) {
      const workerNameNormalized = normalizeWorkerName(log.workerName);
      if (!workerNameNormalized) continue;
      const key = `${String(log.subtradeId)}||${workerNameNormalized}`;
      const weekday = getWeekdayCentral(log.signedAt);
      const minuteOfDay = getMinuteOfDayCentral(log.signedAt);
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          workerName: log.workerName.trim(),
          workerNameNormalized,
          subtradeId: log.subtradeId,
          tradeName: log.tradeName,
          totalCount: 1,
          sameWeekdayCount: weekday === targetWeekday ? 1 : 0,
          minuteSamples: [minuteOfDay],
          sameWeekdayMinuteSamples: weekday === targetWeekday ? [minuteOfDay] : [],
        });
      } else {
        existing.totalCount += 1;
        if (weekday === targetWeekday) existing.sameWeekdayCount += 1;
        existing.minuteSamples.push(minuteOfDay);
        if (weekday === targetWeekday) existing.sameWeekdayMinuteSamples.push(minuteOfDay);
      }
    }

    const existingPredictions = await ctx.db
      .query("jobAttendancePredictions")
      .withIndex("by_project_day", (q) => q.eq("projectId", args.projectId).eq("dayKey", dayKey))
      .collect();
    for (const row of existingPredictions) {
      await ctx.db.delete(row._id);
    }

    let created = 0;
    for (const g of grouped.values()) {
      if (g.totalCount < MIN_PREDICTION_OCCURRENCES) continue;
      const weekdayConfidence = g.sameWeekdayCount / Math.max(1, ATTENDANCE_HISTORY_WEEKS);
      const recurrenceConfidence = Math.min(1, g.totalCount / 12);
      const confidence = Number((weekdayConfidence * 0.7 + recurrenceConfidence * 0.3).toFixed(3));
      if (confidence < PREDICTION_CONFIDENCE_THRESHOLD) continue;
      const minuteEstimate = getMedian(
        g.sameWeekdayMinuteSamples.length > 0 ? g.sameWeekdayMinuteSamples : g.minuteSamples,
      );
      const expectedInAt = expectedInFromDayKeyAndMinute(dayKey, minuteEstimate);
      const rationale = `Seen ${g.sameWeekdayCount}/${ATTENDANCE_HISTORY_WEEKS} matching weekdays; ${g.totalCount} sign-ins in ${ATTENDANCE_HISTORY_WEEKS} weeks.`;
      await ctx.db.insert("jobAttendancePredictions", {
        projectId: args.projectId,
        dayKey,
        workerName: g.workerName,
        workerNameNormalized: g.workerNameNormalized,
        subtradeId: g.subtradeId,
        tradeName: g.tradeName,
        expectedInAt,
        confidence,
        rationale,
        status: "expected",
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
    return { dayKey, created };
  },
});

export const refreshAttendancePredictions = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    dayKey: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dayKey = args.dayKey ?? getDayKeyCentral(Date.now());
    const projectIds = args.projectId
      ? [args.projectId]
      : (await ctx.db.query("projects").collect()).map((p) => p._id);
    let refreshedProjects = 0;
    for (const projectId of projectIds) {
      await ctx.runMutation(internal.safety.computeAttendancePredictionsForDay, {
        projectId,
        dayKey,
      });
      refreshedProjects += 1;
    }
    return { dayKey, refreshedProjects };
  },
});

export const listAttendancePredictionsByProjectDay = query({
  args: { projectId: v.id("projects"), dayKey: v.number() },
  handler: async (ctx, args) => {
    await getAuthUserId(ctx);
    const [predictions, dayLogs] = await Promise.all([
      ctx.db
        .query("jobAttendancePredictions")
        .withIndex("by_project_day_confidence", (q) => q.eq("projectId", args.projectId).eq("dayKey", args.dayKey))
        .order("desc")
        .collect(),
      ctx.db
        .query("jobAttendanceLogs")
        .withIndex("by_project_day", (q) => q.eq("projectId", args.projectId).eq("dayKey", args.dayKey))
        .collect(),
    ]);
    const nowTs = Date.now();
    const signedInSet = new Set<string>();
    const signedOutSet = new Set<string>();
    for (const log of dayLogs) {
      const key = `${String(log.subtradeId)}||${normalizeWorkerName(log.workerName)}`;
      if (log.action === "in") signedInSet.add(key);
      if (log.action === "out") signedOutSet.add(key);
    }
    return predictions.map((p) => {
      const key = `${String(p.subtradeId)}||${p.workerNameNormalized}`;
      const computedStatus = derivePredictionStatus({
        expectedInAt: p.expectedInAt,
        nowTs,
        hasSignedIn: signedInSet.has(key),
        hasSignedOut: signedOutSet.has(key),
      });
      return {
        ...p,
        computedStatus,
        isSignedIn: signedInSet.has(key),
        isSignedOut: signedOutSet.has(key),
      };
    });
  },
});

export const sendAttendanceNoShowNotifications = internalMutation({
  args: {
    dayKey: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dayKey = args.dayKey ?? getDayKeyCentral(Date.now());
    const nowTs = Date.now();
    const projects = await ctx.db.query("projects").collect();
    let sent = 0;

    for (const project of projects) {
      const [predictions, logs] = await Promise.all([
        ctx.db
          .query("jobAttendancePredictions")
          .withIndex("by_project_day", (q) => q.eq("projectId", project._id).eq("dayKey", dayKey))
          .collect(),
        ctx.db
          .query("jobAttendanceLogs")
          .withIndex("by_project_day", (q) => q.eq("projectId", project._id).eq("dayKey", dayKey))
          .collect(),
      ]);
      if (predictions.length === 0) continue;

      const signedInSet = new Set<string>();
      const signedOutSet = new Set<string>();
      for (const log of logs) {
        const key = `${String(log.subtradeId)}||${normalizeWorkerName(log.workerName)}`;
        if (log.action === "in") signedInSet.add(key);
        if (log.action === "out") signedOutSet.add(key);
      }

      const noShows = predictions.filter((p) => {
        const key = `${String(p.subtradeId)}||${p.workerNameNormalized}`;
        return (
          derivePredictionStatus({
            expectedInAt: p.expectedInAt,
            nowTs,
            hasSignedIn: signedInSet.has(key),
            hasSignedOut: signedOutSet.has(key),
          }) === "no_show"
        );
      });
      if (noShows.length === 0) continue;

      const safetyUsers = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("role"), "safety"))
        .collect();
      const recipientIds = [
        ...new Set(
          [project.pmId, project.coordinatorId, ...safetyUsers.map((u) => u._id)].filter(Boolean) as Id<"users">[],
        ),
      ];
      if (recipientIds.length === 0) continue;
      const topNames = noShows.slice(0, 5).map((n) => n.workerName).join(", ");
      const title = `${project.name} attendance no-show alert`;
      const body = `${noShows.length} expected worker(s) appear as no-show: ${topNames}${noShows.length > 5 ? ", ..." : ""}.`;
      for (const uid of recipientIds) {
        await emitNotificationInternal(
          ctx,
          uid,
          "safety_change",
          title,
          body,
          { projectId: project._id, link: `/safety/project/${project._id}/job-sign-in-out` },
        );
        sent += 1;
      }
    }
    return { dayKey, sent };
  },
});

export const recordJobAttendance = mutation({
  args: {
    projectId: v.id("projects"),
    subtradeId: v.id("projectSubtrades"),
    workerName: v.string(),
    action: v.union(v.literal("in"), v.literal("out")),
    /** Optional: allow callers to set exact event timestamp (epoch millis). */
    signedAt: v.optional(v.number()),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workerName = args.workerName.trim();
    if (!workerName) throw new Error("Name is required");
    if (args.clientMutationId?.trim()) {
      const key = args.clientMutationId.trim();
      const existing = await ctx.db
        .query("jobAttendanceLogs")
        .withIndex("by_clientMutationId", (q) => q.eq("clientMutationId", key))
        .first();
      if (existing) return existing._id;
    }

    const admin = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();
    const botUserId = admin?._id ?? (await ctx.db.query("users").first())?._id;
    if (!botUserId) throw new Error("No user in system; create an admin user first.");

    const [project, subtrade] = await Promise.all([ctx.db.get(args.projectId), ctx.db.get(args.subtradeId)]);
    if (!project) throw new Error("Project not found");
    if (!subtrade) throw new Error("Trade not found");
    if (subtrade.projectId !== args.projectId) throw new Error("Trade does not belong to this project");

    const signedAt = args.signedAt ?? Date.now();
    const dayKey = getDayKeyCentral(signedAt);

    const logId = await ctx.db.insert("jobAttendanceLogs", {
      projectId: args.projectId,
      projectNumber: project.name,
      subtradeId: args.subtradeId,
      tradeName: subtrade.name,
      workerName,
      action: args.action,
      signedAt,
      dayKey,
      createdByUserId: botUserId as Id<"users">,
      createdAt: Date.now(),
      clientMutationId: args.clientMutationId?.trim() || undefined,
    });
    await ctx.runMutation(internal.auditLog.insertInternal, {
      actorId: botUserId,
      action: "safety.recordJobAttendance",
      resourceType: "jobAttendanceLogs",
      resourceId: logId,
      summary: `${workerName} ${args.action}`,
    });
    if (args.action === "in") {
      const normalized = normalizeWorkerName(workerName);
      const prediction = await ctx.db
        .query("jobAttendancePredictions")
        .withIndex("by_project_day_worker", (q) =>
          q.eq("projectId", args.projectId).eq("dayKey", dayKey).eq("workerNameNormalized", normalized),
        )
        .first();
      if (prediction && prediction.subtradeId === args.subtradeId) {
        await ctx.db.patch(prediction._id, {
          status: "signed_in",
          updatedAt: Date.now(),
        });
      }
    }
    return logId;
  },
});

const ATTENDANCE_HISTORY_WEEKS = 8;
const MIN_PREDICTION_OCCURRENCES = 2;
const PREDICTION_CONFIDENCE_THRESHOLD = 0.45;
const LATE_GRACE_MINUTES = 45;

function normalizeWorkerName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getMedian(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function derivePredictionStatus(params: {
  expectedInAt: number;
  nowTs: number;
  hasSignedIn: boolean;
  hasSignedOut: boolean;
}) {
  if (params.hasSignedIn) return "signed_in" as const;
  const lateAt = params.expectedInAt + LATE_GRACE_MINUTES * 60_000;
  if (params.nowTs <= lateAt) return "expected" as const;
  const noShowAt = lateAt + 6 * 60 * 60_000;
  if (params.nowTs >= noShowAt && !params.hasSignedOut) return "no_show" as const;
  return "late" as const;
}
