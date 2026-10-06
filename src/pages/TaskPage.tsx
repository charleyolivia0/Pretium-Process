import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dateInputValueToTimestamp, timestampToDateInputValue } from "../utils/dateInput";

type TaskRow = {
  taskId: Id<"projectTasks">;
  projectId: Id<"projects">;
  projectName: string;
  title: string;
  description: string;
  trade: string;
  taskCost?: number;
  dueDate?: number;
  priority: string;
};

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

function toInputDate(ts?: number) {
  return timestampToDateInputValue(ts);
}

function fromInputDate(value: string): number | undefined {
  return dateInputValueToTimestamp(value);
}

export function TaskPage() {
  const rows = useQuery(api.tasks.listUpcomingDashboardTasks, { limit: 200 }) as TaskRow[] | undefined;
  const updateTask = useMutation(api.tasks.updateTask);

  const [editingTaskId, setEditingTaskId] = useState<Id<"projectTasks"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => (rows ?? []).find((r) => r.taskId === editingTaskId) ?? null,
    [rows, editingTaskId]
  );

  function openEditor(task: TaskRow) {
    setEditTitle(task.title ?? "");
    setEditDescription(task.description ?? "");
    setEditDueDate(toInputDate(task.dueDate));
    setEditPriority(task.priority ?? "");
    setEditingTaskId(task.taskId);
  }

  function closeEditor() {
    if (saving) return;
    setEditingTaskId(null);
  }

  async function saveEdit() {
    if (!editingTaskId || !editTitle.trim()) return;
    setSaving(true);
    try {
      await updateTask({
        taskId: editingTaskId,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        dueDate: fromInputDate(editDueDate),
        priority: editPriority.trim() || undefined,
      });
      setEditingTaskId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontFamily: "Montserrat, sans-serif" }}>
      <h2 className="section-header" style={{ margin: 0 }}>Tasks</h2>
      <div style={{ borderRadius: "0.75rem", border: "2px solid var(--color-emerald-800)", backgroundColor: "var(--surface-card)", overflow: "hidden" }}>
        <div style={{ padding: "0.65rem 0.75rem", borderBottom: "1px solid var(--border-strong)", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          Click a task name to edit.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid var(--color-emerald-800)", color: "var(--text-secondary)" }}>
                <th style={{ padding: "0.45rem 0.5rem" }}>Task</th>
                <th style={{ padding: "0.45rem 0.5rem" }}>Project</th>
                <th style={{ padding: "0.45rem 0.5rem" }}>Due</th>
                <th style={{ padding: "0.45rem 0.5rem" }}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {rows === undefined ? (
                <tr><td colSpan={4} style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>No upcoming tasks found.</td></tr>
              ) : (
                rows.map((task) => (
                  <tr key={task.taskId} style={{ borderBottom: "1px solid var(--border-strong)" }}>
                    <td style={{ padding: "0.45rem 0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => openEditor(task)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          margin: 0,
                          color: "#047857",
                          textDecoration: "underline",
                          cursor: "pointer",
                          font: "inherit",
                          textAlign: "left",
                          fontWeight: 600,
                        }}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td style={{ padding: "0.45rem 0.5rem" }}>{task.projectName}</td>
                    <td style={{ padding: "0.45rem 0.5rem" }}>{formatDate(task.dueDate)}</td>
                    <td style={{ padding: "0.45rem 0.5rem" }}>{task.priority?.trim() || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingTaskId && (
        <div
          role="presentation"
          onClick={closeEditor}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderRadius: "0.75rem",
              border: "1px solid var(--border-strong)",
              backgroundColor: "var(--surface-panel)",
              padding: "1rem",
              width: "min(32rem, 95vw)",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: 700 }}>Edit task</h3>
            {!selected ? (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>Task not found.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.55rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{selected.projectName}</div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.2rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>Title</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.2rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>Description</label>
                  <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ width: "100%", resize: "vertical" }} />
                </div>
                <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.2rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>Due date</label>
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} style={{ width: "100%" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.2rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>Priority</label>
                    <input type="text" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={{ width: "100%" }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button type="button" onClick={closeEditor} disabled={saving} style={{ padding: "0.42rem 0.8rem" }}>
                    Cancel
                  </button>
                  <button type="button" onClick={saveEdit} disabled={saving || !editTitle.trim()} style={{ padding: "0.42rem 0.8rem" }}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
