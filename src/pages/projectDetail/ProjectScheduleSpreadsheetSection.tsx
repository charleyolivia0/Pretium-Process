import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { primaryButtonStyle } from "../../theme";
import { taskSpreadsheetStatusSelectStyle, type TaskSpreadsheetStatusKey } from "../../utils/taskStatusSummaryColors";

const MS_PER_DAY = 86400000;

const CHANGES_LIST_PANEL: React.CSSProperties = {
  position: "relative",
  borderRadius: "0.75rem",
  border: "2px solid var(--color-emerald-800)",
  backgroundColor: "var(--surface-card)",
  padding: "1rem",
  paddingTop: "2.75rem",
  marginBottom: "1.5rem",
};

const ADD_PLUS_BTN: React.CSSProperties = {
  position: "absolute",
  top: "0.75rem",
  right: "0.75rem",
  width: "2.35rem",
  height: "2.35rem",
  borderRadius: "0.5rem",
  border: "none",
  backgroundColor: "#059669",
  color: "#fff",
  fontWeight: 700,
  fontSize: "1.25rem",
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Montserrat, sans-serif",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "0.65rem 0.5rem",
  color: "var(--text-primary)",
  fontWeight: 600,
  fontSize: "0.8125rem",
  borderBottom: "2px solid var(--border-strong)",
  whiteSpace: "nowrap",
  backgroundColor: "var(--surface-muted)",
};

const TD: React.CSSProperties = {
  padding: "0.55rem 0.5rem",
  fontSize: "0.8125rem",
  color: "var(--text-primary)",
  borderBottom: "1px solid var(--border-strong)",
  verticalAlign: "top",
  maxWidth: "14rem",
};

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

function formatMoney(n: number | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function taskStatusLabel(status: string): string {
  switch (status) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    default:
      return status;
  }
}

type SpreadsheetStatusValue = TaskSpreadsheetStatusKey;

function taskStatusToSpreadsheetValue(status: string): SpreadsheetStatusValue {
  switch (status) {
    case "done":
      return "complete";
    case "in_progress":
    case "blocked":
      return "in_progress";
    case "not_started":
    default:
      return "planning";
  }
}

function spreadsheetValueToTaskStatus(value: SpreadsheetStatusValue): "not_started" | "in_progress" | "done" {
  switch (value) {
    case "complete":
      return "done";
    case "in_progress":
      return "in_progress";
    case "overdue":
    case "planning":
    default:
      return "not_started";
  }
}

