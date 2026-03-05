import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";

const cardStyle = {
  padding: "1.25rem",
  borderRadius: "0.75rem",
  backgroundColor: "#ffffff",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
};

function healthBadge(health?: string) {
  if (!health) return null;
  const colors: Record<string, string> = {
    green: "#059669",
    amber: "#d97706",
    red: "#dc2626",
  };
  const bg: Record<string, string> = {
    green: "#ecfdf5",
    amber: "#fffbeb",
    red: "#fef2f2",
  };
  return (
    <span
      style={{
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.2rem 0.5rem",
        borderRadius: "0.375rem",
        backgroundColor: bg[health] ?? "#f3f4f6",
        color: colors[health] ?? "#374151",
      }}
    >
      {health}
    </span>
  );
}

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

export function Dashboard() {
  const user = useQuery(api.users.current);
  const summary = useQuery(api.projects.getDashboardSummary);
  const projects = useQuery(api.projects.listProjects);

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22", marginBottom: "0.25rem" }}>
        Dashboard
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Welcome, {user?.name ?? user?.email ?? "User"}.
        {user?.role && (
          <span style={{ marginLeft: "0.5rem", color: "#059669" }}>
            ({user.role.replace(/_/g, " ")})
          </span>
        )}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={cardStyle}>
          <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.25rem" }}>
            Active projects
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22" }}>
            {summary?.activeCount ?? "—"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.25rem" }}>
            At risk
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: summary?.atRiskCount ? "#dc2626" : "#022c22" }}>
            {summary?.atRiskCount ?? "—"}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.25rem" }}>
            Tasks due this week
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22" }}>
            {summary?.upcomingTasksCount ?? "—"}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
          All projects
        </h2>
        {projects === undefined ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
        ) : projects.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            No projects yet. Add one from the Project Tracker.
          </p>
        ) : (
          <div
            style={{
              overflowX: "auto",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "#374151" }}>
                    Project
                  </th>
                  <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "#374151" }}>
                    Client
                  </th>
                  <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "#374151" }}>
                    Status
                  </th>
                  <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "#374151" }}>
                    Health
                  </th>
                  <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "#374151" }}>
                    End date
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.75rem" }}>
                      <Link
                        to={`/projects/${p._id}`}
                        style={{
                          color: "#059669",
                          fontWeight: 500,
                          textDecoration: "none",
                        }}
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td style={{ padding: "0.75rem", color: "#4b5563" }}>{p.clientName}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.375rem",
                          backgroundColor: "#f3f4f6",
                          color: "#374151",
                        }}
                      >
                        {p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem" }}>{healthBadge(p.healthStatus)}</td>
                    <td style={{ padding: "0.75rem", color: "#6b7280" }}>{formatDate(p.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
