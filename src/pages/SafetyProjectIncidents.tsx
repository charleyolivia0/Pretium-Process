import { useState } from "react";
import { projectQueryArgs, withProjectId, asProjectId } from "../lib/projectQueryArgs";
import { useParams, Link } from "react-router-dom";
import { projectIncidentReportHref, safetyJobSummaryHref } from "./projectDetail/projectSectionPaths";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { cardStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { useOfflineContext } from "../offline/OfflineProvider";
import { useOfflineCachedQuery } from "../offline/useOfflineCachedQuery";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { dateInputValueToTimestamp, timestampToDateInputValue } from "../utils/dateInput";
import {
  formatReportType,
  REPORT_TYPES,
  type IncidentReportType,
} from "../utils/safetyReportTypes";

const inputStyle = {
  width: "100%" as const,
  marginBottom: "0.75rem",
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const INCIDENT_STATUSES = ["open", "investigating", "resolved"] as const;

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

export function SafetyProjectIncidents() {
  const { id } = useParams<{ id: string }>();
  const { theme } = useTheme();
  const textColor = theme === "dark" ? "#ffffff" : "#111827";

  const { isOffline, queueJob } = useOfflineContext();
  const project = useOfflineCachedQuery(
    api.projects.getProjectById,
    projectQueryArgs(id),
    "projects.getProjectById"
  );
  const incidentReports = useOfflineCachedQuery(
    api.safety.listIncidentReportsByProject,
    projectQueryArgs(id),
    "safety.listIncidentReportsByProject"
  );

  const addIncident = useMutation(api.safety.addIncidentReport);
  const updateIncident = useMutation(api.safety.updateIncidentReport);
  const removeIncident = useMutation(api.safety.removeIncidentReport);

  const [incTitle, setIncTitle] = useState("");
  const [incDesc, setIncDesc] = useState("");
  const [incDate, setIncDate] = useState("");
  const [incSeverity, setIncSeverity] =
    useState<"low" | "medium" | "high" | "critical">("medium");
  const [incReportType, setIncReportType] = useState<IncidentReportType>("incident_report");
  const [involvedWorker, setInvolvedWorker] = useState("");
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [editingReportId, setEditingReportId] = useState<Id<"incidentReports"> | null>(null);
  const [pendingDeleteReportId, setPendingDeleteReportId] = useState<Id<"incidentReports"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSeverity, setEditSeverity] =
    useState<"low" | "medium" | "high" | "critical">("medium");
  const [editReportType, setEditReportType] = useState<IncidentReportType>("incident_report");
  const workerSuggestions = useQuery(
    api.safety.listRecentWorkersByProjectTrade,
    withProjectId(id, {
      search: involvedWorker.trim() || undefined,
      limit: 8,
    }),
  );

  if (id == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>No project selected.</p>
      </div>
    );
  }

  if (project === undefined || incidentReports === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Project not found.</p>
        <Link to={safetyJobSummaryHref(id)} style={{ color: textColor }}>
          Back to safety summary
        </Link>
      </div>
    );
  }

  async function handleAddIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!incTitle.trim() || !incDesc.trim() || !id) return;
    const dateNum = incDate ? dateInputValueToTimestamp(incDate) : Date.now();
    if (dateNum === undefined) return;
    const descriptionWithWorker =
      involvedWorker.trim().length > 0
        ? `${incDesc.trim()}\n\nInvolved worker: ${involvedWorker.trim()}`
        : incDesc.trim();
    if (isOffline) {
      await queueJob({
        type: "incidentAdd",
        payload: {
          projectId: id,
          title: incTitle.trim(),
          description: descriptionWithWorker,
          date: dateNum,
          reportType: incReportType,
          severity: incSeverity,
        },
      });
      setIncTitle("");
      setIncDesc("");
      setIncDate("");
      setIncSeverity("medium");
      setIncReportType("incident_report");
      setInvolvedWorker("");
      setShowIncidentForm(false);
      return;
    }
    await addIncident({
      projectId: asProjectId(id)!,
      title: incTitle.trim(),
      description: descriptionWithWorker,
      date: dateNum,
      reportType: incReportType,
      severity: incSeverity,
    });
    setIncTitle("");
    setIncDesc("");
    setIncDate("");
    setIncSeverity("medium");
    setIncReportType("incident_report");
    setInvolvedWorker("");
    setShowIncidentForm(false);
  }

  function startEditing(report: Doc<"incidentReports">) {
    setEditingReportId(report._id);
    setEditTitle(report.title ?? "");
    setEditDesc(report.description ?? "");
    setEditDate(timestampToDateInputValue(report.date));
    setEditSeverity(report.severity ?? "medium");
    setEditReportType(report.reportType ?? "incident_report");
  }

  function cancelEditing() {
    setEditingReportId(null);
    setEditTitle("");
    setEditDesc("");
    setEditDate("");
    setEditSeverity("medium");
    setEditReportType("incident_report");
  }

  async function saveIncidentEdit(reportId: Id<"incidentReports">) {
    if (!editTitle.trim() || !editDesc.trim()) return;
    if (isOffline) {
      window.alert("Editing incident reports is only available while online.");
      return;
    }
    await updateIncident({
      reportId,
      title: editTitle.trim(),
      description: editDesc.trim(),
      date: dateInputValueToTimestamp(editDate),
      reportType: editReportType,
      severity: editSeverity,
    });
    cancelEditing();
  }

  function requestDeleteIncident(reportId: Id<"incidentReports">) {
    if (isOffline) {
      window.alert("Deleting incident reports is only available while online.");
      return;
    }
    setPendingDeleteReportId(reportId);
  }

  async function confirmDeleteIncident() {
    const reportId = pendingDeleteReportId;
    if (!reportId) return;
    setPendingDeleteReportId(null);
    await removeIncident({ reportId });
    if (editingReportId === reportId) cancelEditing();
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
      <Link
        to={safetyJobSummaryHref(id)}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: textColor,
          textDecoration: "none",
        }}
      >
        {"<-"} Back to safety summary
      </Link>

      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: textColor,
          marginBottom: "0.25rem",
        }}
      >
        Incident reports - {project.name}
      </h1>
      <p style={{ fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Record and track safety incidents for this job.
      </p>

      <div style={{ ...cardStyle, color: textColor }}>
        {!showIncidentForm ? (
          <button
            type="button"
            onClick={() => setShowIncidentForm(true)}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              fontWeight: 600,
              backgroundColor: "#059669",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
              marginBottom: "1rem",
            }}
          >
            Add incident report
          </button>
        ) : (
          <form
            onSubmit={handleAddIncident}
            style={{ marginBottom: "1.5rem", maxWidth: "28rem" }}
          >
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={incTitle}
              onChange={(e) => setIncTitle(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Minor cut on site"
              required
            />
            <label style={labelStyle}>Report type</label>
            <select
              value={incReportType}
              onChange={(e) =>
                setIncReportType(e.target.value as IncidentReportType)
              }
              style={inputStyle}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label style={labelStyle}>Description</label>
            <textarea
              value={incDesc}
              onChange={(e) => setIncDesc(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" as const }}
              placeholder="What happened, where, who was involved..."
              required
            />
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={incDate}
              onChange={(e) => setIncDate(e.target.value)}
              style={inputStyle}
            />
            <label style={labelStyle}>Involved worker (optional)</label>
            <input
              type="text"
              value={involvedWorker}
              onChange={(e) => setInvolvedWorker(e.target.value)}
              style={inputStyle}
              placeholder="Suggest from prior sign-ins"
            />
            {workerSuggestions && workerSuggestions.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
                {workerSuggestions.map((w) => (
                  <button
                    key={w.workerNameNormalized}
                    type="button"
                    onClick={() => setInvolvedWorker(w.workerName)}
                    style={{
                      border: "1px solid #d1d5db",
                      backgroundColor: "#f9fafb",
                      borderRadius: "999px",
                      padding: "0.2rem 0.55rem",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    {w.workerName}
                  </button>
                ))}
              </div>
            ) : null}
            <label style={labelStyle}>Severity</label>
            <select
              value={incSeverity}
              onChange={(e) =>
                setIncSeverity(e.target.value as typeof incSeverity)
              }
              style={inputStyle}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="submit"
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  backgroundColor: "#059669",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Save report
              </button>
              <button
                type="button"
                onClick={() => setShowIncidentForm(false)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  fontWeight: 500,
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {incidentReports.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            No incident reports yet.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      color: "#6b7280",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      color: "#6b7280",
                    }}
                  >
                    Title
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      color: "#6b7280",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      color: "#6b7280",
                    }}
                  >
                    Severity
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      color: "#6b7280",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "0.5rem",
                      color: "#6b7280",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {incidentReports.map((r: Doc<"incidentReports">) => (
                  <tr key={r._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.5rem", color: "#6b7280" }}>
                      {formatDate(r.date)}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      {editingReportId === r._id ? (
                        <div style={{ maxWidth: "28rem" }}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            style={inputStyle}
                            placeholder="Incident title"
                          />
                          <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            rows={3}
                            style={{ ...inputStyle, resize: "vertical" as const }}
                            placeholder="Incident description"
                          />
                          <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr 1fr" }}>
                            <select
                              value={editReportType}
                              onChange={(e) =>
                                setEditReportType(e.target.value as IncidentReportType)
                              }
                              style={{ marginBottom: "0.75rem" }}
                            >
                              {REPORT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              style={{ marginBottom: "0.75rem" }}
                            />
                            <select
                              value={editSeverity}
                              onChange={(e) =>
                                setEditSeverity(e.target.value as typeof editSeverity)
                              }
                              style={{ marginBottom: "0.75rem" }}
                            >
                              {SEVERITIES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => void saveIncidentEdit(r._id)}
                              style={{
                                border: "none",
                                backgroundColor: "#111827",
                                color: "#fff",
                                borderRadius: "0.375rem",
                                padding: "0.35rem 0.65rem",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              style={{
                                border: "1px solid #d1d5db",
                                backgroundColor: "transparent",
                                color: "#374151",
                                borderRadius: "0.375rem",
                                padding: "0.35rem 0.65rem",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteIncident(r._id)}
                              style={{
                                border: "none",
                                backgroundColor: "#fef2f2",
                                color: "#b91c1c",
                                borderRadius: "0.375rem",
                                padding: "0.35rem 0.65rem",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Link
                            to={projectIncidentReportHref(id, String(r._id))}
                            style={{
                              fontWeight: 500,
                              color: "#047857",
                              textDecoration: "underline",
                            }}
                          >
                            {r.title}
                          </Link>
                          {r.description && (
                            <div
                              style={{
                                fontSize: "0.8125rem",
                                color: "#6b7280",
                                marginTop: "0.25rem",
                              }}
                            >
                              {r.description.slice(0, 80)}
                              {r.description.length > 80 ? "..." : ""}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem", color: "#6b7280" }}>
                      {editingReportId === r._id ? null : formatReportType(r.reportType)}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.375rem",
                          backgroundColor:
                            r.severity === "critical"
                              ? "#fef2f2"
                              : r.severity === "high"
                              ? "#fffbeb"
                              : "#f3f4f6",
                          color:
                            r.severity === "critical"
                              ? "#dc2626"
                              : r.severity === "high"
                              ? "#d97706"
                              : "#374151",
                        }}
                      >
                        {r.severity ?? "-"}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <select
                        value={r.status ?? "open"}
                        disabled={editingReportId === r._id}
                        onChange={(e) => {
                          const next = e.target.value as (typeof INCIDENT_STATUSES)[number];
                          if (isOffline) {
                            void queueJob({
                              type: "incidentStatusUpdate",
                              payload: { reportId: String(r._id), status: next },
                            });
                            return;
                          }
                          void updateIncident({
                            reportId: r._id,
                            status: next,
                          });
                        }}
                      >
                        {INCIDENT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>
                      {editingReportId === r._id ? null : (
                        <button
                          type="button"
                          onClick={() => startEditing(r)}
                          style={{
                            border: "none",
                            backgroundColor: "transparent",
                            color: "#6b7280",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px",
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteReportId !== null}
        message="This will permanently delete this incident report. This cannot be undone."
        onCancel={() => setPendingDeleteReportId(null)}
        onConfirm={() => void confirmDeleteIncident()}
      />
    </div>
  );
}