function roleLabel(role?: string): string {
  if (!role) return "";
  const map: Record<string, string> = {
    project_manager: "Project Manager",
    coordinator: "Coordinator",
    accounting: "Accounting",
    safety: "Safety",
    admin: "Admin",
    site_superintendent: "Site Superintendent",
  };
  return map[role] ?? role.replace(/_/g, " ");
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function inclusiveCalendarDays(start?: number, end?: number): number | null {
  if (start == null || end == null) return null;
  const a = startOfDay(start);
  const b = startOfDay(end);
  if (b < a) return null;
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

function isTaskOverdue(task: TaskDoc): boolean {
  if (task.status === "done") return false;
  const endTs = task.dueDate ?? task.baselineEndDate;
  if (endTs == null) return false;
  return startOfDay(endTs) < startOfDay(Date.now());
}

type TaskDoc = Doc<"projectTasks"> & {
  priority?: string;
  material?: string;
  taskCost?: number;
  scheduleComment?: string;
};

type SubtradeDoc = Doc<"projectSubtrades">;

type UserRow = { _id: Id<"users">; name?: string; email?: string; role?: string };

export function ProjectScheduleSpreadsheetSection({
  projectId,
  tasks,
  subtrades,
  usersForAssignment,
  onOpenTaskEditor,
}: {
  projectId: Id<"projects">;
  tasks: Doc<"projectTasks">[] | undefined;
  subtrades: Doc<"projectSubtrades">[] | undefined;
  usersForAssignment: UserRow[] | undefined;
  onOpenTaskEditor: (task: Doc<"projectTasks">) => void;
}) {
  const createTask = useMutation(api.tasks.createTask);
  const updateTaskStatus = useMutation(api.tasks.updateTaskStatus);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskStart, setNewTaskStart] = useState("");
  const [newTaskEnd, setNewTaskEnd] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("");
  const [newTaskMaterial, setNewTaskMaterial] = useState("");
  const [newTaskCost, setNewTaskCost] = useState("");
  const [newTaskComment, setNewTaskComment] = useState("");
  const [newTaskTradeId, setNewTaskTradeId] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [statusSavingTaskIds, setStatusSavingTaskIds] = useState<string[]>([]);

  const userById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of usersForAssignment ?? []) {
      m.set(String(u._id), u);
    }
    return m;
  }, [usersForAssignment]);

  const sortedTasks = useMemo(() => {
    const list = [...(tasks ?? [])] as TaskDoc[];
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return list;
  }, [tasks]);

  const subtradeById = useMemo(() => {
    const m = new Map<string, SubtradeDoc>();
    for (const s of subtrades ?? []) {
      m.set(String(s._id), s as SubtradeDoc);
    }
    return m;
  }, [subtrades]);

  function dateInputToLocalMidnightMs(value: string): number | undefined {
    if (!value) return undefined;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d).getTime();
  }

  function resetTaskModal() {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskStart("");
    setNewTaskEnd("");
    setNewTaskPriority("");
    setNewTaskMaterial("");
    setNewTaskCost("");
    setNewTaskComment("");
    setNewTaskTradeId("");
    setTaskModalOpen(false);
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const startMs = dateInputToLocalMidnightMs(newTaskStart);
    const endMs = dateInputToLocalMidnightMs(newTaskEnd);
    const costParsed = newTaskCost.trim() ? parseFloat(newTaskCost) : undefined;
    if (costParsed !== undefined && Number.isNaN(costParsed)) return;
    setTaskSaving(true);
    try {
      await createTask({
        projectId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        startDate: startMs,
        dueDate: endMs,
        priority: newTaskPriority.trim() || undefined,
        material: newTaskMaterial.trim() || undefined,
        taskCost: costParsed,
        scheduleComment: newTaskComment.trim() || undefined,
        subtradeIdsOnSite: newTaskTradeId ? [newTaskTradeId as Id<"projectSubtrades">] : undefined,
        isDailyReport: false,
      });
      resetTaskModal();
    } finally {
      setTaskSaving(false);
    }
  }

  function ownerDisplay(task: TaskDoc): string {
    const parts: string[] = [];
    if (task.ownerUserId) {
      const u = userById.get(String(task.ownerUserId));
      if (u?.name) parts.push(u.name);
      else if (u?.email) parts.push(u.email);
    }
    if (task.ownerRole) {
      const rl = roleLabel(task.ownerRole);
      if (rl) parts.push(rl);
    }
    return parts.length ? parts.join(" · ") : "—";
  }

  function taskRowDates(task: TaskDoc) {
    const startTs = task.startDate ?? task.baselineStartDate;
    const endTs = task.dueDate ?? task.baselineEndDate;
    const days = inclusiveCalendarDays(startTs, endTs);
    const duration = days != null ? `${days}d` : "—";
    return { startTs, endTs, days, duration };
  }

  function tradeDisplay(task: TaskDoc): string {
    const ids = task.subtradeIdsOnSite ?? [];
    if (!ids.length) return "—";
    return ids
      .map((id) => subtradeById.get(String(id))?.name ?? "Unknown trade")
      .join(", ");
  }

  async function handleStatusChange(task: TaskDoc, value: SpreadsheetStatusValue) {
    const nextStatus = spreadsheetValueToTaskStatus(value);
    const currentValue = isTaskOverdue(task) ? "overdue" : taskStatusToSpreadsheetValue(task.status);
    if (nextStatus === task.status || value === currentValue) return;
    const taskId = String(task._id);
    if (statusSavingTaskIds.includes(taskId)) return;
    setStatusSavingTaskIds((prev) => [...prev, taskId]);
    try {
      await updateTaskStatus({ taskId: task._id, status: nextStatus });
    } finally {
      setStatusSavingTaskIds((prev) => prev.filter((id) => id !== taskId));
    }
  }

  const modalBackdrop: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 55,
    padding: "1rem",
  };

  const modalPanel: React.CSSProperties = {
    backgroundColor: "var(--surface-panel)",
    borderRadius: "0.75rem",
    padding: "1.5rem",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
    maxWidth: "28rem",
    width: "100%",
    maxHeight: "min(90vh, 36rem)",
    overflow: "auto",
  };

  return (
    <>
      <div style={CHANGES_LIST_PANEL}>
        <span
          style={{
            position: "absolute",
            top: "0.85rem",
            left: "1rem",
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Tasks
        </span>
        <button
          type="button"
          aria-label="Add task"
          style={ADD_PLUS_BTN}
          onClick={() => setTaskModalOpen(true)}
        >
          +
        </button>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "72rem" }}>
            <thead>
              <tr>
                <th style={TH}>Task</th>
                <th style={TH}>Priority</th>
                <th style={TH}>Status</th>
                <th style={TH}>Trade</th>
                <th style={TH}>Description</th>
                <th style={TH}>Progress</th>
                <th style={TH}>Start date</th>
                <th style={TH}>End date</th>
                <th style={TH}>Days</th>
                <th style={TH}>Duration</th>
                <th style={TH}>Owner</th>
                <th style={TH}>Material</th>
                <th style={TH}>Cost</th>
                <th style={TH}>Comment</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ ...TD, color: "var(--text-secondary)" }}>
                    No tasks yet. Use + to add one.
                  </td>
                </tr>
              ) : (
                sortedTasks.map((task) => {
                  const { startTs, endTs, days, duration } = taskRowDates(task);
                  const statusSelectKey: TaskSpreadsheetStatusKey = isTaskOverdue(task)
                    ? "overdue"
                    : taskStatusToSpreadsheetValue(task.status);
                  return (
                    <tr key={task._id}>
                      <td style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => onOpenTaskEditor(task)}
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
                          }}
                        >
                          {task.title}
                        </button>
                      </td>
                      <td style={TD}>{task.priority?.trim() || "—"}</td>
                      <td style={TD}>
                        <select
                          value={statusSelectKey}
                          onChange={(e) => handleStatusChange(task, e.target.value as SpreadsheetStatusValue)}
                          disabled={statusSavingTaskIds.includes(String(task._id))}
                          aria-label={`Status for ${task.title}`}
                          style={{
                            width: "100%",
                            minWidth: "9rem",
                            fontFamily: "Montserrat, sans-serif",
                            fontSize: "0.8125rem",
                            cursor: statusSavingTaskIds.includes(String(task._id)) ? "wait" : "pointer",
                            ...taskSpreadsheetStatusSelectStyle(statusSelectKey),
                            opacity: statusSavingTaskIds.includes(String(task._id)) ? 0.75 : 1,
                          }}
                          title={task.status === "blocked" ? "Blocked currently maps to In Progress in this view." : undefined}
                        >
                          <option value="overdue" disabled>
                            Overdue
                          </option>
                          <option value="planning">Planning</option>
                          <option value="in_progress">In Progress</option>
                          <option value="complete">Complete</option>
                        </select>
                      </td>
                      <td style={TD}>{tradeDisplay(task)}</td>
                      <td style={{ ...TD, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {task.description?.trim() || "—"}
                      </td>
                      <td style={TD}>
                        {task.progressPercent != null ? `${task.progressPercent}%` : "—"}
                      </td>
                      <td style={TD}>{formatDate(startTs)}</td>
                      <td style={TD}>{formatDate(endTs)}</td>
                      <td style={TD}>{days != null ? String(days) : "—"}</td>
                      <td style={TD}>{duration}</td>
                      <td style={TD}>{ownerDisplay(task)}</td>
                      <td style={TD}>{task.material?.trim() || "—"}</td>
                      <td style={TD}>{formatMoney(task.taskCost)}</td>
                      <td style={{ ...TD, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {task.scheduleComment?.trim() || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {taskModalOpen && (
        <div
          role="presentation"
          style={modalBackdrop}
          onClick={() => !taskSaving && resetTaskModal()}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="new-schedule-task-title" style={modalPanel} onClick={(e) => e.stopPropagation()}>
            <h2 id="new-schedule-task-title" style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}>
              New task
            </h2>
            <form onSubmit={handleCreateTask} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Task title</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  style={{ width: "100%", fontFamily: "Montserrat, sans-serif" }}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Description (optional)</label>
                <textarea value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical", fontFamily: "Montserrat, sans-serif" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Start date</label>
                  <input type="date" value={newTaskStart} onChange={(e) => setNewTaskStart(e.target.value)} style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>End date</label>
                  <input type="date" value={newTaskEnd} onChange={(e) => setNewTaskEnd(e.target.value)} style={{ width: "100%" }} min={newTaskStart || undefined} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Priority</label>
                  <input type="text" value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)} placeholder="e.g. High" style={{ width: "100%" }} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Material</label>
                  <input type="text" value={newTaskMaterial} onChange={(e) => setNewTaskMaterial(e.target.value)} style={{ width: "100%" }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Trade</label>
                <select value={newTaskTradeId} onChange={(e) => setNewTaskTradeId(e.target.value)} style={{ width: "100%", fontFamily: "Montserrat, sans-serif" }}>
                  <option value="">Select trade</option>
                  {(subtrades ?? [])
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((s) => (
                      <option key={String(s._id)} value={String(s._id)}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Cost ($)</label>
                <input type="number" min={0} step={0.01} value={newTaskCost} onChange={(e) => setNewTaskCost(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Comment</label>
                <textarea value={newTaskComment} onChange={(e) => setNewTaskComment(e.target.value)} rows={2} style={{ width: "100%", resize: "vertical", fontFamily: "Montserrat, sans-serif" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  disabled={taskSaving}
                  onClick={resetTaskModal}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-strong)",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    cursor: taskSaving ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={taskSaving || !newTaskTitle.trim()} style={{ ...primaryButtonStyle, opacity: taskSaving || !newTaskTitle.trim() ? 0.5 : 1 }}>
                  {taskSaving ? "Saving…" : "Add task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
