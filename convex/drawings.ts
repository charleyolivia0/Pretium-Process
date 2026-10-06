import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { recordAuditLog } from "./auditLog";
import type { Id } from "./_generated/dataModel";
import { requireAuthenticatedProject } from "./lib/projectAccess";

type DbCtx = MutationCtx | QueryCtx;

async function assertProjectExists(ctx: DbCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

async function assertFolderInProject(ctx: DbCtx, folderId: Id<"drawingFolders">, projectId: Id<"projects">) {
  const folder = await ctx.db.get(folderId);
  if (!folder) throw new Error("Folder not found");
  if (folder.projectId !== projectId) {
    throw new Error("Folder does not belong to this project");
  }
  return folder;
}

export const listFoldersByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);
    const folders = await ctx.db
      .query("drawingFolders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return folders.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createFolder = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    parentFolderId: v.optional(v.id("drawingFolders")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAuthenticatedProject(ctx, args.projectId);

    const cleanedName = args.name.trim();
    if (!cleanedName) throw new Error("Folder name is required");

    if (args.parentFolderId) {
      await assertFolderInProject(ctx, args.parentFolderId, args.projectId);
    }

    const now = Date.now();
    const fid = await ctx.db.insert("drawingFolders", {
      projectId: args.projectId,
      name: cleanedName,
      parentFolderId: args.parentFolderId,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "drawings.createFolder",
      resourceType: "drawingFolders",
      resourceId: fid,
      summary: cleanedName,
    });
    return fid;
  },
});

export const updateDrawingFolder = mutation({
  args: {
    folderId: v.id("drawingFolders"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");
    await requireAuthenticatedProject(ctx, folder.projectId);

    const cleanedName = args.name.trim();
    if (!cleanedName) throw new Error("Folder name is required");

    // Prevent duplicate folder names within the same project.
    const siblings = await ctx.db
      .query("drawingFolders")
      .withIndex("by_project", (q) => q.eq("projectId", folder.projectId))
      .collect();

    const duplicate = siblings.some(
      (f) => f._id !== args.folderId && f.name.trim().toLowerCase() === cleanedName.toLowerCase(),
    );
    if (duplicate) throw new Error("Folder already exists");

    await ctx.db.patch(args.folderId, { name: cleanedName, updatedAt: Date.now() });
    await recordAuditLog(ctx, {
      action: "drawings.updateDrawingFolder",
      resourceType: "drawingFolders",
      resourceId: args.folderId,
      summary: cleanedName,
    });
    return args.folderId;
  },
});

export const deleteDrawingFolder = mutation({
  args: {
    folderId: v.id("drawingFolders"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");
    await requireAuthenticatedProject(ctx, folder.projectId);

    const now = Date.now();

    // Move all drawings back to project root (no folder).
    const drawingsInFolder = await ctx.db
      .query("drawings")
      .withIndex("by_project_folder_uploadedAt", (q) =>
        q.eq("projectId", folder.projectId).eq("folderId", args.folderId),
      )
      .collect();

    for (const d of drawingsInFolder) {
      await ctx.db.patch(d._id, { folderId: undefined, updatedAt: now });
    }

    // If this folder has children, detach them from the deleted parent.
    const childFolders = await ctx.db
      .query("drawingFolders")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", folder.projectId).eq("parentFolderId", args.folderId),
      )
      .collect();

    for (const child of childFolders) {
      await ctx.db.patch(child._id, { parentFolderId: undefined, updatedAt: now });
    }

    await ctx.db.delete(args.folderId);
    await recordAuditLog(ctx, {
      action: "drawings.deleteDrawingFolder",
      resourceType: "drawingFolders",
      resourceId: args.folderId,
      summary: folder.name,
    });
    return args.folderId;
  },
});

export const listDrawings = query({
  args: {
    projectId: v.id("projects"),
    folderId: v.optional(v.id("drawingFolders")),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);
    if (args.folderId) {
      await assertFolderInProject(ctx, args.folderId, args.projectId);
    }

    const drawings = args.folderId
      ? await ctx.db
          .query("drawings")
          .withIndex("by_project_folder_uploadedAt", (q) =>
            q.eq("projectId", args.projectId).eq("folderId", args.folderId),
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("drawings")
          .withIndex("by_project_uploadedAt", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .collect();

    return await Promise.all(
      drawings.map(async (drawing) => {
        const uploader = await ctx.db.get(drawing.uploadedByUserId);
        return {
          ...drawing,
          uploaderName: uploader?.name ?? uploader?.email ?? "Unknown",
        };
      }),
    );
  },
});

export const createDrawingRecord = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    notes: v.optional(v.string()),
    storageId: v.id("_storage"),
    folderId: v.optional(v.id("drawingFolders")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAuthenticatedProject(ctx, args.projectId);
    if (args.folderId) {
      await assertFolderInProject(ctx, args.folderId, args.projectId);
    }

    const cleanedName = args.name.trim();
    const cleanedNotes = args.notes?.trim() || undefined;
    if (!cleanedName) throw new Error("Drawing name is required");

    const fileUrl = await ctx.storage.getUrl(args.storageId);
    if (!fileUrl) throw new Error("File not found");

    const now = Date.now();
    const did = await ctx.db.insert("drawings", {
      projectId: args.projectId,
      folderId: args.folderId,
      name: cleanedName,
      notes: cleanedNotes,
      storageId: args.storageId,
      fileUrl,
      uploadedByUserId: userId,
      uploadedAt: now,
      updatedAt: now,
    });
    await recordAuditLog(ctx, {
      action: "drawings.createDrawingRecord",
      resourceType: "drawings",
      resourceId: did,
      summary: cleanedName,
    });
    return did;
  },
});

export const deleteDrawing = mutation({
  args: {
    drawingId: v.id("drawings"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedProject(ctx, args.projectId);

    const drawing = await ctx.db.get(args.drawingId);
    if (!drawing) throw new Error("Drawing not found");
    if (drawing.projectId !== args.projectId) {
      throw new Error("Drawing does not belong to this project");
    }

    const markup = await ctx.db
      .query("drawingMarkups")
      .withIndex("by_drawing", (q) => q.eq("drawingId", args.drawingId))
      .unique();
    if (markup) {
      await ctx.db.delete(markup._id);
    }

    await ctx.storage.delete(drawing.storageId);
    await ctx.db.delete(args.drawingId);

    await recordAuditLog(ctx, {
      action: "drawings.deleteDrawing",
      resourceType: "drawings",
      resourceId: args.drawingId,
      summary: drawing.name,
    });
    return args.drawingId;
  },
});
