/** In-app section ids (URL segment under `/projects/:projectId/`). */
export type ProjectDetailSection =
  | "summary"
  | "daily_reports"
  | "changes"
  | "subtrades"
  | "schedule"
  | "budget"
  | "inventory"
  | "safety"
  | "site_photos"
  | "miscellaneous";

const URL_SEGMENT: Record<Exclude<ProjectDetailSection, "summary">, string> = {
  daily_reports: "daily-reports",
  changes: "changes",
  subtrades: "subtrades",
  schedule: "schedule",
  budget: "budget",
  inventory: "inventory",
  safety: "safety",
  site_photos: "site-photos",
  miscellaneous: "miscellaneous",
};

/** Legacy `?tab=` values (same as old ALL_TABS entries that were in-page sections). */
export const LEGACY_TAB_QUERY_TO_PATH: Record<string, string> = {
  summary: "",
  tasks: URL_SEGMENT.daily_reports,
  submittals: "changes/submittal",
  subtrades: URL_SEGMENT.subtrades,
  schedule: URL_SEGMENT.schedule,
  inventory: URL_SEGMENT.inventory,
  site_photos: URL_SEGMENT.site_photos,
  changes: URL_SEGMENT.changes,
  budget: URL_SEGMENT.budget,
  miscellaneous: URL_SEGMENT.miscellaneous,
};

export function projectSectionPath(section: Exclude<ProjectDetailSection, "summary">): string {
  return URL_SEGMENT[section];
}

export function projectSectionHref(projectId: string, section: ProjectDetailSection): string {
  if (section === "summary") return `/projects/${projectId}`;
  return `/projects/${projectId}/${URL_SEGMENT[section]}`;
}

export function projectSubtradeDetailHref(projectId: string, subtradeId: string): string {
  return `/projects/${projectId}/subtrades/${subtradeId}`;
}

export function safetyJobSummaryHref(projectId: string): string {
  return `/safety?project=${projectId}`;
}

export function incidentReportAnchorId(reportId: string): string {
  return `incident-report-${reportId}`;
}

export function projectIncidentReportHref(projectId: string, reportId: string): string {
  return `/projects/${projectId}/incident-report/${reportId}`;
}

/** Second path segment under `/projects/:id/subtrades/:subtradeId`, or null on the list URL. */
export function parseSubtradesSubtradeId(pathname: string, projectId: string): string | null {
  const base = `/projects/${projectId}/subtrades`;
  if (pathname === base || pathname === `${base}/`) return null;
  if (!pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length + 1).split("/")[0]?.replace(/\/$/, "") ?? "";
  return rest || null;
}

/**
 * Resolves which in-page section to show for nested routes under `/projects/:id`.
 * Paths like `/projects/:id/changes/templates` or `/projects/:id/changes/rfi` still resolve to section `changes`.
 */
export function parseProjectSection(pathname: string, projectId: string | undefined): ProjectDetailSection | "invalid" {
  if (!projectId) return "invalid";
  const base = `/projects/${projectId}`;
  if (pathname === base || pathname === `${base}/`) return "summary";
  const prefix = `${base}/`;
  if (!pathname.startsWith(prefix)) return "invalid";
  const first = pathname.slice(prefix.length).split("/")[0]?.replace(/\/$/, "") ?? "";
  if (!first) return "summary";
  // Keep legacy URLs alive: `/projects/:id/tasks` now maps to daily reports.
  if (first === "tasks") return "daily_reports";
  const entry = Object.entries(URL_SEGMENT).find(([, seg]) => seg === first);
  if (!entry) return "invalid";
  return entry[0] as ProjectDetailSection;
}
