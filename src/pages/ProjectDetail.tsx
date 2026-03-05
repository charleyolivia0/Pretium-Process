import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const cardStyle = {
  padding: "1.25rem",
  borderRadius: "0.75rem",
  backgroundColor: "#ffffff",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
};

const TAB_STYLES = (active: boolean) => ({
  padding: "0.5rem 1rem",
  border: "none",
  borderRadius: "0.5rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer" as const,
  fontFamily: "Montserrat, sans-serif",
  backgroundColor: active ? "#ecfdf5" : "transparent",
  color: active ? "#059669" : "#6b7280",
});

const TASK_STATUSES = ["not_started", "in_progress", "blocked", "done"] as const;
const DOC_TYPES = ["contract", "CO", "invoice", "RFI", "safety_report", "schedule", "other"];

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"summary" | "tasks" | "documents" | "schedule">("summary");

  const project = useQuery(
    api.projects.getProjectById,
    id ? { projectId: id } : "skip"
  );
  const tasks = useQuery(
    api.tasks.listTasksByProject,
    id ? { projectId: id } : "skip"
  );
  const documents = useQuery(
    api.documents.listDocumentsByProject,
    id ? { projectId: id } : "skip"
  );

  const createTask = useMutation(api.tasks.createTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);
  const createDocument = useMutation(api.documents.createDocumentRecord);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [newDocType, setNewDocType] = useState("other");
  const [newDocUrl, setNewDocUrl] = useState("");

  if (id == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>No project selected.</p>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Project not found.</p>
        <Link to="/projects" style={{ color: "#059669" }}>Back to projects</Link>
      </div>
    );
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await createTask({ projectId: id, title: newTaskTitle.trim() });
    setNewTaskTitle("");
  }

  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!newDocName.trim() || !newDocUrl.trim()) return;
    await createDocument({
      projectId: id,
      name: newDocName.trim(),
      type: newDocType,
      fileUrl: newDocUrl.trim(),
    });
    setNewDocName("");
    setNewDocType("other");
    setNewDocUrl("");
  }

  const scheduleTasks = (tasks ?? [])
    .filter((t) => t.dueDate != null)
    .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <Link
        to="/projects"
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
        }}
      >
        ← Back to projects
      </Link>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22", marginBottom: "0.25rem" }}>
        {project.name}
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
        {project.clientName}
        {project.location && ` · ${project.location}`}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {(["summary", "tasks", "documents", "schedule"] as const).map((t) => (
          <button
            key={t}
            type="button"
            style={TAB_STYLES(tab === t)}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
            Summary
          </h2>
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <dt style={{ color: "#6b7280", minWidth: "6rem" }}>Status</dt>
              <dd style={{ margin: 0, color: "#111827" }}>{project.status.replace(/_/g, " ")}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <dt style={{ color: "#6b7280", minWidth: "6rem" }}>Health</dt>
              <dd style={{ margin: 0 }}>
                {project.healthStatus ?? "—"}
                {project.healthNotes && ` · ${project.healthNotes}`}
              </dd>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <dt style={{ color: "#6b7280", minWidth: "6rem" }}>Start</dt>
              <dd style={{ margin: 0 }}>{formatDate(project.startDate)}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <dt style={{ color: "#6b7280", minWidth: "6rem" }}>End</dt>
              <dd style={{ margin: 0 }}>{formatDate(project.endDate)}</dd>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <dt style={{ color: "#6b7280", minWidth: "6rem" }}>Budget</dt>
              <dd style={{ margin: 0 }}>
                {project.budget != null ? `$${project.budget.toLocaleString()}` : "—"}
              </dd>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <dt style={{ color: "#6b7280", minWidth: "6rem" }}>Actual cost</dt>
              <dd style={{ margin: 0 }}>
                {project.actualCost != null ? `$${project.actualCost.toLocaleString()}` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {tab === "tasks" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
            Tasks
          </h2>
          <form onSubmit={handleAddTask} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <input
              type="text"
              placeholder="New task title"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid #e5e7eb",
                fontFamily: "Montserrat, sans-serif",
              }}
            />
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
              Add
            </button>
          </form>
          {tasks === undefined ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
          ) : tasks.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No tasks yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Task</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "0.5rem" }}>{t.title}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <select
                          value={t.status}
                          onChange={(e) =>
                            updateTaskStatus({
                              taskId: t._id,
                              status: e.target.value as (typeof TASK_STATUSES)[number],
                            })
                          }
                          style={{
                            padding: "0.25rem 0.5rem",
                            borderRadius: "0.375rem",
                            border: "1px solid #e5e7eb",
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s.replace(/_/g, " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "0.5rem", color: "#6b7280" }}>{formatDate(t.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
            Documents
          </h2>
          <form onSubmit={handleAddDocument} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Document name"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  fontFamily: "Montserrat, sans-serif",
                  minWidth: "10rem",
                }}
              />
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                {DOC_TYPES.map((ty) => (
                  <option key={ty} value={ty}>{ty}</option>
                ))}
              </select>
              <input
                type="url"
                placeholder="File URL (link)"
                value={newDocUrl}
                onChange={(e) => setNewDocUrl(e.target.value)}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  fontFamily: "Montserrat, sans-serif",
                  minWidth: "14rem",
                }}
              />
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
                Add
              </button>
            </div>
          </form>
          {documents === undefined ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
          ) : documents.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No documents yet. Add a link above.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {documents.map((d) => (
                <li key={d._id} style={{ marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#059669", textDecoration: "none" }}
                  >
                    {d.name}
                  </a>
                  <span style={{ color: "#6b7280", marginLeft: "0.5rem" }}>
                    {d.type} · {formatDate(d.uploadedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
            Schedule
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Tasks with due dates (milestones).
          </p>
          {scheduleTasks.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No scheduled tasks yet.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {scheduleTasks.map((t) => (
                <li key={t._id} style={{ marginBottom: "0.5rem", fontSize: "0.875rem" }}>
                  <span style={{ color: "#111827" }}>{t.title}</span>
                  <span style={{ color: "#6b7280", marginLeft: "0.5rem" }}>
                    — {formatDate(t.dueDate)}
                    {t.status !== "done" && (
                      <span style={{ marginLeft: "0.25rem" }}>({t.status.replace(/_/g, " ")})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
