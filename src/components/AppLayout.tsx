import { useEffect, useMemo, useState } from "react";
import { useOfflineContext } from "../offline/OfflineProvider";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { LogoMark } from "./LogoMark";
import { NotificationBell } from "./NotificationBell";
import { EffectiveRoleProvider } from "../contexts/EffectiveRoleContext";
import { useMascotsPreference } from "../contexts/MascotsPreferenceContext";
import { ErinPcCornerMascot, usePcCornerMascotModel } from "./ErinPcCornerMascot";
import { NotificationShimeji } from "./NotificationShimeji";
import { PrincipalOverdueAlertModal } from "./PrincipalOverdueAlertModal";
import { RouteAccessGate } from "./RouteAccessGate";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  dashboardNavHomePath,
  filterSidebarItems,
  stripNavHash,
  type SidebarFolderItem,
  type SidebarItem,
  type SidebarLinkItem,
} from "../lib/pathAccess";

const VIEW_AS_STORAGE_KEY = "pretium.viewAsRole";
const ADMIN_VIEW_AS_ROLES = [
  { value: "project_manager", label: "Project Manager" },
  { value: "coordinator", label: "Coordinator" },
  { value: "accounting", label: "Accounting" },
  { value: "safety", label: "Safety" },
  { value: "principal", label: "Principal" },
  { value: "site_superintendent", label: "Site Superintendent" },
] as const;

const SIDEBAR_WIDTH_EXPANDED = "14rem";
const SIDEBAR_WIDTH_COLLAPSED = "20px";

function getUserInitial(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "U";
}

