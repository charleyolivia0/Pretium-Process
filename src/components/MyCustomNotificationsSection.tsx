import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { cardStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";

const CHANGE_DOC_TYPES = new Set(["RFI", "SI", "COR", "CO", "PCN", "SUBMITTAL"]);

const INTERVAL_OPTIONS = [
  { value: "3", label: "3 days" },
  { value: "5", label: "5 days" },
  { value: "7", label: "1 week" },
  { value: "14", label: "2 weeks" },
] as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.5rem",
  borderRadius: "0.35rem",
  border: "1px solid #d1d5db",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.8125rem",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "3.5rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.2rem",
};

function formatWhen(ts: number | undefined, kind: string, sentAt?: number) {
  if (kind === "scheduled") {
    if (sentAt != null) return `Sent ${new Date(sentAt).toLocaleString()}`;
    if (ts == null) return "—";
    return new Date(ts).toLocaleString();
  }
  return "Repeats when condition is met";
}

function conditionSummary(row: {
  kind: string;
  conditionLabel?: string;
  intervalDays?: number;
  projectName?: string;
  documentName?: string;
  taskName?: string;
}) {
  if (row.kind !== "condition") return null;
  const parts = [row.conditionLabel ?? "Condition"];
  if (row.projectName) parts.push(row.projectName);
  if (row.documentName) parts.push(`"${row.documentName}"`);
  if (row.taskName) parts.push(`"${row.taskName}"`);
  if (row.intervalDays) parts.push(`every ${row.intervalDays}d`);
  return parts.join(" · ");
}

