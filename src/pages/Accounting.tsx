import { useState, useMemo, useEffect, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { CoFormModal } from "../components/CoFormModal";
import { shellCardStyle, innerWhiteCardStyle, cardStyle } from "../theme";
import { getProjectStatusStyle } from "../utils/projectStatusStyle";
import { notificationHref } from "../utils/notificationHref";
import { useMascotsPreference } from "../contexts/MascotsPreferenceContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { computeCoTotals, makeEmptyCoForm, type CoFormData } from "../lib/coPdf";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString();
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function parseCoTotalsFromDoc(doc: Doc<"documents">): { totalInternal: number; totalThisCo: number } | null {
  if (!doc.formData) return null;
  try {
    const parsed = JSON.parse(doc.formData) as Partial<CoFormData>;
    const form: CoFormData = {
      ...makeEmptyCoForm(),
      ...parsed,
      rows: parsed.rows ?? makeEmptyCoForm().rows,
    };
    const totals = computeCoTotals(form);
    return { totalInternal: totals.totalInternal, totalThisCo: totals.totalThisCo };
  } catch {
    return null;
  }
}

function coDisplayNumber(doc: Doc<"documents">): string {
  if (doc.formData) {
    try {
      const parsed = JSON.parse(doc.formData) as Partial<CoFormData>;
      if (parsed.coNumber?.trim()) return parsed.coNumber.trim();
    } catch {
      // fall through
    }
  }
  return doc.name?.trim() || "—";
}

function coDisplayCompany(doc: Doc<"documents">): string {
  if (doc.tradeName?.trim()) return doc.tradeName.trim();
  if (doc.formData) {
    try {
      const parsed = JSON.parse(doc.formData) as Partial<CoFormData>;
      if (parsed.companyName?.trim()) return parsed.companyName.trim();
    } catch {
      // fall through
    }
  }
  return doc.description?.trim() || "—";
}

type AccountingFavouriteDashboardRow = {
  project: Doc<"projects">;
  isFavourite: boolean;
  budgetHealth: "green" | "amber" | "red" | undefined;
  overdueAmount: number;
  pendingAmount: number;
  changeOrderCountRecent: number;
  changeOrderLatestRecent: number | undefined;
  poUpdateCountRecent: number;
  poUpdateLatestRecent: number | undefined;
};

function healthDot(health?: string) {
  if (!health) return null;
  const colors: Record<string, string> = {
    green: "#059669",
    amber: "#d97706",
    red: "#dc2626",
  };
  return (
    <span
      style={{
        width: "0.5rem",
        height: "0.5rem",
        borderRadius: "999px",
        display: "inline-block",
        backgroundColor: colors[health] ?? "#9ca3af",
      }}
    />
  );
}

function projectNameTrailingNumberParity(name: string | undefined): "even" | "odd" | null {
  if (!name) return null;
  const m = name.trim().match(/(\d+)\s*$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return n % 2 === 0 ? "even" : "odd";
}

export function Accounting() {
  const [searchParams] = useSearchParams();
  const user = useQuery(api.users.current);
  const { mascotsVisible } = useMascotsPreference();
  const isMobile = useIsMobile(768);
  const projects = useQuery(api.projects.listProjects, {});
  const accountingFavouriteDashboard = useQuery(api.accounting.getAccountingFavouriteDashboard, {});
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | "">("");
  const [viewCoDoc, setViewCoDoc] = useState<Doc<"documents"> | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const projectIdFromUrl = searchParams.get("project");

  useEffect(() => {
    if (!projects?.length || !projectIdFromUrl) return;
    const match = projects.find((p) => p._id === projectIdFromUrl);
    if (match) {
      setSelectedProjectId(match._id as Id<"projects">);
    }
  }, [projects, projectIdFromUrl]);

  useEffect(() => {
    if (selectedProjectId) return;
    if (!accountingFavouriteDashboard || accountingFavouriteDashboard.length === 0) return;
    if (!projects?.length) return;
    const orderById = new Map(projects.map((p, index) => [p._id as string, index]));
    const sorted = (accountingFavouriteDashboard as AccountingFavouriteDashboardRow[])
      .slice()
      .sort((a, b) => {
        const orderA = orderById.get(a.project._id as string) ?? Number.MAX_SAFE_INTEGER;
        const orderB = orderById.get(b.project._id as string) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      });
    const firstProject = sorted[0]?.project?._id;
    if (firstProject) {
      setSelectedProjectId(firstProject as Id<"projects">);
    }
  }, [accountingFavouriteDashboard, projects, selectedProjectId]);

  useEffect(() => {
    if (!isMobile) setMobileShowDetail(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    if (projectIdFromUrl && selectedProjectId === projectIdFromUrl) {
      setMobileShowDetail(true);
    }
  }, [isMobile, projectIdFromUrl, selectedProjectId]);

  const projectDetail = useQuery(
    api.projects.getProjectById,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );

  const documents = useQuery(
    api.documents.listDocumentsByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );
  const documentFolders = useQuery(
    api.documents.listDocumentFoldersByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip"
  );

  const notifications = useQuery(api.notifications.listRecentNotifications, { limit: 30 }) as
    | {
        _id: Id<"notifications">;
        type: string;
        title: string;
        body?: string;
        link?: string;
        projectId?: Id<"projects">;
        bookingId?: Id<"boardroomBookings">;
        incidentId?: Id<"incidentReports">;
        createdAt: number;
        readAt?: number;
      }[]
    | undefined;

  const selectedProjectName = selectedProjectId
    ? (projectDetail?.name ?? projects?.find((p) => p._id === selectedProjectId)?.name)
    : undefined;
  const accountingMascotParity = projectNameTrailingNumberParity(selectedProjectName);
  const accountingMascotSrc =
    accountingMascotParity === "even"
      ? "/images/accounting-mascot-even.png"
      : accountingMascotParity === "odd"
        ? "/images/accounting-mascot-odd.png"
        : null;
  const showAccountingMascot = Boolean(accountingMascotSrc && mascotsVisible);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of documentFolders ?? []) {
      map.set(folder._id as string, folder.name);
    }
    return map;
  }, [documentFolders]);

  const projectChangeOrders = useMemo(
    () =>
      (documents ?? [])
        .filter((d) => d.type.toUpperCase() === "CO")
        .slice()
        .sort((a, b) => (b.createdDate ?? b.uploadedAt ?? 0) - (a.createdDate ?? a.uploadedAt ?? 0)),
    [documents]
  );

  const projectCards = useMemo(() => {
    const cards = (accountingFavouriteDashboard as AccountingFavouriteDashboardRow[] | undefined) ?? [];
    if (!projects?.length) return cards;
    const orderById = new Map(projects.map((p, index) => [p._id as string, index]));
    return cards.slice().sort((a, b) => {
      const orderA = orderById.get(a.project._id as string) ?? Number.MAX_SAFE_INTEGER;
      const orderB = orderById.get(b.project._id as string) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [accountingFavouriteDashboard, projects]);
  const leftColumnProjects = useMemo(() => projectCards.slice(0, 6), [projectCards]);
  const bottomWrapProjects = useMemo(() => projectCards.slice(6), [projectCards]);

  const actionBtnStyle: CSSProperties = {
    padding: "0.25rem 0.5rem",
    border: "1px solid #0f766e",
    borderRadius: "0.4rem",
    backgroundColor: "var(--surface-panel)",
    color: "#0f766e",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  };

  const actionBtnDisabledStyle: CSSProperties = {
    ...actionBtnStyle,
    opacity: 0.45,
    cursor: "not-allowed",
  };

  const CARD_WIDTH = "13rem";
  const CARD_MIN_HEIGHT = "6.5rem";

  const projectCardBaseStyle: CSSProperties = {
    ...innerWhiteCardStyle,
    textAlign: "left",
    cursor: "pointer",
    padding: "0.75rem",
    width: CARD_WIDTH,
    minHeight: CARD_MIN_HEIGHT,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  };

  function handleCardClick(projectId: Id<"projects">) {
    setSelectedProjectId(projectId);
    if (isMobile) setMobileShowDetail(true);
  }

  function renderProjectCard(row: AccountingFavouriteDashboardRow, opts?: { fullWidth?: boolean }) {
    const p = row.project;
    const isActive = selectedProjectId === p._id;
    return (
      <button
        key={p._id}
        type="button"
        onClick={() => handleCardClick(p._id as Id<"projects">)}
        style={{
          ...projectCardBaseStyle,
          width: opts?.fullWidth ? "100%" : CARD_WIDTH,
          border: isActive ? "2px solid #059669" : innerWhiteCardStyle.border,
          boxShadow: isActive
            ? "0 0 0 2px rgba(16,185,129,0.15)"
            : innerWhiteCardStyle.boxShadow,
        }}
      >
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.2rem" }}>
          {p.name}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#4b5563", marginBottom: "0.35rem" }}>
          {p.clientName}
        </div>
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.2rem 0.5rem",
              borderRadius: "0.375rem",
              ...getProjectStatusStyle(p.status),
            }}
          >
            {p.status.replace(/_/g, " ")}
          </span>
          {healthDot(p.healthStatus as string | undefined)}
        </div>
      </button>
    );
  }

  const detailPanel = (
    <div
      style={{
        ...innerWhiteCardStyle,
        marginTop: 0,
        width: "100%",
        height: isMobile ? "auto" : "100%",
        minHeight: isMobile ? undefined : 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
              {selectedProjectId ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      Accounting Dashboard
                    </h2>
                  </div>

                  <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "minmax(0, 1fr)"
                  : "minmax(0, 1.45fr) minmax(0, 0.95fr)",
                gap: "1rem",
                alignItems: "start",
                      width: "100%",
                      flex: "1 1 auto",
                      minWidth: 0,
              }}
            >
              <div style={{ display: "grid", gap: "1rem" }}>
                <div
                  style={{
                    ...cardStyle,
                    position: "relative",
                    paddingTop: cardStyle.padding,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      Change orders
                    </h3>
                    {showAccountingMascot && (
                      <img
                        src={accountingMascotSrc!}
                        alt=""
                        className="accounting-dashboard-mascot"
                        style={{
                          width: "6.5rem",
                          height: "auto",
                          marginTop: "-1.3rem",
                          pointerEvents: "none",
                          transform:
                            accountingMascotParity === "odd"
                              ? "scale(0.9)"
                              : "none",
                          transformOrigin: "center bottom",
                        }}
                      />
                    )}
                  </div>
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Change orders created in project Changes appear here automatically. View the PDF or open the
                    form to see internal and external charges.
                  </p>

                  {documents === undefined ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Loading...</p>
                  ) : projectChangeOrders.length === 0 ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                      No change orders yet. Create them from the project Changes workspace.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", minWidth: isMobile ? "36rem" : undefined }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #d1d5db", backgroundColor: "var(--surface-muted)" }}>
                            <th style={{ textAlign: "left", padding: "0.45rem", color: "var(--text-secondary)" }}>Date</th>
                            <th style={{ textAlign: "left", padding: "0.45rem", color: "var(--text-secondary)" }}>CO #</th>
                            <th style={{ textAlign: "left", padding: "0.45rem", color: "var(--text-secondary)" }}>Company</th>
                            <th style={{ textAlign: "left", padding: "0.45rem", color: "var(--text-secondary)" }}>Folder</th>
                            <th style={{ textAlign: "left", padding: "0.45rem", color: "var(--text-secondary)" }}>Status</th>
                            <th style={{ textAlign: "right", padding: "0.45rem", color: "var(--text-secondary)" }}>Internal</th>
                            <th style={{ textAlign: "right", padding: "0.45rem", color: "var(--text-secondary)" }}>External</th>
                            <th style={{ textAlign: "left", padding: "0.45rem", color: "var(--text-secondary)" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectChangeOrders.map((doc) => {
                            const totals = parseCoTotalsFromDoc(doc);
                            const folderName = doc.folderId
                              ? folderNameById.get(doc.folderId as string) ?? "Folder"
                              : "—";
                            const hasPdf = Boolean(doc.fileUrl);
                            const hasForm = Boolean(doc.formData);
                            return (
                              <tr key={doc._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                                <td style={{ padding: "0.45rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                  {formatDate(doc.createdDate ?? doc.uploadedAt ?? 0)}
                                </td>
                                <td style={{ padding: "0.45rem", color: "var(--text-primary)", fontWeight: 500 }}>
                                  {coDisplayNumber(doc)}
                                </td>
                                <td style={{ padding: "0.45rem", color: "var(--text-primary)" }}>
                                  {coDisplayCompany(doc)}
                                </td>
                                <td style={{ padding: "0.45rem", color: "#4b5563" }}>{folderName}</td>
                                <td style={{ padding: "0.45rem", color: "#4b5563" }}>{doc.status ?? "—"}</td>
                                <td style={{ padding: "0.45rem", color: "var(--text-primary)", textAlign: "right" }}>
                                  {fmtMoney(totals?.totalInternal)}
                                </td>
                                <td style={{ padding: "0.45rem", color: "var(--text-primary)", textAlign: "right", fontWeight: 600 }}>
                                  {fmtMoney(totals?.totalThisCo)}
                                </td>
                                <td style={{ padding: "0.45rem" }}>
                                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                    {hasPdf ? (
                                      <a
                                        href={doc.fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ ...actionBtnStyle, textDecoration: "none", display: "inline-block" }}
                                      >
                                        View PDF
                                      </a>
                                    ) : (
                                      <button type="button" disabled style={actionBtnDisabledStyle} title="No PDF generated yet">
                                        View PDF
                                      </button>
                                    )}
                                    {hasForm ? (
                                      <button
                                        type="button"
                                        onClick={() => setViewCoDoc(doc)}
                                        style={actionBtnStyle}
                                      >
                                        View form
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled
                                        style={actionBtnDisabledStyle}
                                        title="No structured form data"
                                      >
                                        View form
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gap: "1rem" }}>
                <div style={{ ...cardStyle, backgroundColor: "var(--surface-muted)" }}>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.65rem" }}>
                    Budget vs actual
                  </h3>
                  {projectDetail === undefined ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</p>
                  ) : projectDetail == null ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Project details not found.</p>
                  ) : (
                    (() => {
                      const budgetValue = projectDetail.budget != null ? projectDetail.budget : null;
                      const actualCostValue = projectDetail.actualCost != null ? projectDetail.actualCost : null;
                      const hasBudget = budgetValue != null;
                      const hasActual = actualCostValue != null;
                      if (!hasBudget || !hasActual) {
                        return (
                          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            Add both budget and actual cost to see comparison.
                          </div>
                        );
                      }
                      const pct =
                        budgetValue! > 0
                          ? Math.min(200, Math.round((actualCostValue! / budgetValue!) * 100))
                          : 0;
                      const clampedPct = Math.max(0, pct);
                      const withinBudgetWidth = Math.min(clampedPct, 100);
                      const overBudgetWidth = clampedPct > 100 ? clampedPct - 100 : 0;
                      return (
                        <div>
                          <div style={{ display: "grid", gap: "0.3rem", fontSize: "0.82rem", marginBottom: "0.6rem" }}>
                            <div>Budgeted: ${budgetValue!.toLocaleString()}</div>
                            <div>Actual: ${actualCostValue!.toLocaleString()}</div>
                          </div>
                          <div
                            style={{
                              position: "relative",
                              height: "20px",
                              borderRadius: "9999px",
                              backgroundColor: "rgba(16, 185, 129, 0.2)",
                              overflow: "hidden",
                              boxShadow: "inset 0 0 0 1px rgba(16,185,129,0.25)",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 0.5rem",
                                fontSize: "0.7rem",
                                color: "var(--text-primary)",
                                pointerEvents: "none",
                              }}
                            >
                              <span>0</span>
                              <span>Budget</span>
                            </div>
                            <div
                              style={{
                                height: "100%",
                                width: `${withinBudgetWidth}%`,
                                maxWidth: "100%",
                                borderRadius: "9999px",
                                backgroundColor: "#059669",
                                boxShadow: "0 4px 8px -4px rgba(16,185,129,0.6)",
                                transition: "width 0.6s ease-out",
                              }}
                            />
                            {overBudgetWidth > 0 && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: "100%",
                                  height: "100%",
                                  width: `${overBudgetWidth}%`,
                                  borderRadius: "0 9999px 9999px 0",
                                  backgroundColor: "#dc2626",
                                  boxShadow: "0 4px 8px -4px rgba(220,38,38,0.6)",
                                  transition: "width 0.6s ease-out",
                                }}
                              />
                            )}
                          </div>
                          <div style={{ marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--text-primary)" }}>
                            {pct <= 100
                              ? `${pct}% of budget`
                              : `${pct}% of budget · over by $${(actualCostValue! - budgetValue!).toLocaleString()}`}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
                <div style={cardStyle}>
                  <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                    Notifications
                  </h3>
                  {notifications === undefined ? (
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</p>
                  ) : (
                    (() => {
                      const filtered = notifications?.filter((n) => n.projectId === selectedProjectId) ?? [];
                      if (filtered.length === 0) {
                        return <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>No recent notifications for this project.</p>;
                      }
                      return (
                        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "0.875rem" }}>
                          {filtered.slice(0, 5).map((n) => {
                            const href = notificationHref({
                              link: n.link,
                              projectId: n.projectId,
                              bookingId: n.bookingId,
                              incidentId: n.incidentId,
                            });
                            const inner = (
                              <>
                                <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: "0.1rem" }}>
                                  {n.title}
                                </div>
                                {n.body && (
                                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{n.body}</div>
                                )}
                                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                  {formatDate(n.createdAt)}
                                </div>
                              </>
                            );
                            return (
                              <li key={n._id} style={{ padding: "0.35rem 0", borderBottom: "1px solid #e5e7eb" }}>
                                {href ? (
                                  <Link
                                    to={href}
                                    style={{ textDecoration: "none", color: "inherit", display: "block" }}
                                  >
                                    {inner}
                                  </Link>
                                ) : (
                                  inner
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
                </>
              ) : (
                <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  Select a project to load accounting details.
                </div>
              )}
    </div>
  );

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
        Accounting <LogoMark />
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        {isMobile && mobileShowDetail
          ? "Project accounting details."
          : isMobile
            ? "Select a project to view accounting details."
            : user?.role === "admin" ? (
                <>
                  As an admin, every job in Project Tracker is listed here. Select a job for change orders,
                  budget progress, and notifications.
                </>
              ) : (
                <>
                  Favourite jobs from Project Tracker to show them here. Select a job for change orders,
                  budget progress, and notifications.
                </>
              )}
      </p>

      <div style={shellCardStyle}>
        {projects === undefined || accountingFavouriteDashboard === undefined ? (
          <p style={{ color: "#d1fae5", margin: 0 }}>Loading...</p>
        ) : projects.length === 0 ? (
          <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>No projects yet.</p>
          </div>
        ) : accountingFavouriteDashboard.length === 0 ? (
          <p style={{ color: "#ffffff", fontSize: "0.875rem", margin: 0 }}>
            {user?.role === "admin" ? (
              <>No jobs are in Project Tracker yet.</>
            ) : (
              <>
                Favourite a project from the{" "}
                <Link to="/projects" style={{ color: "#059669", fontWeight: 600 }}>
                  Project Tracker
                </Link>{" "}
                to show it here.
              </>
            )}
          </p>
        ) : isMobile && mobileShowDetail ? (
          <div style={{ marginTop: "0.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0, width: "100%" }}>
            <button
              type="button"
              onClick={() => setMobileShowDetail(false)}
              style={{
                alignSelf: "flex-start",
                border: "1px solid #059669",
                backgroundColor: "#ecfdf5",
                color: "#047857",
                borderRadius: "999px",
                padding: "0.35rem 0.85rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              {"<-"} Back to project list
            </button>
            {detailPanel}
          </div>
        ) : isMobile ? (
          <div
            style={{
              marginTop: "0.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
            }}
          >
            {projectCards.map((row) => renderProjectCard(row, { fullWidth: true }))}
          </div>
        ) : (
          <div
            style={{
              marginTop: "0.25rem",
              display: "grid",
              gridTemplateColumns: `${CARD_WIDTH} minmax(0, 1fr)`,
              gap: "1rem",
              alignItems: "stretch",
              minWidth: 0,
            }}
          >
            <div style={{ display: "grid", gap: "0.65rem", alignSelf: "start" }}>
              {leftColumnProjects.map((row) => renderProjectCard(row))}
            </div>

            {detailPanel}

            {bottomWrapProjects.length > 0 ? (
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.65rem",
                  alignItems: "stretch",
                  justifyContent: "flex-start",
                }}
              >
                {bottomWrapProjects.map((row) => renderProjectCard(row))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {selectedProjectId && viewCoDoc ? (
        <CoFormModal
          open={!!viewCoDoc}
          projectId={selectedProjectId}
          projectName={selectedProjectName ?? ""}
          existingDoc={viewCoDoc}
          readOnly
          onClose={() => setViewCoDoc(null)}
          onSaved={() => {}}
        />
      ) : null}
    </div>
  );
}
