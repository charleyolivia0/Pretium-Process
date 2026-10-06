import { Link, useNavigate, useParams } from "react-router-dom";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { cardStyle } from "../theme";
import { projectSectionHref } from "./projectDetail/projectSectionPaths";

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid #d1d5db",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.875rem",
};

function ContractCategoryCheckboxRowLight({
  rowId,
  title,
  checked,
  onCheckedChange,
}: {
  rowId: string;
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.55rem 0.65rem",
        marginBottom: "0.45rem",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
        backgroundColor: "#f9fafb",
      }}
    >
      <span id={rowId} style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
        {title}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        aria-labelledby={rowId}
        style={{
          width: "1.2rem",
          height: "1.2rem",
          minWidth: "1.2rem",
          accentColor: "#059669",
          cursor: "pointer",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

const CONTRACT_STATUS_OPTIONS = [
  { value: "unsigned", label: "Unsigned contract" },
  { value: "signed_by_subtrade", label: "Signed by subtrade" },
  { value: "signed_by_justin", label: "Signed by Justin" },
] as const;

type ContractStatus = (typeof CONTRACT_STATUS_OPTIONS)[number]["value"];

const TODO_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "needs_review", label: "Needs review" },
  { value: "completed", label: "Completed" },
] as const;

type TodoStatus = (typeof TODO_STATUS_OPTIONS)[number]["value"];

const TODO_STATUS_COLORS: Record<TodoStatus, React.CSSProperties> = {
  planned: {
    backgroundColor: "#ecfdf3",
    borderColor: "#bbf7d0",
  },
  in_progress: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  needs_attention: {
    backgroundColor: "#a7f3d0",
    borderColor: "#34d399",
  },
  needs_review: {
    backgroundColor: "#6ee7b7",
    borderColor: "#22c55e",
  },
  completed: {
    backgroundColor: "#bbf7d0",
    borderColor: "#4ade80",
  },
};

function todoStatusStyle(status: TodoStatus): React.CSSProperties {
  const base = TODO_STATUS_COLORS[status];
  return {
    ...base,
    color: "#022c22",
  };
}

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

