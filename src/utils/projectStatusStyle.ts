export type ProjectStatus = "planning" | "active" | "substantial_completion" | "closed";

/** Green scale: planning = lightest, closed = darkest */
const STATUS_STYLES: Record<ProjectStatus, { backgroundColor: string; color: string }> = {
  planning: { backgroundColor: "#dcfce7", color: "#166534" },
  active: { backgroundColor: "#bbf7d0", color: "#15803d" },
  substantial_completion: { backgroundColor: "#86efac", color: "#14532d" },
  closed: { backgroundColor: "#047857", color: "#fff" },
};

export function getProjectStatusStyle(status: string): { backgroundColor: string; color: string } {
  return STATUS_STYLES[status as ProjectStatus] ?? { backgroundColor: "#f3f4f6", color: "#374151" };
}