export function MyCustomNotificationsSection() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const items = useQuery(api.userCustomNotifications.listForCurrentUser);
  const projects = useQuery(api.projects.listProjects, {});
  const createScheduled = useMutation(api.userCustomNotifications.createScheduled);
  const createCondition = useMutation(api.userCustomNotifications.createCondition);
  const updateItem = useMutation(api.userCustomNotifications.update);
  const removeItem = useMutation(api.userCustomNotifications.remove);

  const [mode, setMode] = useState<"scheduled" | "condition">("scheduled");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAtLocal, setRemindAtLocal] = useState("");
  const [projectId, setProjectId] = useState("");
  const [conditionType, setConditionType] = useState<
    "project_changes_stale" | "document_stale" | "task_overdue" | "custom"
  >("project_changes_stale");
  const [customConditionText, setCustomConditionText] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [intervalDays, setIntervalDays] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProjectId = projectId ? (projectId as Id<"projects">) : undefined;
  const documents = useQuery(
    api.documents.listDocumentsByProject,
    selectedProjectId ? { projectId: selectedProjectId } : "skip",
  );
  const tasks = useQuery(
    api.tasks.listTasksByProject,
    selectedProjectId && conditionType === "task_overdue"
      ? { projectId: selectedProjectId }
      : "skip",
  );

  const changeDocuments = useMemo(
    () =>
      (documents ?? []).filter((d) => CHANGE_DOC_TYPES.has(d.type.trim().toUpperCase())),
    [documents],
  );

  const openTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.status !== "done"),
    [tasks],
  );

  function resetForm() {
    setTitle("");
    setBody("");
    setRemindAtLocal("");
    setProjectId("");
    setDocumentId("");
    setTaskId("");
    setIntervalDays("5");
    setCustomConditionText("");
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "scheduled") {
        if (!remindAtLocal) throw new Error("Pick a date and time");
        const remindAt = new Date(remindAtLocal).getTime();
        await createScheduled({
          title,
          body: body.trim() || undefined,
          remindAt,
          projectId: selectedProjectId,
        });
      } else {
        const interval = Number(intervalDays) as 3 | 5 | 7 | 14;
        await createCondition({
          title,
          body: body.trim() || undefined,
          conditionType,
          intervalDays: interval,
          customConditionText:
            conditionType === "custom" ? customConditionText.trim() : undefined,
          projectId:
            conditionType === "project_changes_stale" || conditionType === "custom"
              ? selectedProjectId
              : undefined,
          documentId:
            conditionType === "document_stale" && documentId
              ? (documentId as Id<"documents">)
              : undefined,
          taskId:
            conditionType === "task_overdue" && taskId
              ? (taskId as Id<"projectTasks">)
              : undefined,
        });
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create notification");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEnabled(id: Id<"userCustomNotifications">, enabled: boolean) {
    try {
      await updateItem({ id, enabled: !enabled });
    } catch {
      // refetch
    }
  }

  async function handleRemove(id: Id<"userCustomNotifications">) {
    try {
      await removeItem({ id });
    } catch {
      // refetch
    }
  }

  const sectionLabelStyle: React.CSSProperties = {
    margin: "0.75rem 0 0.35rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: isDark ? "#9ca3af" : "#6b7280",
  };

  return (
    <section
      style={{
        ...cardStyle,
        backgroundColor: isDark ? "#020617" : cardStyle.backgroundColor,
        borderColor: isDark ? "#1f2937" : (cardStyle.border as string | undefined),
        boxShadow: isDark ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
      }}
    >
      <h2
        style={{
          fontSize: "1.125rem",
          fontWeight: 600,
          color: isDark ? "#e5e7eb" : "#111827",
          marginBottom: "0.35rem",
        }}
      >
        My custom notifications
      </h2>
      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.8125rem",
          color: isDark ? "#9ca3af" : "#6b7280",
        }}
      >
        Create personal reminders or rules that notify you in the app when something happens.
      </p>

      {items === undefined ? (
        <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: 0 }}>Loading...</p>
      ) : (
        <>
          {items.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
              {items.map((row) => (
                <div
                  key={row._id}
                  style={{
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: `1px solid ${isDark ? "#1f2937" : "#e5e7eb"}`,
                    backgroundColor: isDark ? "#0f172a" : "#f9fafb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          color: isDark ? "#e5e7eb" : "#111827",
                        }}
                      >
                        {row.title}
                        {!row.enabled ? (
                          <span style={{ marginLeft: "0.35rem", color: "#9ca3af", fontWeight: 500 }}>
                            (paused)
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: isDark ? "#9ca3af" : "#6b7280", marginTop: "0.15rem" }}>
                        {row.kind === "scheduled"
                          ? `Scheduled · ${formatWhen(row.remindAt, row.kind, row.sentAt)}`
                          : conditionSummary(row)}
                      </div>
                      {row.body ? (
                        <div style={{ fontSize: "0.8125rem", color: isDark ? "#d1d5db" : "#374151", marginTop: "0.25rem" }}>
                          {row.body}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => void handleToggleEnabled(row._id, row.enabled)}
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "0.35rem",
                          border: "1px solid #d1d5db",
                          background: "transparent",
                          cursor: "pointer",
                          color: isDark ? "#e5e7eb" : "#374151",
                        }}
                      >
                        {row.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemove(row._id)}
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.5rem",
                          borderRadius: "0.35rem",
                          border: "1px solid #fecaca",
                          background: "transparent",
                          cursor: "pointer",
                          color: "#dc2626",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "0.8125rem", color: isDark ? "#9ca3af" : "#6b7280", margin: "0 0 1rem" }}>
              No custom notifications yet.
            </p>
          )}

          <form onSubmit={(e) => void handleCreate(e)}>
            <p style={{ ...sectionLabelStyle, marginTop: 0 }}>Create new</p>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>Notification type</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "scheduled" | "condition")}
                disabled={busy}
                style={inputStyle}
              >
                <option value="scheduled">Scheduled reminder</option>
                <option value="condition">Condition rule</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                  placeholder="e.g. Follow up with architect"
                />
              </div>
              <div>
                <label style={labelStyle}>Message (optional)</label>
                <input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                  placeholder="Extra detail shown in the notification"
                />
              </div>

              {mode === "scheduled" ? (
                <>
                  <div>
                    <label style={labelStyle}>When</label>
                    <input
                      type="datetime-local"
                      required
                      value={remindAtLocal}
                      onChange={(e) => setRemindAtLocal(e.target.value)}
                      disabled={busy}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Project (optional — adds a link)</label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={busy}
                      style={inputStyle}
                    >
                      <option value="">— None —</option>
                      {(projects ?? []).map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={labelStyle}>Condition</label>
                    <select
                      value={conditionType}
                      onChange={(e) => {
                        setConditionType(e.target.value as typeof conditionType);
                        setDocumentId("");
                        setTaskId("");
                        setCustomConditionText("");
                      }}
                      disabled={busy}
                      style={inputStyle}
                    >
                      <option value="project_changes_stale">No changes activity on a project</option>
                      <option value="document_stale">No updates on a change document</option>
                      <option value="task_overdue">A schedule task is overdue</option>
                      <option value="custom">Custom condition (write your own)</option>
                    </select>
                  </div>
                  {conditionType === "custom" ? (
                    <div>
                      <label style={labelStyle}>Your condition</label>
                      <textarea
                        required
                        value={customConditionText}
                        onChange={(e) => setCustomConditionText(e.target.value)}
                        disabled={busy}
                        style={textareaStyle}
                        placeholder='e.g. "Follow up when the owner approves the COR"'
                      />
                      <p
                        style={{
                          margin: "0.35rem 0 0",
                          fontSize: "0.75rem",
                          color: isDark ? "#9ca3af" : "#6b7280",
                        }}
                      >
                        You&apos;ll get a recurring reminder on the interval below to check this condition.
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <label style={labelStyle}>Check every</label>
                    <select
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(e.target.value)}
                      disabled={busy}
                      style={inputStyle}
                    >
                      {INTERVAL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {conditionType === "project_changes_stale" || conditionType === "custom" ? (
                    <div>
                      <label style={labelStyle}>
                        Project{conditionType === "custom" ? " (optional — adds a link)" : ""}
                      </label>
                      <select
                        required={conditionType === "project_changes_stale"}
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        disabled={busy}
                        style={inputStyle}
                      >
                        <option value="">
                          {conditionType === "custom" ? "— None —" : "— Select project —"}
                        </option>
                        {(projects ?? []).map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {conditionType === "document_stale" || conditionType === "task_overdue" ? (
                    <div>
                      <label style={labelStyle}>Project</label>
                      <select
                        required
                        value={projectId}
                        onChange={(e) => {
                          setProjectId(e.target.value);
                          setDocumentId("");
                          setTaskId("");
                        }}
                        disabled={busy}
                        style={inputStyle}
                      >
                        <option value="">— Select project —</option>
                        {(projects ?? []).map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {conditionType === "document_stale" && selectedProjectId ? (
                    <div>
                      <label style={labelStyle}>Change document</label>
                      <select
                        required
                        value={documentId}
                        onChange={(e) => setDocumentId(e.target.value)}
                        disabled={busy}
                        style={inputStyle}
                      >
                        <option value="">— Select document —</option>
                        {changeDocuments.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.type} — {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {conditionType === "task_overdue" && selectedProjectId ? (
                    <div>
                      <label style={labelStyle}>Task</label>
                      <select
                        required
                        value={taskId}
                        onChange={(e) => setTaskId(e.target.value)}
                        disabled={busy}
                        style={inputStyle}
                      >
                        <option value="">— Select task —</option>
                        {openTasks.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.title}
                            {t.dueDate
                              ? ` (due ${new Date(t.dueDate).toLocaleDateString()})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              )}

              {error ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "#dc2626" }}>{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                style={{
                  alignSelf: "flex-start",
                  padding: "0.45rem 0.85rem",
                  borderRadius: "0.35rem",
                  border: "none",
                  backgroundColor: "#059669",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Saving…" : "Add notification"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