function OfflineStatusBar() {
  const { isOffline, pendingCount, failedCount, isSyncing, lastSyncError, refreshStats } = useOfflineContext();
  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const showBar =
    isOffline || pendingCount > 0 || failedCount > 0 || isSyncing || Boolean(lastSyncError);
  if (!showBar) return null;

  let message = "";
  if (isOffline) {
    message = "Offline — submissions are queued and will sync when you’re back online.";
  } else if (isSyncing) {
    message = "Syncing queued changes…";
  } else if (failedCount > 0) {
    message = `Some items failed to sync (${failedCount}). ${lastSyncError ?? ""}`.trim();
  } else if (pendingCount > 0) {
    message = `${pendingCount} change(s) queued — will sync shortly.`;
  } else if (lastSyncError) {
    message = lastSyncError;
  }

  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        padding: "0.45rem 1rem",
        fontSize: "0.8125rem",
        backgroundColor: isOffline ? "rgba(245, 158, 11, 0.2)" : "rgba(5, 150, 105, 0.12)",
        color: "var(--text-primary)",
        borderBottom: "1px solid var(--border-strong)",
      }}
    >
      {message}
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuthActions();
  const user = useQuery(api.users.current);
  const { mascotsVisible } = useMascotsPreference();
  const [viewAsRole, setViewAsRoleState] = useState("");
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const isMobile = useIsMobile(768);
  const isAdmin = user?.role === "admin";
  const roleForView = isAdmin && viewAsRole ? viewAsRole : user?.role ?? "";
  const dashboardHomePath = dashboardNavHomePath(roleForView);
  const myPathIds = useQuery(api.roleAccess.getMyPathIds);
  const canAccessAccount = myPathIds !== undefined && myPathIds.includes("account");
  const canAccessAssistant = myPathIds !== undefined && myPathIds.includes("assistant");

  const navItemsRaw = useMemo<readonly SidebarItem[]>(() => {
    const adminChildren: SidebarLinkItem[] = [
      { kind: "link", to: "/boardroom", label: "Board Room" },
      { kind: "link", to: "/personal-calendar", label: "Personal Calendar" },
    ];

    if (isAdmin) {
      adminChildren.push(
        { kind: "link", to: "/admin/users", label: "Users" },
        { kind: "link", to: "/admin/access", label: "Access" },
        { kind: "link", to: "/admin/job-access", label: "Job Access" },
        { kind: "link", to: "/admin/trade-logins", label: "Trade Logins" }
      );
    }

    return [
      { kind: "link", to: dashboardHomePath, label: "Dashboard" },
      {
        kind: "folder",
        label: "Projects",
        children: [
          { kind: "link", to: "/projects", label: "Tracker" },
          { kind: "link", to: "/project-start-up", label: "Start up" },
          { kind: "link", to: "/close-out", label: "Close Out" },
          { kind: "link", to: "/drawings", label: "Drawings" },
        ],
      },
      { kind: "link", to: "/accounting", label: "Accounting" },
      { kind: "link", to: "/safety", label: "Safety" },
      {
        kind: "folder",
        label: "Inventory",
        children: [
          { kind: "link", to: "/inventory-form", label: "External Link", external: true },
          { kind: "link", to: "/inventory#master-equipment-log", label: "Master Equipment Log" },
        ],
      },
      { kind: "folder", label: "Admin", children: adminChildren },
    ] as const;
  }, [dashboardHomePath, isAdmin]);

  const navItems = useMemo(() => {
    if (myPathIds === undefined) return [] as SidebarItem[];
    return filterSidebarItems(navItemsRaw, new Set(myPathIds));
  }, [navItemsRaw, myPathIds]);

  useEffect(() => {
    // Keep the saved “View by” choice only for admins.
    if (typeof window === "undefined") return;
    if (!user) return;

    if (!isAdmin) {
      setViewAsRoleState("");
      window.localStorage.removeItem(VIEW_AS_STORAGE_KEY);
      return;
    }

    const saved = window.localStorage.getItem(VIEW_AS_STORAGE_KEY) ?? "";
    const valid = ADMIN_VIEW_AS_ROLES.some((r) => r.value === saved);
    setViewAsRoleState(valid ? saved : "");
  }, [isAdmin, user]);

  function setViewAsRole(next: string) {
    if (next !== "" && !ADMIN_VIEW_AS_ROLES.some((r) => r.value === next)) return;
    setViewAsRoleState(next);

    if (typeof window === "undefined") return;
    if (!next) window.localStorage.removeItem(VIEW_AS_STORAGE_KEY);
    else window.localStorage.setItem(VIEW_AS_STORAGE_KEY, next);
  }

  const projectsNavItem = navItems.find((item): item is SidebarFolderItem => item.kind === "folder" && item.label === "Projects");
  const isProjectsSectionActive =
    projectsNavItem?.children.some(
      ({ to }) => location.pathname === stripNavHash(to) || location.pathname.startsWith(stripNavHash(to) + "/")
    ) ?? false;
  const inventoryNavItem = navItems.find((item): item is SidebarFolderItem => item.kind === "folder" && item.label === "Inventory");
  const isInventorySectionActive =
    inventoryNavItem?.children.some(
      ({ to }) => location.pathname === stripNavHash(to) || location.pathname.startsWith(stripNavHash(to) + "/")
    ) ?? false;
  const adminNavItem = navItems.find((item): item is SidebarFolderItem => item.kind === "folder" && item.label === "Admin");
  const isAdminSectionActive =
    adminNavItem?.children.some(
      ({ to }) => location.pathname === stripNavHash(to) || location.pathname.startsWith(stripNavHash(to) + "/")
    ) ?? false;

  useEffect(() => {
    if (isProjectsSectionActive) {
      setIsProjectsOpen(true);
    }
  }, [isProjectsSectionActive]);

  useEffect(() => {
    if (isInventorySectionActive) {
      setIsInventoryOpen(true);
    }
  }, [isInventorySectionActive]);

  useEffect(() => {
    if (isAdminSectionActive) {
      setIsAdminOpen(true);
    }
  }, [isAdminSectionActive]);

  // Close mobile drawer on navigation
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  // Reset drawer state when leaving mobile breakpoint
  useEffect(() => {
    if (!isMobile && isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  }, [isMobile, isMobileNavOpen]);

  // Prevent body scroll when drawer is open on mobile
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isMobile && isMobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobile, isMobileNavOpen]);

  const isSafetyLandingPage = /^\/safety\/?$/.test(location.pathname);
  const isProjectsLandingPage = /^\/projects\/?$/.test(location.pathname);
  const isAccountingLandingPage = /^\/accounting\/?$/.test(location.pathname);
  const isAssistantPage = /^\/assistant\/?$/.test(location.pathname);
  const safetyOnlyFrame = isSafetyLandingPage
    ? "/shimeji_pack/safety-notification.png"
    : undefined;
  const projectsOnlyFrame = isProjectsLandingPage
    ? "/shimeji_pack/projects-notification.png?v=20260326-1"
    : undefined;
  const projectsSecondaryFrame = isProjectsLandingPage
    ? "/images/project-left-mascot.png?v=1"
    : undefined;
  const accountingOnlyFrame = isAccountingLandingPage
    ? "/shimeji_pack/accounting-notification.png"
    : undefined;
  const pageSpecificFrame = projectsOnlyFrame ?? accountingOnlyFrame ?? safetyOnlyFrame;

  const pcCornerMascot = usePcCornerMascotModel();
  const showNotificationShimeji = !isAssistantPage && !pcCornerMascot && mascotsVisible;

  async function handleSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <EffectiveRoleProvider
      effectiveRole={viewAsRole}
      viewAsRole={viewAsRole}
      setViewAsRole={setViewAsRole}
      isAdmin={isAdmin}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          minHeight: 0,
          backgroundColor: "var(--surface-page)",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        <header
          className="app-shell-top-header"
          style={{
            position: "relative",
            flexShrink: 0,
            width: "100%",
            overflow: "visible",
            zIndex: 40,
          }}
        >
          <div className="app-shell-header-inner">
            <div className="app-shell-top-header-brand">
              <Link to={dashboardHomePath} className="app-shell-title-link no-underline">
                Pretium Process
              </Link>
              <LogoMark
                light
                style={{
                  fontSize: "1.9rem",
                  lineHeight: 1,
                  marginRight: "1rem",
                  letterSpacing: "-0.02em",
                  opacity: 0.98,
                }}
              />
            </div>
          <div
            className="app-shell-header app-shell-top-header-tools"
            style={{
              minWidth: 0,
              backgroundColor: "var(--layout-header-secondary-bg)",
              borderBottom: "1px solid var(--border-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "0 0.65rem 0 0.75rem",
              gap: "0.35rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                flexShrink: 0,
                position: "relative",
                zIndex: 2,
                overflow: "visible",
              }}
            >
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setIsMobileNavOpen((prev) => !prev)}
                  aria-label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
                  aria-expanded={isMobileNavOpen}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "1.75rem",
                    height: "1.75rem",
                    padding: 0,
                    marginRight: "0.15rem",
                    borderRadius: "0.35rem",
                    border: "1px solid rgba(255,255,255,0.45)",
                    backgroundColor: "rgba(255,255,255,0.12)",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                >
                  <span aria-hidden style={{ display: "inline-block", lineHeight: 1 }}>
                    {isMobileNavOpen ? "\u2715" : "\u2630"}
                  </span>
                </button>
              )}
              {isAdmin && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#ecfdf5",
                    }}
                  >
                    View by
                  </span>
                  <select
                    value={viewAsRole}
                    onChange={(e) => setViewAsRole(e.target.value)}
                    style={{
                      height: "1.5rem",
                      borderRadius: "0.35rem",
                      padding: "0 0.35rem",
                      fontSize: "0.7rem",
                      border: "1px solid rgba(255, 255, 255, 0.25)",
                      backgroundColor: "rgba(var(--layout-header-sidebar-bg-rgb), 0.35)",
                      color: "#ecfdf5",
                      fontFamily: "Montserrat, sans-serif",
                      fontWeight: 600,
                    }}
                    aria-label="View by role"
                  >
                    <option value="">Admin</option>
                    {ADMIN_VIEW_AS_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {canAccessAccount ? (
                <Link
                  to="/account"
                  title="Account settings"
                  className="no-underline"
                  style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.45)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    backgroundColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  {getUserInitial(user?.name ?? user?.email)}
                </Link>
              ) : (
                <span
                  title={myPathIds === undefined ? undefined : "Account settings unavailable"}
                  style={{
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.45)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    backgroundColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  {getUserInitial(user?.name ?? user?.email)}
                </span>
              )}
              <NotificationBell compact />
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  padding: "0.15rem 0.45rem",
                  borderRadius: "0.35rem",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  border: "1px solid rgba(255,255,255,0.45)",
                  backgroundColor: "rgba(255,255,255,0.12)",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Logout
              </button>
            </div>
          </div>
          </div>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
          }}
        >
          {isMobile && isMobileNavOpen && (
            <div
              onClick={() => setIsMobileNavOpen(false)}
              aria-hidden
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.45)",
                zIndex: 49,
              }}
            />
          )}
          <aside
            style={
              isMobile
                ? {
                    width: "min(80vw, 18rem)",
                    flexShrink: 0,
                    position: "fixed",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    backgroundColor: "var(--layout-header-sidebar-bg)",
                    boxShadow: "2px 0 14px rgba(0, 0, 0, 0.24)",
                    display: "flex",
                    flexDirection: "column",
                    transform: isMobileNavOpen ? "translateX(0)" : "translateX(-100%)",
                    transition: "transform 200ms ease",
                    zIndex: 50,
                    overflow: "visible",
                  }
                : {
                    width: isSidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
                    flexShrink: 0,
                    position: "relative",
                    backgroundColor: "var(--layout-header-sidebar-bg)",
                    boxShadow: "2px 0 14px rgba(0, 0, 0, 0.14)",
                    display: "flex",
                    flexDirection: "column",
                    transition: "width 180ms ease",
                    overflow: "visible",
                  }
            }
          >
            {(isMobile || !isSidebarCollapsed) && (
              <>
                <nav style={{ padding: "0.75rem 0", flex: 1, overflowY: "auto" }}>
                  {myPathIds === undefined ? (
                    <div
                      style={{
                        padding: "0.6rem 1.25rem",
                        fontSize: "0.875rem",
                        color: "rgba(255, 255, 255, 0.75)",
                      }}
                    >
                      Loading…
                    </div>
                  ) : (
                    navItems.map((item) => {
                    if (item.kind === "link") {
                      const active =
                        !item.external &&
                        (location.pathname === stripNavHash(item.to) ||
                          location.pathname.startsWith(stripNavHash(item.to) + "/"));
                      return item.external ? (
                        <a
                          key={item.to}
                          href={item.to}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "block",
                            padding: "0.6rem 1.25rem",
                            margin: 0,
                            borderRadius: 0,
                            fontSize: "0.9375rem",
                            fontWeight: 500,
                            color: "rgba(255, 255, 255, 0.95)",
                            backgroundColor: "transparent",
                            textDecoration: "none",
                            border: "1px solid transparent",
                          }}
                          className="nav-link-hover-dark"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          key={item.to}
                          to={item.to}
                          style={{
                            display: "block",
                            padding: "0.6rem 1.25rem",
                            margin: 0,
                            borderRadius: 0,
                            fontSize: "0.9375rem",
                            fontWeight: 500,
                            color: active ? "var(--layout-header-sidebar-bg)" : "rgba(255, 255, 255, 0.95)",
                            backgroundColor: active ? "#d1fae5" : "transparent",
                            textDecoration: "none",
                            border: active ? "1px solid rgba(5, 150, 105, 0.4)" : "1px solid transparent",
                          }}
                          className={active ? "" : "nav-link-hover-dark"}
                        >
                          {item.label}
                        </Link>
                      );
                    }

                    const folderActive = item.children.some(
                      ({ to, external }) =>
                        !external &&
                        (location.pathname === stripNavHash(to) || location.pathname.startsWith(stripNavHash(to) + "/"))
                    );

                    const isProjectsFolder = item.label === "Projects";
                    const isInventoryFolder = item.label === "Inventory";
                    const isOpen = isProjectsFolder ? isProjectsOpen : isInventoryFolder ? isInventoryOpen : isAdminOpen;
                    const toggleFolder = isProjectsFolder
                      ? setIsProjectsOpen
                      : isInventoryFolder
                        ? setIsInventoryOpen
                        : setIsAdminOpen;
                    const folderLabel = isProjectsFolder ? "projects" : isInventoryFolder ? "inventory" : "admin";

                    return (
                      <div key={item.label}>
                        <button
                          type="button"
                          onClick={() => toggleFolder((prev) => !prev)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.6rem 1.25rem",
                            margin: 0,
                            borderRadius: 0,
                            fontSize: "0.9375rem",
                            fontWeight: 500,
                            color: folderActive ? "var(--layout-header-sidebar-bg)" : "rgba(255, 255, 255, 0.95)",
                            backgroundColor: folderActive ? "#d1fae5" : "transparent",
                            textDecoration: "none",
                            border: folderActive ? "1px solid rgba(5, 150, 105, 0.4)" : "1px solid transparent",
                            fontFamily: "Montserrat, sans-serif",
                            cursor: "pointer",
                          }}
                          className={folderActive ? "" : "nav-link-hover-dark"}
                          aria-expanded={isOpen}
                          aria-label={`Toggle ${folderLabel} navigation`}
                        >
                          <span>{item.label}</span>
                          <span>{isOpen ? "−" : "+"}</span>
                        </button>
                        {isOpen &&
                          item.children.map((child) => {
                            const childActive =
                              !child.external &&
                              (location.pathname === stripNavHash(child.to) ||
                                location.pathname.startsWith(stripNavHash(child.to) + "/"));
                            return child.external ? (
                              <a
                                key={child.to}
                                href={child.to}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "block",
                                  padding: "0.5rem 1.25rem 0.5rem 2rem",
                                  margin: 0,
                                  borderRadius: 0,
                                  fontSize: "0.9rem",
                                  fontWeight: 500,
                                  color: "rgba(255, 255, 255, 0.9)",
                                  backgroundColor: "transparent",
                                  textDecoration: "none",
                                  border: "1px solid transparent",
                                }}
                                className="nav-link-hover-dark"
                              >
                                {child.label}
                              </a>
                            ) : (
                              <Link
                                key={child.to}
                                to={child.to}
                                style={{
                                  display: "block",
                                  padding: "0.5rem 1.25rem 0.5rem 2rem",
                                  margin: 0,
                                  borderRadius: 0,
                                  fontSize: "0.9rem",
                                  fontWeight: 500,
                                  color: childActive
                                    ? "var(--layout-header-sidebar-bg)"
                                    : "rgba(255, 255, 255, 0.9)",
                                  backgroundColor: childActive ? "#d1fae5" : "transparent",
                                  textDecoration: "none",
                                  border: childActive
                                    ? "1px solid rgba(5, 150, 105, 0.4)"
                                    : "1px solid transparent",
                                }}
                                className={childActive ? "" : "nav-link-hover-dark"}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                      </div>
                    );
                  })
                  )}
                </nav>
                <div
                  style={{
                    padding: "1rem 1.25rem",
                    borderTop: "1px solid rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    fontSize: "0.8125rem",
                    color: "#ecfdf5",
                  }}
                >
                  {canAccessAssistant && (
                    <Link
                      to="/assistant"
                      style={{
                        display: "block",
                        padding: "0.6rem 1.25rem",
                        marginLeft: "-1.25rem",
                        marginRight: "-1.25rem",
                        marginBottom: "0.25rem",
                        borderRadius: 0,
                        fontSize: "0.9375rem",
                        fontWeight: 500,
                        color:
                          location.pathname === "/assistant" || location.pathname.startsWith("/assistant/")
                            ? "var(--layout-header-sidebar-bg)"
                            : "rgba(255, 255, 255, 0.95)",
                        backgroundColor:
                          location.pathname === "/assistant" || location.pathname.startsWith("/assistant/")
                            ? "#d1fae5"
                            : "transparent",
                        textDecoration: "none",
                        border:
                          location.pathname === "/assistant" || location.pathname.startsWith("/assistant/")
                            ? "1px solid rgba(5, 150, 105, 0.4)"
                            : "1px solid transparent",
                      }}
                      className={
                        location.pathname === "/assistant" || location.pathname.startsWith("/assistant/")
                          ? ""
                          : "nav-link-hover-dark"
                      }
                    >
                      Chuck
                    </Link>
                  )}
                  <div
                    style={{
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      opacity: 0.9,
                    }}
                  >
                    Build Value
                  </div>
                </div>
              </>
            )}
            {!isMobile && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="sidebar-toggle-button"
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translate(10%, -50%)",
                width: "16px",
                height: "78px",
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5,
                transition: "transform 180ms ease, filter 180ms ease",
              }}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span
                aria-hidden
                className="sidebar-toggle-pill"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "14px",
                  height: "74px",
                  borderRadius: "999px 0 0 999px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRight: "none",
                  background: "rgba(var(--layout-header-sidebar-bg-rgb), 0.82)",
                  color: "rgba(236, 253, 245, 0.62)",
                  fontSize: "0.72rem",
                  fontWeight: 500,
                  lineHeight: 1,
                  boxShadow: "1px 0 2px rgba(0,0,0,0.08)",
                  transition: "background 180ms ease, box-shadow 180ms ease, color 180ms ease",
                }}
              >
                {isSidebarCollapsed ? "›" : "‹"}
              </span>
            </button>
            )}
          </aside>

          <div
            className="app-shell-main"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              margin: "12px 12px 12px 10px",
              borderRadius: "12px",
              backgroundColor: "var(--surface-panel)",
              borderTop: "4px solid var(--layout-main-border-top)",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            <OfflineStatusBar />
            <main
              className="app-shell-main-content"
              style={{
                flex: 1,
                overflow: "auto",
                padding: "1.5rem",
              }}
            >
              <RouteAccessGate>
                <Outlet />
              </RouteAccessGate>
            </main>
          </div>
        </div>

        {showNotificationShimeji && (
          <NotificationShimeji
            overrideFrame={pageSpecificFrame}
            secondaryOverrideFrame={projectsSecondaryFrame}
            variant={isAccountingLandingPage ? "accounting" : isSafetyLandingPage ? "safety" : "default"}
          />
        )}
        <PrincipalOverdueAlertModal enabled={roleForView === "principal"} />
        {mascotsVisible && <ErinPcCornerMascot />}
      </div>
    </EffectiveRoleProvider>
  );
}
