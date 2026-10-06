import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { useMutation, useQuery } from "convex/react";
import type { Doc } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { cardStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { projectSubtradeDetailHref, safetyJobSummaryHref } from "./projectDetail/projectSectionPaths";

export function SafetyProjectTrades() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const textColor = theme === "dark" ? "#ffffff" : "#111827";

  const project = useQuery(api.projects.getProjectById, projectQueryArgs(id));
  const subtrades = useQuery(api.subtrades.listByProject, projectQueryArgs(id));
  const removeSubtrade = useMutation(api.subtrades.remove);

  const [pendingDeleteSubtrade, setPendingDeleteSubtrade] = useState<Doc<"projectSubtrades"> | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDeleteSubtrade() {
    if (!pendingDeleteSubtrade) return;
    setDeleting(true);
    try {
      await removeSubtrade({ subtradeId: pendingDeleteSubtrade._id });
      setPendingDeleteSubtrade(null);
    } finally {
      setDeleting(false);
    }
  }

  if (id == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>No project selected.</p>
      </div>
    );
  }

  if (project === undefined || subtrades === undefined) {
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
        Trade employee documents - {project.name}
      </h1>
      <p style={{ fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Click a trade to open it in the project tracker. Use Manage for employee safety documents.
      </p>

      <div style={{ ...cardStyle, color: textColor }}>
        {subtrades.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            No trades yet. Add subtrades from the Project detail page.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: "0.875rem",
              color: "#374151",
            }}
          >
            {subtrades.map((t: Doc<"projectSubtrades">) => (
              <li
                key={t._id}
                style={{
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => navigate(projectSubtradeDetailHref(id, String(t._id)))}
                  style={{
                    flex: "1 1 auto",
                    minWidth: 0,
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                    color: "#111827",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#6b7280",
                      marginTop: "0.15rem",
                    }}
                  >
                    {t.contractStatus === "unsigned"
                      ? "Unsigned contract"
                      : t.contractStatus === "signed_by_subtrade"
                        ? "Signed by subtrade"
                        : "Signed by Justin"}
                    {t.budget != null && ` · Budget $${t.budget.toLocaleString()}`}
                  </div>
                </button>
                <Link
                  to={`/safety/project/${id}/subtrade/${t._id}`}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "999px",
                    border: "1px solid #059669",
                    backgroundColor: "#ecfdf5",
                    color: "#047857",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    textDecoration: "none",
                    fontFamily: "Montserrat, sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  Manage
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingDeleteSubtrade(t)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "999px",
                    border: "1px solid #dc2626",
                    backgroundColor: "transparent",
                    color: "#dc2626",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteSubtrade !== null}
        title="Are you sure?"
        confirmLabel="Yes, delete"
        loading={deleting}
        message={
          pendingDeleteSubtrade ? (
            <>
              This will permanently remove trade{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{pendingDeleteSubtrade.name}</span>{" "}
              from the project.
            </>
          ) : (
            ""
          )
        }
        onCancel={() => {
          if (!deleting) setPendingDeleteSubtrade(null);
        }}
        onConfirm={confirmDeleteSubtrade}
      />
    </div>
  );
}
