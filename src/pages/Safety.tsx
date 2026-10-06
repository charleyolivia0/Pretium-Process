import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { shellCardStyle, innerWhiteCardStyle } from "../theme";
import { getProjectStatusStyle } from "../utils/projectStatusStyle";
import { useTheme } from "../contexts/ThemeContext";
import { projectIncidentReportHref, projectSubtradeDetailHref } from "./projectDetail/projectSectionPaths";
import { formatReportType } from "../utils/safetyReportTypes";
import { useIsMobile } from "../hooks/useIsMobile";
import { useCentralDayKey } from "../hooks/useCentralDayKey";

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
        backgroundColor: colors[health] ?? "#9ca3af",
        display: "inline-block",
      }}
    />
  );
}

const CENTRAL_TIMEZONE = "America/Chicago";

function formatDate(ts?: number) {
  if (ts == null) return "--";
  return new Date(ts).toLocaleDateString();
}

function formatTime(ts?: number) {
  if (ts == null) return "--";
  return new Date(ts).toLocaleTimeString([], {
    timeZone: CENTRAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateInputValue(ts?: number) {
  if (ts == null || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar date from `YYYY-MM-DD`; noon avoids DST edge cases. */
function parseDateInputToMillis(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const ms = new Date(`${t}T12:00:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function Safety() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projects = useQuery(api.projects.listProjects, {});
  const updateProject = useMutation(api.projects.updateProject);
  const { theme } = useTheme();
  const textColor = theme === "dark" ? "#ffffff" : "#111827";
  const muted = theme === "dark" ? "rgba(255,255,255,0.65)" : "#6b7280";
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | null>(null);
  const [inspectionEditOpen, setInspectionEditOpen] = useState(false);
  const [editLastInspection, setEditLastInspection] = useState("");
  const [editNextInspection, setEditNextInspection] = useState("");
  const [inspectionSaving, setInspectionSaving] = useState(false);
  const [inspectionEditError, setInspectionEditError] = useState<string | null>(null);
  const isMobile = useIsMobile(768);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const projectIdFromUrl = searchParams.get("project");

  useEffect(() => {
    if (!projects?.length || !projectIdFromUrl) return;
    const match = projects.find((project) => project._id === projectIdFromUrl);
    if (match) {
      setSelectedProjectId(match._id);
    }
  }, [projects, projectIdFromUrl]);

  useEffect(() => {
    if (projects === undefined || projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    const stillExists = selectedProjectId && projects.some((project) => project._id === selectedProjectId);
    if (!stillExists && !projectIdFromUrl) {
      setSelectedProjectId(projects[0]._id);
    }
  }, [projects, selectedProjectId, projectIdFromUrl]);

  useEffect(() => {
    if (!isMobile) setMobileShowDetail(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    if (projectIdFromUrl && selectedProjectId === projectIdFromUrl) {
      setMobileShowDetail(true);
    }
  }, [isMobile, projectIdFromUrl, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project._id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const todayDayKey = useCentralDayKey();
  const subtrades = useQuery(api.subtrades.listByProject, selectedProjectId ? { projectId: selectedProjectId } : "skip");
  const incidentReports = useQuery(
    api.safety.listIncidentReportsByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip",
  );
  const activeEquipment = useQuery(
    api.safety.listActiveEquipmentByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip",
  );
  const attendanceLogs = useQuery(
    api.safety.listJobAttendanceByProjectDay,
    selectedProjectId ? { projectId: selectedProjectId, dayKey: todayDayKey } : "skip",
  );

  const leftColumnCards = useMemo(() => (projects ?? []).slice(0, 6), [projects]);
  const bottomWrapCards = useMemo(() => (projects ?? []).slice(6), [projects]);

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

  function renderProjectCard(p: Doc<"projects">, opts?: { fullWidth?: boolean }) {
    const isSelected = selectedProjectId === p._id;
    return (
      <button
        key={p._id}
        type="button"
        onClick={() => handleCardClick(p._id)}
        style={{
          ...projectCardBaseStyle,
          width: opts?.fullWidth ? "100%" : CARD_WIDTH,
          border: isSelected ? "2px solid #059669" : innerWhiteCardStyle.border,
          boxShadow: isSelected ? "0 0 0 2px rgba(16,185,129,0.15)" : innerWhiteCardStyle.boxShadow,
        }}
      >
        <div
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            color: textColor,
            marginBottom: "0.25rem",
          }}
        >
          {p.name}
        </div>
        <div style={{ fontSize: "0.8rem", color: textColor, marginBottom: "0.5rem", opacity: 0.8 }}>
          {p.clientName}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "0.2rem 0.5rem",
              borderRadius: "0.375rem",
              ...getProjectStatusStyle(p.status),
              color: "#374151",
            }}
          >
            {p.status.replace(/_/g, " ")}
          </span>
          {healthDot(p.healthStatus)}
        </div>
      </button>
    );
  }

  const detailGridCols3 = isMobile ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))";
  const detailGridCols2 = isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))";

  const detailPanel = (
    <div
      style={{
        ...innerWhiteCardStyle,
        boxSizing: "border-box",
        height: isMobile ? "auto" : "100%",
        minHeight: isMobile ? undefined : 0,
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.9rem",
      }}
    >
      {!selectedProject ? (
        <div style={{ color: "#6b7280", fontSize: "0.875rem" }}>Select a project card to load details.</div>
      ) : (
        <div
          style={{
            flex: isMobile ? undefined : 1,
            minHeight: isMobile ? undefined : 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            minWidth: 0,
            width: "100%",
          }}
        >
          <div
            style={{
              border: "2px solid #2f7c67",
              borderRadius: "0.75rem",
              padding: "0.9rem",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.2rem" }}>{selectedProject.name}</div>
            <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>{selectedProject.clientName}</div>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Link
                to={`/safety/project/${selectedProject._id}`}
                style={{
                  textDecoration: "none",
                  borderRadius: "999px",
                  padding: "0.35rem 0.7rem",
                  backgroundColor: "#ecfdf5",
                  border: "1px solid #059669",
                  color: "#047857",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Open project hub
              </Link>
              <Link
                to={`/safety/project/${selectedProject._id}/job-sign-in-out`}
                style={{
                  textDecoration: "none",
                  borderRadius: "999px",
                  padding: "0.35rem 0.7rem",
                  backgroundColor: "#f9fafb",
                  border: "1px solid #d1d5db",
                  color: "#374151",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Sign logs
              </Link>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 600, opacity: 0.85 }}>Inspection schedule</div>
            <button
              type="button"
              onClick={() => {
                if (!selectedProject) return;
                setEditLastInspection(toDateInputValue(selectedProject.safetyLastInspectionAt));
                setEditNextInspection(toDateInputValue(selectedProject.safetyNextInspectionAt));
                setInspectionEditError(null);
                setInspectionEditOpen(true);
              }}
              style={{
                border: "1px solid #059669",
                backgroundColor: "#ecfdf5",
                color: "#047857",
                borderRadius: "0.375rem",
                padding: "0.25rem 0.55rem",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              Edit dates
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: detailGridCols3,
              gap: "0.65rem",
              flexShrink: 0,
              minWidth: 0,
              width: "100%",
            }}
          >
            <div style={{ border: "2px solid #2f7c67", borderRadius: "0.7rem", padding: "0.6rem" }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", opacity: 0.7 }}>Last inspection</div>
              <div style={{ marginTop: "0.4rem", fontWeight: 700, fontSize: "1rem" }}>
                {formatDate(selectedProject.safetyLastInspectionAt)}
              </div>
            </div>
            <div style={{ border: "2px solid #2f7c67", borderRadius: "0.7rem", padding: "0.6rem" }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", opacity: 0.7 }}>Next inspection</div>
              <div style={{ marginTop: "0.4rem", fontWeight: 700, fontSize: "1rem" }}>
                {formatDate(selectedProject.safetyNextInspectionAt)}
              </div>
            </div>
            <div style={{ border: "2px solid #2f7c67", borderRadius: "0.7rem", padding: "0.6rem" }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", opacity: 0.7 }}># of incidents</div>
              <div style={{ marginTop: "0.4rem", fontWeight: 700, fontSize: "1rem" }}>
                {incidentReports?.length ?? 0}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: detailGridCols2,
              gap: "0.65rem",
              flex: isMobile ? undefined : "1 1 0",
              minHeight: isMobile ? undefined : 0,
              minWidth: 0,
              width: "100%",
            }}
          >
            <div
              style={{
                border: "2px solid #2f7c67",
                borderRadius: "0.7rem",
                padding: "0.6rem",
                minHeight: isMobile ? undefined : 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Link
                to={`/safety/project/${selectedProject._id}/trades`}
                style={{
                  display: "inline-block",
                  marginBottom: "0.45rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: textColor,
                  textDecoration: "none",
                }}
              >
                Trade employee forms
              </Link>
              <div
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: "0.5rem",
                  padding: "0.4rem",
                  overflowY: "auto",
                  flex: 1,
                  minHeight: "7rem",
                }}
              >
                {(subtrades ?? []).length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>No trade folders.</div>
                ) : (
                  (subtrades ?? []).map((trade: Doc<"projectSubtrades">) => (
                    <button
                      type="button"
                      key={trade._id}
                      onClick={() =>
                        navigate(
                          projectSubtradeDetailHref(String(selectedProject._id), String(trade._id)),
                        )
                      }
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderRadius: "0.35rem",
                        padding: "0.35rem",
                        marginBottom: "0.2rem",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        backgroundColor: "transparent",
                        color: textColor,
                      }}
                    >
                      {trade.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                border: "2px solid #2f7c67",
                borderRadius: "0.7rem",
                padding: "0.6rem",
                minHeight: isMobile ? undefined : 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Link
                to={`/safety/project/${selectedProject._id}/incidents`}
                style={{
                  display: "inline-block",
                  marginBottom: "0.45rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: textColor,
                  textDecoration: "none",
                }}
              >
                Incident reports
              </Link>
              <div
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: "0.5rem",
                  padding: "0.4rem",
                  flex: 1,
                  minHeight: "7rem",
                  overflowY: "auto",
                }}
              >
                {incidentReports === undefined ? (
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Loading...</div>
                ) : incidentReports.length === 0 ? (
                  <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>No incident reports.</div>
                ) : (
                  incidentReports.slice(0, 6).map((report: Doc<"incidentReports">) => (
                    <Link
                      key={report._id}
                      to={projectIncidentReportHref(
                        String(selectedProject._id),
                        String(report._id),
                      )}
                      style={{
                        display: "block",
                        width: "100%",
                        marginBottom: "0.4rem",
                        fontSize: "0.72rem",
                        textAlign: "left",
                        border: "none",
                        borderRadius: "0.35rem",
                        padding: "0.35rem",
                        cursor: "pointer",
                        backgroundColor: "transparent",
                        color: textColor,
                        fontFamily: "Montserrat, sans-serif",
                        textDecoration: "none",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{report.title}</div>
                      <div style={{ opacity: 0.8 }}>
                        {formatReportType(report.reportType)} · {formatDate(report.date)}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: detailGridCols2,
              gap: "0.65rem",
              flex: isMobile ? undefined : "1 1 0",
              minHeight: isMobile ? undefined : 0,
              minWidth: 0,
              width: "100%",
            }}
          >
            <div
              style={{
                border: "2px solid #2f7c67",
                borderRadius: "0.7rem",
                padding: "0.6rem",
                minHeight: isMobile ? undefined : 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Link
                to="/inventory"
                style={{
                  display: "inline-block",
                  marginBottom: "0.45rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: textColor,
                  textDecoration: "none",
                }}
              >
                Equipment on site
              </Link>
              <div style={{ flex: isMobile ? undefined : 1, minHeight: isMobile ? undefined : 0, minWidth: 0, overflow: "auto", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem", minWidth: isMobile ? "20rem" : undefined }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Name</th>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Serial ID</th>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Trade</th>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Date taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeEquipment ?? []).slice(0, 6).map((eq) => (
                      <tr key={eq._id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "0.3rem" }}>{eq.equipmentName}</td>
                        <td style={{ padding: "0.3rem" }}>{eq.equipmentSerialNumber ?? "--"}</td>
                        <td style={{ padding: "0.3rem" }}>{eq.takenOutByName ?? "--"}</td>
                        <td style={{ padding: "0.3rem" }}>{formatDate(eq.dateTaken)}</td>
                      </tr>
                    ))}
                    {(activeEquipment ?? []).length === 0 ? (
                      <tr>
                        <td style={{ padding: "0.4rem", color: "#6b7280" }} colSpan={4}>
                          No active equipment rows.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                border: "2px solid #2f7c67",
                borderRadius: "0.7rem",
                padding: "0.6rem",
                minHeight: isMobile ? undefined : 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Link
                to={`/safety/project/${selectedProject._id}/job-sign-in-out`}
                style={{
                  display: "inline-block",
                  marginBottom: "0.45rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  color: textColor,
                  textDecoration: "none",
                }}
              >
                Trade sign out
              </Link>
              <div style={{ flex: isMobile ? undefined : 1, minHeight: isMobile ? undefined : 0, minWidth: 0, overflow: "auto", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem", minWidth: isMobile ? "18rem" : undefined }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Name</th>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Trade</th>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>Time</th>
                      <th style={{ textAlign: "left", padding: "0.3rem" }}>In/Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(attendanceLogs ?? [])
                      .slice()
                      .reverse()
                      .slice(0, 8)
                      .map((log) => (
                        <tr key={log._id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "0.3rem" }}>{log.workerName}</td>
                          <td style={{ padding: "0.3rem" }}>{log.tradeName}</td>
                          <td style={{ padding: "0.3rem" }}>{formatTime(log.signedAt)}</td>
                          <td style={{ padding: "0.3rem", textTransform: "capitalize" }}>{log.action}</td>
                        </tr>
                      ))}
                    {(attendanceLogs ?? []).length === 0 ? (
                      <tr>
                        <td style={{ padding: "0.4rem", color: "#6b7280" }} colSpan={4}>
                          No sign in/out rows for today.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
      <h1 className="page-title" style={{ color: textColor }}>
        Safety <LogoMark style={{ color: theme === "dark" ? "rgba(255,255,255,0.95)" : "#059669" }} />
      </h1>
      <p style={{ color: textColor, fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        {isMobile && mobileShowDetail
          ? "Project safety details."
          : isMobile
            ? "Select a project to view safety details."
            : "Select a project card around the edge to load details in the middle dashboard."}
      </p>

      <div style={shellCardStyle}>
        {projects === undefined ? (
          <p style={{ color: textColor }}>Loading...</p>
        ) : projects.length === 0 ? (
          <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
            <p style={{ color: textColor, margin: 0 }}>No projects yet. Create a project from Project Tracker.</p>
          </div>
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
            {(projects ?? []).map((p: Doc<"projects">) => renderProjectCard(p, { fullWidth: true }))}
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
              {leftColumnCards.map((p: Doc<"projects">) => renderProjectCard(p))}
            </div>

            {detailPanel}

            {bottomWrapCards.length > 0 ? (
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
                {bottomWrapCards.map((p: Doc<"projects">) => renderProjectCard(p))}
              </div>
            ) : null}
          </div>
        )}
      </div>


      {inspectionEditOpen && selectedProject ? (
        <div
          role="presentation"
          onClick={() => !inspectionSaving && setInspectionEditOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="safety-inspection-edit-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...innerWhiteCardStyle,
              width: "min(100%, 22rem)",
              padding: "1.1rem",
              boxShadow: "0 20px 40px rgba(2, 6, 23, 0.22)",
            }}
          >
            <h2
              id="safety-inspection-edit-title"
              style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 700, color: textColor }}
            >
              Edit inspection dates
            </h2>
            <p style={{ margin: "0 0 1rem", fontSize: "0.78rem", color: muted }}>
              {selectedProject.name}. Leave a field empty to clear it.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const lastTrim = editLastInspection.trim();
                const nextTrim = editNextInspection.trim();
                let safetyLastInspectionAt: number | null;
                let safetyNextInspectionAt: number | null;
                if (lastTrim === "") {
                  safetyLastInspectionAt = null;
                } else {
                  const ms = parseDateInputToMillis(lastTrim);
                  if (ms === null) {
                    setInspectionEditError("Last inspection date is not valid.");
                    return;
                  }
                  safetyLastInspectionAt = ms;
                }
                if (nextTrim === "") {
                  safetyNextInspectionAt = null;
                } else {
                  const ms = parseDateInputToMillis(nextTrim);
                  if (ms === null) {
                    setInspectionEditError("Next inspection date is not valid.");
                    return;
                  }
                  safetyNextInspectionAt = ms;
                }
                setInspectionSaving(true);
                setInspectionEditError(null);
                try {
                  await updateProject({
                    projectId: selectedProject._id,
                    safetyLastInspectionAt,
                    safetyNextInspectionAt,
                  });
                  setInspectionEditOpen(false);
                } catch (err) {
                  setInspectionEditError(err instanceof Error ? err.message : "Could not save dates.");
                } finally {
                  setInspectionSaving(false);
                }
              }}
              style={{ display: "grid", gap: "0.75rem" }}
            >
              <div>
                <label
                  htmlFor="safety-edit-last-inspection"
                  style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.78rem", fontWeight: 600, color: textColor }}
                >
                  Last inspection
                </label>
                <input
                  id="safety-edit-last-inspection"
                  type="date"
                  value={editLastInspection}
                  onChange={(ev) => setEditLastInspection(ev.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.45rem 0.5rem",
                    borderRadius: "0.375rem",
                    border: "1px solid #d1d5db",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.85rem",
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="safety-edit-next-inspection"
                  style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.78rem", fontWeight: 600, color: textColor }}
                >
                  Next inspection
                </label>
                <input
                  id="safety-edit-next-inspection"
                  type="date"
                  value={editNextInspection}
                  onChange={(ev) => setEditNextInspection(ev.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.45rem 0.5rem",
                    borderRadius: "0.375rem",
                    border: "1px solid #d1d5db",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.85rem",
                  }}
                />
              </div>
              {inspectionEditError ? (
                <div style={{ fontSize: "0.78rem", color: "#b91c1c" }}>{inspectionEditError}</div>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  disabled={inspectionSaving}
                  onClick={() => !inspectionSaving && setInspectionEditOpen(false)}
                  style={{
                    border: "1px solid #d1d5db",
                    backgroundColor: "#f9fafb",
                    color: "#374151",
                    borderRadius: "0.375rem",
                    padding: "0.4rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: inspectionSaving ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inspectionSaving}
                  style={{
                    border: "1px solid #059669",
                    backgroundColor: "#059669",
                    color: "#fff",
                    borderRadius: "0.375rem",
                    padding: "0.4rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: inspectionSaving ? "wait" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  {inspectionSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
