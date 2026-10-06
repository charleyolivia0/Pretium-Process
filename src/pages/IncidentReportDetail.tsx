import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useOfflineCachedQuery } from "../offline/useOfflineCachedQuery";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { projectSectionHref } from "./projectDetail/projectSectionPaths";
import { formatReportType } from "../utils/safetyReportTypes";

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

function formatDateTime(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleString();
}

export function IncidentReportDetail() {
  const { projectId, reportId } = useParams<{ projectId: string; reportId: string }>();

  const project = useOfflineCachedQuery(
    api.projects.getProjectById,
    projectQueryArgs(projectId),
    "projects.getProjectById"
  );

  const report = useOfflineCachedQuery(
    api.safety.getIncidentReportForProject,
    projectId && reportId
      ? { projectId: projectId as Id<"projects">, reportId: reportId as Id<"incidentReports"> }
      : "skip",
    "safety.getIncidentReportForProject"
  );

  if (!projectId || !reportId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Invalid link.</p>
        <Link to="/projects" style={{ color: "#059669", textDecoration: "none" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  if (project === undefined || report === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Project not found.</p>
        <Link to="/projects" style={{ color: "#059669", textDecoration: "none" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  if (report === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Safety report not found.</p>
        <Link
          to={projectSectionHref(projectId, "daily_reports")}
          style={{ color: "#059669", textDecoration: "none" }}
        >
          Back to daily reports
        </Link>
      </div>
    );
  }

  const backHref = projectSectionHref(projectId, "daily_reports");

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "48rem" }}>
      <Link
        to={backHref}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
        }}
      >
        {"<-"} Back to daily reports
      </Link>

      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#022c22",
          marginBottom: "0.25rem",
        }}
      >
        {project.name}
      </h1>
      <p
        style={{
          color: "#6b7280",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
        }}
      >
        Safety report · {formatDate(report.date)}
      </p>

      <div
        style={{
          padding: "1.25rem",
          borderRadius: "0.75rem",
          backgroundColor: "var(--surface-card)",
          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-primary)",
        }}
      >
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 0.75rem",
          }}
        >
          {report.title}
        </h2>

        <dl
          style={{
            margin: "0 0 1rem",
            display: "grid",
            gap: "0.5rem 1rem",
            fontSize: "0.875rem",
            gridTemplateColumns: "auto 1fr",
          }}
        >
          <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Incident date</dt>
          <dd style={{ margin: 0 }}>{formatDate(report.date)}</dd>

          <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Report type</dt>
          <dd style={{ margin: 0 }}>{formatReportType(report.reportType)}</dd>

          <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Severity</dt>
          <dd style={{ margin: 0, textTransform: "capitalize" }}>{report.severity ?? "—"}</dd>

          <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Outcome</dt>
          <dd style={{ margin: 0, textTransform: "capitalize" }}>{report.status ?? "open"}</dd>

          <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Reported by</dt>
          <dd style={{ margin: 0 }}>{report.reporterDisplay}</dd>

          <dt style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Submitted</dt>
          <dd style={{ margin: 0 }}>{formatDateTime(report.createdAt)}</dd>
        </dl>

        <div>
          <div style={{ fontWeight: 600, marginBottom: "0.35rem", fontSize: "0.875rem" }}>Description</div>
          <div
            style={{
              fontSize: "0.9375rem",
              color: "#374151",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {report.description?.trim() ? report.description : "No description provided."}
          </div>
        </div>
      </div>
    </div>
  );
}

export default IncidentReportDetail;
