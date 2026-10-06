/** Maps URL pathnames to roleAccess pathIds (longest prefix wins). */

export type SidebarLinkItem = {
  kind: "link";
  to: string;
  label: string;
  external?: boolean;
};

export type SidebarFolderItem = {
  kind: "folder";
  label: string;
  children: readonly SidebarLinkItem[];
};

export type SidebarItem = SidebarLinkItem | SidebarFolderItem;

const PATH_PREFIX_RULES: { prefix: string; pathId: string }[] = [
  { prefix: "/admin/job-access", pathId: "admin_job_access" },
  { prefix: "/admin/trade-logins", pathId: "admin" },
  { prefix: "/admin/access", pathId: "admin_access" },
  { prefix: "/admin/users", pathId: "admin_users" },
  { prefix: "/admin/permissions", pathId: "admin_users" },
  { prefix: "/project-start-up", pathId: "project_start_up" },
  { prefix: "/weekly-updates", pathId: "weekly" },
  { prefix: "/tasks/new", pathId: "todo" },
  { prefix: "/drawings/project", pathId: "drawings" },
  { prefix: "/drawings", pathId: "drawings" },
  { prefix: "/close-out", pathId: "close_out" },
  { prefix: "/safety/project", pathId: "safety" },
  { prefix: "/safety", pathId: "safety" },
  { prefix: "/personal-calendar", pathId: "personal_calendar" },
  { prefix: "/boardroom", pathId: "boardroom" },
  { prefix: "/inventory-form", pathId: "inventory" },
  { prefix: "/accounting", pathId: "accounting" },
  { prefix: "/weekly", pathId: "weekly" },
  { prefix: "/assistant", pathId: "assistant" },
  { prefix: "/email", pathId: "email" },
  { prefix: "/account", pathId: "account" },
  { prefix: "/inventory", pathId: "inventory" },
  { prefix: "/projects", pathId: "projects" },
  { prefix: "/dashboard", pathId: "dashboard" },
  { prefix: "/admin", pathId: "admin" },
].sort((a, b) => b.prefix.length - a.prefix.length);

/** Same as stripping hash from sidebar `to` values. */
export function stripNavHash(to: string): string {
  return to.split("#")[0];
}

export function pathIdForPathname(pathname: string): string | null {
  const path = pathname.split("#")[0];
  for (const { prefix, pathId } of PATH_PREFIX_RULES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return pathId;
  }
  return null;
}

export function pathIdForNavTo(to: string): string {
  return pathIdForPathname(stripNavHash(to)) ?? "dashboard";
}

const FALLBACK_PATH_ORDER: string[] = [
  "dashboard",
  "projects",
  "accounting",
  "safety",
  "close_out",
  "project_start_up",
  "drawings",
  "weekly",
  "todo",
  "inventory",
  "boardroom",
  "personal_calendar",
  "admin_users",
  "admin_access",
  "admin_job_access",
  "admin",
  "assistant",
  "email",
  "account",
];

export function isAdminPathId(pathId: string | null): boolean {
  return pathId === "admin" || pathId?.startsWith("admin_") === true;
}

function pathIdToDefaultUrl(pathId: string): string | undefined {
  switch (pathId) {
    case "dashboard":
      return "/dashboard";
    case "projects":
      return "/projects";
    case "accounting":
      return "/accounting";
    case "safety":
      return "/safety";
    case "close_out":
      return "/close-out";
    case "project_start_up":
      return "/project-start-up";
    case "drawings":
      return "/drawings";
    case "weekly":
      return "/weekly";
    case "todo":
      return "/tasks/new";
    case "inventory":
      return "/inventory";
    case "boardroom":
      return "/boardroom";
    case "personal_calendar":
      return "/personal-calendar";
    case "admin_users":
      return "/admin/users";
    case "admin_access":
      return "/admin/access";
    case "admin_job_access":
      return "/admin/job-access";
    case "admin":
      return "/admin/users";
    case "assistant":
      return "/assistant";
    case "email":
      return "/email";
    case "account":
      return "/account";
    default:
      return undefined;
  }
}

/** Sidebar / landing home path (matches DashboardRoute for non-admin roles). */
export function dashboardNavHomePath(roleForView: string | undefined): string {
  if (roleForView === "safety") return "/safety";
  if (roleForView === "accounting") return "/accounting";
  return "/dashboard";
}

/** Preferred post-login home for access redirects (admin stays on /dashboard unless viewing as another role). */
export function preferredLandingPathname(
  roleForDashboard: string | undefined,
  isDbAdmin: boolean
): string {
  if (isDbAdmin && (!roleForDashboard || roleForDashboard === "admin")) {
    return "/dashboard";
  }
  return dashboardNavHomePath(roleForDashboard);
}

export function safeRedirectPathForUser(opts: {
  roleForDashboard: string | undefined;
  isDbAdmin: boolean;
  allowed: Set<string>;
}): string | null {
  const { roleForDashboard, isDbAdmin, allowed } = opts;
  const preferred = preferredLandingPathname(roleForDashboard, isDbAdmin);
  const prefId = pathIdForPathname(preferred);
  if (prefId !== null && allowed.has(prefId) && (isDbAdmin || !isAdminPathId(prefId))) return preferred;

  for (const pid of FALLBACK_PATH_ORDER) {
    if (!allowed.has(pid)) continue;
    if (!isDbAdmin && isAdminPathId(pid)) continue;
    const url = pathIdToDefaultUrl(pid);
    if (url) return url;
  }
  for (const pid of allowed) {
    if (!isDbAdmin && isAdminPathId(pid)) continue;
    const url = pathIdToDefaultUrl(pid);
    if (url) return url;
  }
  return null;
}

export function filterSidebarItems(
  items: readonly SidebarItem[],
  allowed: Set<string>
): SidebarItem[] {
  const out: SidebarItem[] = [];
  for (const item of items) {
    if (item.kind === "link") {
      if (allowed.has(pathIdForNavTo(item.to))) out.push(item);
      continue;
    }
    const children = item.children.filter((c) => allowed.has(pathIdForNavTo(c.to)));
    if (children.length > 0) {
      out.push({ kind: "folder", label: item.label, children });
    }
  }
  return out;
}
