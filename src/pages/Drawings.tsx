import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LogoMark } from "../components/LogoMark";
import { innerWhiteCardStyle, shellCardStyle } from "../theme";

export function Drawings() {
  const projects = useQuery(api.projects.listProjects, {});

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title">
          Drawings <LogoMark />
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
          Select a project to open drawings, folders, and uploads.
        </p>
      </div>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
          Projects
        </h2>
        {projects === undefined ? (
          <p style={{ color: "#d1fae5" }}>Loading...</p>
        ) : projects.length === 0 ? (
          <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
            <p style={{ color: "#6b7280", margin: 0 }}>No projects yet.</p>
          </div>
        ) : (
          <div
            style={{
              marginTop: "0.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
              gap: "1rem",
            }}
          >
            {projects.map((project) => (
              <Link
                key={project._id}
                to={`/drawings/project/${project._id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="card-hover" style={{ ...innerWhiteCardStyle, cursor: "pointer" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                    {project.name}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                    {project.clientName}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    {project.location || "Location not set"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
