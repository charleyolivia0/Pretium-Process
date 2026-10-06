import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type ProjectAccessFields = Pick<Doc<"projects">, "pmId" | "siteSuperId" | "siteSupers">;
type UserAccessFields = Pick<Doc<"users">, "role" | "name" | "email">;

type ProjectTrackerVisibilityFields = Pick<Doc<"projects">, "inProjectTracker" | "inCloseOut">;

/** Jobs in Close Out or not yet promoted to tracker are hidden from Project Tracker lists. */
export function isVisibleInProjectTracker(project: ProjectTrackerVisibilityFields): boolean {
  return project.inProjectTracker !== false && project.inCloseOut !== true;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

/** Site superintendent is assigned by user id or listed in legacy siteSupers names. */
export function siteSuperCanAccessProject(
  project: ProjectAccessFields,
  userId: Id<"users">,
  user: Pick<UserAccessFields, "name" | "email"> | null | undefined,
): boolean {
  if (project.siteSuperId === userId) return true;
  const legacyNames = project.siteSupers ?? [];
  if (legacyNames.length === 0 || !user) return false;
  const identifiers = [user.name, user.email].filter((s): s is string => Boolean(s?.trim()));
  if (identifiers.length === 0) return false;
  const normalizedIds = new Set(identifiers.map(normalizeName));
  return legacyNames.some((n) => normalizedIds.has(normalizeName(n)));
}

export function filterProjectsForUser<T extends ProjectAccessFields>(
  projects: T[],
  userId: Id<"users">,
  user: UserAccessFields | null | undefined,
): T[] {
  if (!user) return [];
  if (user.role === "project_manager") {
    return projects.filter((p) => p.pmId === userId);
  }
  if (user.role === "site_superintendent") {
    return projects.filter((p) => siteSuperCanAccessProject(p, userId, user));
  }
  return projects;
}

export function userCanAccessProject(
  project: ProjectAccessFields,
  userId: Id<"users">,
  user: UserAccessFields | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "project_manager") {
    return project.pmId === userId;
  }
  if (user.role === "site_superintendent") {
    return siteSuperCanAccessProject(project, userId, user);
  }
  return true;
}

export function assertProjectAccess(
  project: ProjectAccessFields,
  userId: Id<"users">,
  user: UserAccessFields | null | undefined,
): void {
  if (!userCanAccessProject(project, userId, user)) {
    throw new Error("Not authorized to access this project");
  }
}

/** Require signed-in user with access to the given project. */
export async function requireAuthenticatedProject(
  ctx: MutationCtx | QueryCtx,
  projectId: Id<"projects">,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const user = await ctx.db.get(userId);
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  assertProjectAccess(project, userId, user);
  return { userId, user, project };
}
