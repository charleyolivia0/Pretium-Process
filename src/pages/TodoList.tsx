import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { shellCardStyle, innerWhiteCardStyle } from "../theme";

function formatDate(ts?: number | null): string {
  if (ts == null) return "";
  return new Date(ts).toLocaleDateString();
}

function dateInputToTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const d = new Date(value + "T12:00:00");
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

export function TodoList() {
  const items = useQuery(api.todoList.list);
  const projects = useQuery(api.projects.listProjects, {});
  const addItem = useMutation(api.todoList.add);
  const updateItem = useMutation(api.todoList.update);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newProjectId, setNewProjectId] = useState<Id<"projects"> | "">("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    try {
      await addItem({
        text,
        dueDate: dateInputToTimestamp(newDueDate),
        projectId: newProjectId || undefined,
        priority: newPriority,
      });
      setNewText("");
      setNewDueDate("");
      setNewProjectId("");
      setNewPriority("medium");
      setShowAddForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add item.");
    }
  }

  async function toggleCompleted(id: Id<"pmTodoList">, completed: boolean) {
    try {
      await updateItem({ id, completed: !completed });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>
        To-Do List <LogoMark />
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Your personal to-do list. Only you can see these items on your dashboard. Set priority (▲ high, ● medium, ▼ low).
      </p>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
          To-Do List
        </h2>
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
        {!showAddForm ? (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            style={{
              marginBottom: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #059669",
              backgroundColor: "#ecfdf5",
              color: "#059669",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            Add
          </button>
        ) : (
          <form onSubmit={handleAdd} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 12rem", minWidth: "10rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Item
                </label>
                <input
                  type="text"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Add an item for PM/PC..."
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.9375rem",
                  }}
                />
              </div>
              <div style={{ flex: "0 0 8rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Date
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 10rem", minWidth: "8rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Project
                </label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId((e.target.value || "") as Id<"projects"> | "")}
                  style={{ width: "100%" }}
                >
                  <option value="">No project</option>
                  {(projects ?? []).map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "0 0 6rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority((e.target.value || "medium") as "low" | "medium" | "high")}
                  style={{ width: "100%" }}
                >
                  <option value="high">▲ High</option>
                  <option value="medium">● Medium</option>
                  <option value="low">▼ Low</option>
                </select>
              </div>
              <button
                type="submit"
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  backgroundColor: "#059669",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  alignSelf: "flex-end",
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewText("");
                  setNewDueDate("");
                  setNewProjectId("");
                  setNewPriority("medium");
                }}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "var(--surface-panel)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  color: "var(--text-secondary)",
                  alignSelf: "flex-end",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {items === undefined ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</p>
        ) : (items ?? []).filter((item) => item.completed !== true).length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>No items yet. Add one above.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", listStyle: "none" }}>
            {(items ?? []).filter((item) => item.completed !== true).map((item) => {
              const isCompleted = item.completed === true;
              return (
                <li
                  key={item._id}
                  style={{
                    marginBottom: "0.75rem",
                    fontSize: "0.9375rem",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => toggleCompleted(item._id, isCompleted)}
                    aria-label={isCompleted ? "Mark as not done" : "Mark as done"}
                    style={{
                      width: "1.125rem",
                      height: "1.125rem",
                      marginTop: "0.2rem",
                      cursor: "pointer",
                      accentColor: "#059669",
                    }}
                  />
                  <span
                    style={{
                      color: item.priority === "high" ? "#dc2626" : item.priority === "low" ? "#059669" : "#d97706",
                      fontSize: "1rem",
                      lineHeight: 1,
                      marginTop: "0.2rem",
                    }}
                    title={item.priority === "high" ? "High" : item.priority === "low" ? "Low" : "Medium"}
                  >
                    {item.priority === "high" ? "▲" : item.priority === "low" ? "▼" : "●"}
                  </span>
                  <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                    <div
                      style={{
                        color: isCompleted ? "#9ca3af" : "#374151",
                        textDecoration: isCompleted ? "line-through" : undefined,
                      }}
                    >
                      {item.text}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      {item.createdByRole != null && (
                        <span style={{ color: "#059669", fontWeight: 500 }}>
                          {item.createdByRole.replace(/_/g, " ")}
                        </span>
                      )}
                      {item.dueDate != null && (
                        <span style={{ marginLeft: "0.35rem" }}>· {formatDate(item.dueDate)}</span>
                      )}
                      {item.projectName != null && (
                        <span style={{ marginLeft: "0.35rem" }}>· {item.projectName}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}
