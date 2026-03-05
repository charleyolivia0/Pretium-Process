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

export function Projects() {
  const projects = useQuery(api.projects.listProjects);

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22", marginBottom: "0.5rem" }}>
        Project Tracker
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Select a project to view details, tasks, documents, and schedule.
      </p>
      {projects === undefined ? (
        <p style={{ color: "#6b7280" }}>Loading…</p>
      ) : projects.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>No projects yet.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
            gap: "1rem",
          }}
        >
          {projects.map((p) => (
            <Link
              key={p._id}
              to={`/projects/${p._id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  ...cardStyle,
                  cursor: "pointer",
                  transition: "box-shadow 0.2s",
                }}
              >
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "#022c22",
                    marginBottom: "0.25rem",
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.5rem" }}>
                  {p.clientName}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
                  {healthBadge(p.healthStatus)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
