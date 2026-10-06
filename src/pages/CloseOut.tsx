import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { innerWhiteCardStyle, secondaryButtonStyle, shellCardStyle } from "../theme";

export function CloseOut() {
  const projects = useQuery(api.projects.listCloseOutProjects, {});
  const returnProjectToTracker = useMutation(api.projects.returnProjectToTracker);
  const [returningId, setReturningId] = useState<Id<"projects"> | null>(null);
  const [returnError, setReturnError] = useState<{ projectId: Id<"projects">; message: string } | null>(null);

  async function handleReturnToTracker(projectId: Id<"projects">) {
    setReturnError(null);
    setReturningId(projectId);
    try {
      await returnProjectToTracker({ projectId });
    } catch (e) {
      setReturnError({
        projectId,
        message: e instanceof Error ? e.message : "Could not move back to Tracker",
      });
    } finally {
      setReturningId(null);
    }
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="page-title">
          Close Out <LogoMark />
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
          Jobs listed here were moved from the project Summary when wrapping up. Open one for As Built, O&amp;M,
          Warranty, Certification, and Shop Drawings.
        </p>
      </div>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
          Jobs in Close Out
        </h2>
        {projects === undefined ? (
          <p style={{ color: "#d1fae5" }}>Loading...</p>
        ) : projects.length === 0 ? (
          <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
            <p style={{ color: "#6b7280", margin: 0 }}>
              No jobs in Close Out yet. From a project’s <strong>Summary</strong> tab, use <strong>Move to Close Out</strong> when
              the job is finishing.
            </p>
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
            {projects.map((project) => {
              const isReturning = returningId === project._id;
              const cardError = returnError?.projectId === project._id ? returnError.message : null;

              return (
                <div key={project._id} className="card-hover" style={{ ...innerWhiteCardStyle }}>
                  <Link
                    to={`/close-out/project/${project._id}`}
                    style={{ textDecoration: "none", color: "inherit", display: "block" }}
                  >
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
                      {project.name}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                      {project.clientName}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      {project.location || "Location not set"}
                    </div>
                  </Link>
                  <button
                    type="button"
                    disabled={isReturning}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleReturnToTracker(project._id);
                    }}
                    style={{
                      ...secondaryButtonStyle,
                      marginTop: "0.75rem",
                      width: "100%",
                      fontSize: "0.8125rem",
                      cursor: isReturning ? "not-allowed" : "pointer",
                      opacity: isReturning ? 0.7 : 1,
                    }}
                  >
                    {isReturning ? "Moving…" : "Move back to Tracker"}
                  </button>
                  {cardError && (
                    <div style={{ fontSize: "0.75rem", color: "#dc2626", marginTop: "0.35rem" }}>{cardError}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
