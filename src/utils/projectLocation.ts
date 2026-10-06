import type { Id } from "../../convex/_generated/dataModel";

/**
 * Resolves a project id from the current app URL when the user is on a project-scoped screen.
 * Includes Accounting’s `?project=` query (no project id in the path).
 */
export function projectIdFromAppLocation(pathname: string, search: string): Id<"projects"> | null {
  const path = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;

  if (path === "/accounting" || path.startsWith("/accounting/")) {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    const q = new URLSearchParams(raw).get("project");
    if (q) return q as Id<"projects">;
  }

  const patterns = [
    /^\/projects\/([^/]+)/,
    /^\/dashboard\/project\/([^/]+)/,
    /^\/drawings\/project\/([^/]+)/,
    /^\/close-out\/project\/([^/]+)/,
    /^\/safety\/project\/([^/]+)/,
    /^\/project-start-up\/summary\/([^/]+)/,
  ];

  for (const re of patterns) {
    const m = path.match(re);
    if (m?.[1]) return m[1] as Id<"projects">;
  }

  return null;
}