export function SubtradeContractTracking() {
  const { projectId, subtradeId } = useParams<{ projectId: string; subtradeId: string }>();

  const navigate = useNavigate();
  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const subtradeDoc = useQuery(
    api.subtrades.listByProject,
    projectQueryArgs(projectId)
  )?.find((s) => s._id === (subtradeId as unknown as Id<"projectSubtrades">));

  const updateSubtrade = useMutation(api.subtrades.update);
  const removeSubtrade = useMutation(api.subtrades.remove);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);

  const subtradeTodos = useQuery(
    api.subtradeTodos.listBySubtrade,
    projectId && subtradeId
      ? { projectId: projectId as Id<"projects">, subtradeId: subtradeId as unknown as Id<"projectSubtrades"> }
      : "skip",
  );
  const addSubtradeTodo = useMutation(api.subtradeTodos.add);
  const updateSubtradeTodo = useMutation(api.subtradeTodos.update);
  const removeSubtradeTodo = useMutation(api.subtradeTodos.remove);

  const [status, setStatus] = useState<ContractStatus>("unsigned");
  const [contractSentOut, setContractSentOut] = useState(false);
  const [contractNotes, setContractNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingRemoveTodoId, setPendingRemoveTodoId] = useState<Id<"subtradeTodos"> | null>(null);

  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoStatus, setNewTodoStatus] = useState<TodoStatus>("planned");
  const [newTodoDescription, setNewTodoDescription] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<Id<"subtradeTodos"> | null>(null);
  const [editingTodoText, setEditingTodoText] = useState("");
  const [editingTodoDescription, setEditingTodoDescription] = useState("");

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !subtradeId) return;
    const text = newTodoText.trim();
    if (!text) return;
    try {
      const id = await addSubtradeTodo({
        projectId: projectId as Id<"projects">,
        subtradeId: subtradeId as unknown as Id<"projectSubtrades">,
        text,
        status: newTodoStatus,
      });
      const desc = newTodoDescription.trim();
      if (desc) {
        await updateSubtradeTodo({
          id: id as Id<"subtradeTodos">,
          description: desc,
        });
      }
      setNewTodoText("");
      setNewTodoStatus("planned");
      setNewTodoDescription("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add to-do item.";
      alert(message);
      // eslint-disable-next-line no-console
      console.error("Error adding subtrade to-do", err);
    }
  }

  async function handleUpdateTodoStatus(id: Id<"subtradeTodos">, status: TodoStatus) {
    await updateSubtradeTodo({ id, status });
  }

  async function confirmRemoveTodo() {
    const id = pendingRemoveTodoId;
    if (!id) return;
    setPendingRemoveTodoId(null);
    await removeSubtradeTodo({ id });
  }

  async function handleStartEditTodo(item: { _id: Id<"subtradeTodos">; text: string; description?: string | null }) {
    setEditingTodoId(item._id);
    setEditingTodoText(item.text);
    setEditingTodoDescription(item.description ?? "");
  }

  async function handleSaveEditTodo(e: React.FormEvent, id: Id<"subtradeTodos">) {
    e.preventDefault();
    const text = editingTodoText.trim();
    if (!text) {
      return;
    }
    await updateSubtradeTodo({
      id,
      text,
      description: editingTodoDescription,
    });
    setEditingTodoId(null);
    setEditingTodoText("");
    setEditingTodoDescription("");
  }

  function handleCancelEditTodo() {
    setEditingTodoId(null);
    setEditingTodoText("");
    setEditingTodoDescription("");
  }

  useEffect(() => {
    if (!subtradeDoc) return;
    setStatus((subtradeDoc.contractStatus as ContractStatus) ?? "unsigned");
    setBudget(subtradeDoc.budget != null ? String(subtradeDoc.budget) : "");
    setContractSentOut(subtradeDoc.contractSentOut ?? false);
    setContractNotes(subtradeDoc.contractNotes ?? "");
  }, [subtradeDoc]);

  if (!projectId || !subtradeId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Missing project or subtrade.</p>
        <Link to="/projects" style={{ color: "#059669" }}>
          Back to Projects
        </Link>
      </div>
    );
  }

  if (project === undefined || (!subtradeDoc && project !== null)) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  if (project === null || !subtradeDoc) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Project or subtrade not found.</p>
        <Link to="/projects" style={{ color: "#059669" }}>
          Back to Projects
        </Link>
      </div>
    );
  }

  async function handleFileUpload(file: File) {
    try {
      setUploading(true);
      setFileUrl("");
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId: sid } = await res.json();
      setStorageId(sid);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!subtradeDoc) return;
    await updateSubtrade({
      subtradeId: subtradeDoc._id,
      contractStatus: status,
      contractSentOut,
      contractNotes,
      budget: budget.trim() ? parseFloat(budget) : undefined,
      ...(storageId
        ? { storageId }
        : fileUrl.trim()
          ? { fileUrl: fileUrl.trim() }
          : {}),
    });
    setStorageId(null);
  }

  async function handleDeleteConfirmed() {
    if (!projectId || !subtradeDoc) return;
    await removeSubtrade({ subtradeId: subtradeDoc._id });
    navigate(projectSectionHref(projectId, "subtrades"));
  }

  const signedByTradeCheckedForm = status === "signed_by_subtrade" || status === "signed_by_justin";
  const signedByPplCheckedForm = status === "signed_by_justin";

  function handleContractTradeCheck(checked: boolean) {
    setStatus((prev) => {
      if (!checked) return "unsigned";
      return prev === "signed_by_justin" ? "signed_by_justin" : "signed_by_subtrade";
    });
  }

  function handleContractPplCheck(checked: boolean) {
    setStatus((prev) => {
      if (checked) return "signed_by_justin";
      if (prev === "signed_by_justin") return "signed_by_subtrade";
      return prev;
    });
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <Link
        to={projectSectionHref(projectId, "subtrades")}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#059669",
          textDecoration: "none",
        }}
      >
        {"<-"} Back to project
      </Link>

      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#022c22",
          marginBottom: "0.25rem",
        }}
      >
        Contract tracking - {subtradeDoc.name}
      </h1>
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
        }}
      >
        Project {project.name} · {project.clientName}
        {project.location && ` · ${project.location}`}
      </p>

      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "1rem",
          }}
        >
          Contract details for this subtrade
        </h2>

        <form
          onSubmit={handleSave}
          style={{
            display: "grid",
            gap: "0.75rem",
            maxWidth: "30rem",
            fontSize: "0.875rem",
          }}
        >
          <div>
            <span style={labelStyle}>Contract checklist</span>
            <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              One checkbox per step; matches the subtrade detail sidebar on the project.
            </p>
            <ContractCategoryCheckboxRowLight
              rowId={`full-contract-${subtradeId}-sent-out`}
              title="Sent out"
              checked={contractSentOut}
              onCheckedChange={setContractSentOut}
            />
            <ContractCategoryCheckboxRowLight
              rowId={`full-contract-${subtradeId}-signed-trade`}
              title="Signed by trade"
              checked={signedByTradeCheckedForm}
              onCheckedChange={handleContractTradeCheck}
            />
            <ContractCategoryCheckboxRowLight
              rowId={`full-contract-${subtradeId}-signed-ppl`}
              title="Signed by PPL"
              checked={signedByPplCheckedForm}
              onCheckedChange={handleContractPplCheck}
            />
          </div>

          <div>
            <label style={labelStyle}>Contract notes</label>
            <textarea
              value={contractNotes}
              onChange={(e) => setContractNotes(e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical" as const,
                fontFamily: "Montserrat, sans-serif",
              }}
              placeholder="Notes visible on the project subtrade detail sidebar…"
            />
          </div>

          <div>
            <label style={labelStyle}>Budget ($)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              style={inputStyle}
              placeholder="0.00"
            />
          </div>

          <div>
            <label style={labelStyle}>Contract file</label>
            {subtradeDoc.fileUrl ? (
              <p
                style={{
                  fontSize: "0.8125rem",
                  marginBottom: "0.5rem",
                  color: "var(--text-secondary)",
                }}
              >
                Current file:{" "}
                <a
                  href={subtradeDoc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#059669", textDecoration: "none" }}
                >
                  View contract (uploaded {formatDate(subtradeDoc.uploadedAt)})
                </a>
              </p>
            ) : (
              <p
                style={{
                  fontSize: "0.8125rem",
                  marginBottom: "0.5rem",
                  color: "var(--text-secondary)",
                }}
              >
                No contract file attached yet.
              </p>
            )}

            <input
              type="url"
              value={fileUrl}
              onChange={(e) => {
                setFileUrl(e.target.value);
                setStorageId(null);
              }}
              style={inputStyle}
              placeholder="Paste a contract link (optional if uploading a file)"
            />

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.4rem 0.75rem",
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                backgroundColor: "#f9fafb",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
                marginTop: "0.5rem",
              }}
            >
              <input
                type="file"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleFileUpload(file);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
              {uploading
                ? "Uploading file..."
                : storageId
                  ? "✓ New file ready to attach"
                  : "Upload new file from computer"}
            </label>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
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
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                fontWeight: 600,
                border: "1px solid #dc2626",
                color: "#dc2626",
                backgroundColor: "var(--surface-panel)",
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              Delete subtrade
            </button>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <h2
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "1rem",
          }}
        >
          To-do list for this subtrade
        </h2>

        <form
          onSubmit={handleAddTodo}
          style={{
            marginBottom: "1.25rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2fr) auto",
            gap: "0.5rem",
            alignItems: "end",
          }}
        >
          <div>
            <label style={labelStyle}>Task</label>
            <input
              type="text"
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
              placeholder="Add a task title..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Description (optional)</label>
            <input
              type="text"
              value={newTodoDescription}
              onChange={(e) => setNewTodoDescription(e.target.value)}
              placeholder="Add notes or details for this task..."
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={newTodoStatus}
                onChange={(e) => setNewTodoStatus(e.target.value as TodoStatus)}
                style={{
                  ...inputStyle,
                  ...todoStatusStyle(newTodoStatus),
                  fontWeight: 600,
                }}
              >
                {TODO_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!newTodoText.trim() || !projectId || !subtradeId}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "0.5rem",
                fontWeight: 600,
                backgroundColor: "#059669",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
                fontSize: "0.8125rem",
                opacity: !newTodoText.trim() ? 0.6 : 1,
                alignSelf: "flex-start",
              }}
            >
              Add
            </button>
          </div>
        </form>

        {subtradeTodos === undefined ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading to-dos...</p>
        ) : !subtradeTodos || subtradeTodos.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            No to-dos yet. Add items above to track work for this contract.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            {TODO_STATUS_OPTIONS.map((col) => {
              const items = (subtradeTodos ?? []).filter((t) => t.status === col.value);
              return (
                <div
                  key={col.value}
                  style={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e5e7eb",
                    padding: "0.75rem",
                    backgroundColor: "#f9fafb",
                    minHeight: "4rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "#065f46",
                      }}
                    >
                      {col.label}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {items.length}
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#9ca3af",
                        margin: 0,
                      }}
                    >
                      No items
                    </p>
                  ) : (
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      {items.map((item) => (
                        <li key={item._id}>
                          <div
                            style={{
                              borderRadius: "0.75rem",
                              border: `1px solid ${TODO_STATUS_COLORS[item.status as TodoStatus]?.borderColor ?? "#bbf7d0"}`,
                              padding: "0.5rem 0.6rem",
                              backgroundColor:
                                TODO_STATUS_COLORS[item.status as TodoStatus]?.backgroundColor ??
                                "#ecfdf3",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.35rem",
                            }}
                          >
                            {editingTodoId === (item._id as Id<"subtradeTodos">) ? (
                              <form
                                onSubmit={(e) =>
                                  handleSaveEditTodo(
                                    e,
                                    item._id as Id<"subtradeTodos">,
                                  )
                                }
                                style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}
                              >
                                <input
                                  type="text"
                                  value={editingTodoText}
                                  onChange={(e) => setEditingTodoText(e.target.value)}
                                  style={{
                                    fontSize: "0.8rem",
                                    padding: "0.3rem 0.4rem",
                                    borderRadius: "0.4rem",
                                    border: "1px solid #d1d5db",
                                    fontFamily: "Montserrat, sans-serif",
                                    marginBottom: "0.25rem",
                                  }}
                                  autoFocus
                                />
                                <input
                                  type="text"
                                  value={editingTodoDescription}
                                  onChange={(e) =>
                                    setEditingTodoDescription(e.target.value)
                                  }
                                  placeholder="Description (optional)"
                                  style={{
                                    fontSize: "0.78rem",
                                    padding: "0.3rem 0.4rem",
                                    borderRadius: "0.4rem",
                                    border: "1px solid #e5e7eb",
                                    fontFamily: "Montserrat, sans-serif",
                                  }}
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "0.35rem",
                                  }}
                                >
                                  <button
                                    type="submit"
                                    style={{
                                      padding: "0.25rem 0.6rem",
                                      borderRadius: "0.4rem",
                                      border: "none",
                                      backgroundColor: "#059669",
                                      color: "#ffffff",
                                      fontSize: "0.75rem",
                                      fontFamily: "Montserrat, sans-serif",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEditTodo}
                                    style={{
                                      padding: "0.25rem 0.6rem",
                                      borderRadius: "0.4rem",
                                      border: "1px solid #d1d5db",
                                      backgroundColor: "var(--surface-panel)",
                                      color: "var(--text-primary)",
                                      fontSize: "0.75rem",
                                      fontFamily: "Montserrat, sans-serif",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.2rem",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.85rem",
                                    color: "var(--text-primary)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: "0.35rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {item.text}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStartEditTodo({
                                        _id: item._id as Id<"subtradeTodos">,
                                        text: item.text,
                                        description: item.description,
                                      })
                                    }
                                    style={{
                                      border: "none",
                                      background: "none",
                                      color: "#047857",
                                      cursor: "pointer",
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                                {item.description && (
                                  <div
                                    style={{
                                      fontSize: "0.78rem",
                                      color: "var(--text-secondary)",
                                      lineHeight: 1.3,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {item.description}
                                  </div>
                                )}
                              </div>
                            )}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                justifyContent: "space-between",
                              }}
                            >
                              <select
                                value={item.status}
                                onChange={(e) =>
                                  handleUpdateTodoStatus(
                                    item._id as Id<"subtradeTodos">,
                                    e.target.value as TodoStatus,
                                  )
                                }
                                style={{
                                  fontSize: "0.75rem",
                                  borderRadius: "999px",
                                  padding: "0.2rem 0.45rem",
                                  border: "1px solid #d1d5db",
                                  backgroundColor: "var(--surface-panel)",
                                  color: "var(--text-primary)",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                {TODO_STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingRemoveTodoId(item._id as Id<"subtradeTodos">)
                                }
                                style={{
                                  border: "none",
                                  background: "none",
                                  color: "#9ca3af",
                                  cursor: "pointer",
                                  fontSize: "0.8rem",
                                }}
                                aria-label="Remove to-do"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemoveTodoId !== null}
        message="This will permanently delete this to-do item."
        onCancel={() => setPendingRemoveTodoId(null)}
        onConfirm={() => void confirmRemoveTodo()}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        confirmLabel="Yes, delete"
        message={
          <>
            This will remove subtrade{" "}
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{subtradeDoc.name}</span> from the
            project.
          </>
        }
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          await handleDeleteConfirmed();
        }}
      />

    </div>
  );
}

