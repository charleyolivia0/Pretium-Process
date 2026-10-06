import type { Id } from "../../convex/_generated/dataModel";

export function asProjectId(projectId: string | undefined): Id<"projects"> | undefined {
  return projectId ? (projectId as Id<"projects">) : undefined;
}

/** Cast a route param to a Convex project id, or return "skip" for conditional queries. */
export function projectQueryArgs(
  projectId: string | undefined,
): { projectId: Id<"projects"> } | "skip" {
  return projectId ? { projectId: projectId as Id<"projects"> } : "skip";
}

export function withProjectId<T extends Record<string, unknown>>(
  projectId: string | undefined,
  fields: T,
): ({ projectId: Id<"projects"> } & T) | "skip" {
  if (!projectId) return "skip";
  return { projectId: projectId as Id<"projects">, ...fields };
}

export function asSubtradeId(subtradeId: string | undefined): Id<"projectSubtrades"> | undefined {
  return subtradeId ? (subtradeId as Id<"projectSubtrades">) : undefined;
}

export function subtradeQueryArgs(
  projectId: string | undefined,
  subtradeId: string | undefined,
): { projectId: Id<"projects">; subtradeId: Id<"projectSubtrades"> } | "skip" {
  if (!projectId || !subtradeId) return "skip";
  return {
    projectId: projectId as Id<"projects">,
    subtradeId: subtradeId as Id<"projectSubtrades">,
  };
}
