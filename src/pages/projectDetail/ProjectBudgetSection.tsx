import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { secondaryButtonStyle } from "../../theme";

const BUDGET_DOC_TYPE = "BUDGET";

const MAIN_CARD: React.CSSProperties = {
  position: "relative",
  borderRadius: "0.75rem",
  border: "2px solid var(--color-emerald-800)",
  backgroundColor: "var(--surface-card)",
  padding: "1rem",
  paddingTop: "2.75rem",
};

const METRIC_CARD: React.CSSProperties = {
  border: "4px solid #2f7d68",
  borderRadius: "8px",
  background: "var(--surface-card)",
  boxSizing: "border-box",
  padding: "0.5rem 0.55rem",
  minWidth: 0,
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
  verticalAlign: "middle",
};

const ROW_INPUT: React.CSSProperties = {
  width: "100%",
  padding: "0.35rem 0.45rem",
  fontSize: "0.8125rem",
  borderRadius: "0.375rem",
  border: "1px solid var(--border-strong)",
  fontFamily: "Montserrat, sans-serif",
  boxSizing: "border-box",
};

const TOOLBAR_BTN: React.CSSProperties = {
  padding: "0.35rem 0.75rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
  borderRadius: "0.5rem",
  border: "1px solid #047857",
  backgroundColor: "var(--surface-panel)",
  color: "#047857",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
};

const SAVE_BTN: React.CSSProperties = {
  padding: "0.35rem 0.85rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
  borderRadius: "0.5rem",
  border: "1px solid rgba(2, 44, 34, 0.5)",
  backgroundColor: "var(--color-emerald-500)",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
};

type Props = {
  projectId: Id<"projects">;
};

type UploadRow =
  | { kind: "document"; doc: Doc<"documents"> }
  | { kind: "legacy"; name: string; fileUrl: string; uploadedAt?: number };

function fmtMoney(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? `$${n.toLocaleString()}` : "—";
}

function fmtDateTime(ts?: number): string {
  if (ts == null) return "—";
  return new Date(ts).toLocaleString();
}

function parseMoneyInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function computedVariance(budget: number | undefined, actual: number | undefined): number | null {
  if (budget == null || actual == null) return null;
  return budget - actual;
}

function computedProfitStatus(variance: number | null): string {
  if (variance == null) return "—";
  return variance >= 0 ? "On track" : "Review";
}

export function ProjectBudgetSection({ projectId }: Props) {
  const project = useQuery(api.projects.getProjectById, { projectId });
  const documents = useQuery(api.documents.listDocumentsByProject, { projectId });
  const updateProject = useMutation(api.projects.updateProject);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocumentRecord = useMutation(api.documents.createDocumentRecord);
  const deleteDocumentRecord = useMutation(api.documents.deleteDocumentRecord);
  const updateDocumentRecord = useMutation(api.documents.updateDocumentRecord);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ documentId: Id<"documents">; name: string } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<Id<"documents"> | null>(null);

  const [editBudget, setEditBudget] = useState("");
  const [editActuals, setEditActuals] = useState("");
  const [editVariance, setEditVariance] = useState("");
  const [editProfit, setEditProfit] = useState("");

  const budgetDocs = useMemo(() => {
    const list: Doc<"documents">[] = documents ?? [];
    return list
      .filter((d) => d.type.trim().toUpperCase() === BUDGET_DOC_TYPE)
      .slice()
      .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
  }, [documents]);

  const uploadRows = useMemo((): UploadRow[] => {
    const rows: UploadRow[] = budgetDocs.map((doc) => ({ kind: "document", doc }));
    if (rows.length === 0 && project?.budgetDocumentUrl) {
      rows.push({
        kind: "legacy",
        name: "Budget file",
        fileUrl: project.budgetDocumentUrl,
      });
    }
    return rows;
  }, [budgetDocs, project?.budgetDocumentUrl]);

  const displayVariance = useMemo(() => {
    if (project?.budgetVariance != null && Number.isFinite(project.budgetVariance)) {
      return project.budgetVariance;
    }
    return computedVariance(project?.budget, project?.actualCost);
  }, [project?.budget, project?.actualCost, project?.budgetVariance]);

  const displayProfit = useMemo(() => {
    if (project?.profitStatus?.trim()) return project.profitStatus.trim();
    return computedProfitStatus(displayVariance);
  }, [project?.profitStatus, displayVariance]);

  function populateEditFields() {
    if (!project) return;
    setEditBudget(project.budget != null ? String(project.budget) : "");
    setEditActuals(project.actualCost != null ? String(project.actualCost) : "");
    const variance =
      project.budgetVariance != null
        ? project.budgetVariance
        : computedVariance(project.budget, project.actualCost);
    setEditVariance(variance != null ? String(variance) : "");
    const profit =
      project.profitStatus?.trim() ||
      computedProfitStatus(variance ?? null);
    setEditProfit(profit === "—" ? "" : profit);
    setError(null);
  }

  useEffect(() => {
    if (!editing && project) populateEditFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?._id, project?.budget, project?.actualCost, project?.budgetVariance, project?.profitStatus, editing]);

  useEffect(() => {
    setNoteDrafts((prev) => {
      const next = { ...prev };
      for (const doc of budgetDocs) {
        const key = doc._id;
        if (next[key] === undefined) {
          next[key] = doc.description ?? "";
        }
      }
      return next;
    });
  }, [budgetDocs]);

  function startEditing() {
    populateEditFields();
    setEditing(true);
  }

  function cancelEditing() {
    populateEditFields();
    setEditing(false);
    setError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProject({
        projectId,
        budget: parseMoneyInput(editBudget),
        actualCost: parseMoneyInput(editActuals),
        budgetVariance: parseMoneyInput(editVariance),
        profitStatus: editProfit.trim() || undefined,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save budget.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      await createDocumentRecord({
        projectId,
        type: BUDGET_DOC_TYPE,
        name: file.name,
        storageId: storageId as Id<"_storage">,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDocumentRecord({ documentId: confirmDelete.documentId });
      setConfirmDelete(null);
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[confirmDelete.documentId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove file.");
    } finally {
      setDeleting(false);
    }
  }

  async function saveNote(documentId: Id<"documents">, value: string) {
    const doc = budgetDocs.find((d) => d._id === documentId);
    const serverValue = doc?.description?.trim() ?? "";
    const nextValue = value.trim();
    if (nextValue === serverValue) return;

    setSavingNoteId(documentId);
    setError(null);
    try {
      await updateDocumentRecord({
        documentId,
        description: nextValue,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setSavingNoteId(null);
    }
  }

  if (project === undefined) {
    return (
      <p style={{ fontFamily: "Montserrat, sans-serif", color: "var(--text-secondary)" }}>Loading budget…</p>
    );
  }

  if (project === null) {
    return (
      <p style={{ fontFamily: "Montserrat, sans-serif", color: "var(--text-secondary)" }}>Project not found.</p>
    );
  }

  const metricCards = [
    {
      label: "Budget",
      view: fmtMoney(project.budget),
      editValue: editBudget,
      onChange: setEditBudget,
      inputMode: "decimal" as const,
      placeholder: "0",
    },
    {
      label: "Actuals",
      view: fmtMoney(project.actualCost),
      editValue: editActuals,
      onChange: setEditActuals,
      inputMode: "decimal" as const,
      placeholder: "0",
    },
    {
      label: "Variance",
      view: fmtMoney(displayVariance),
      editValue: editVariance,
      onChange: setEditVariance,
      inputMode: "decimal" as const,
      placeholder: "0",
    },
    {
      label: "Profit",
      view: displayProfit,
      editValue: editProfit,
      onChange: setEditProfit,
      inputMode: undefined,
      placeholder: "On track",
      datalist: true,
    },
  ];

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <h2 className="section-header" style={{ margin: 0 }}>
          Budget
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {!editing ? (
            <button type="button" onClick={startEditing} style={TOOLBAR_BTN}>
              Edit
            </button>
          ) : (
            <>
              <button type="button" onClick={cancelEditing} disabled={saving} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="submit"
                form="project-budget-form"
                disabled={saving}
                style={{ ...SAVE_BTN, opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.8125rem" }}>{error}</p>
      ) : null}

      <form id="project-budget-form" onSubmit={handleSave}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(7rem, 1fr))",
            gap: "0.45rem",
          }}
        >
          {metricCards.map((card) => (
            <div key={card.label} style={METRIC_CARD}>
              <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "#6b7280" }}>{card.label}</div>
              {editing ? (
                <input
                  type="text"
                  inputMode={card.inputMode}
                  value={card.editValue}
                  onChange={(e) => card.onChange(e.target.value)}
                  placeholder={card.placeholder}
                  list={card.datalist ? "profit-status-options" : undefined}
                  style={{ ...ROW_INPUT, marginTop: "0.25rem" }}
                />
              ) : (
                <div style={{ fontSize: "0.74rem", fontWeight: 700, marginTop: "0.2rem" }}>{card.view}</div>
              )}
            </div>
          ))}
        </div>
        <datalist id="profit-status-options">
          <option value="On track" />
          <option value="Review" />
        </datalist>
      </form>

      <div style={MAIN_CARD}>
        <div
          style={{
            position: "absolute",
            top: "0.75rem",
            left: "1rem",
            right: "1rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>Budget uploads</span>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
              style={{ display: "none" }}
              disabled={uploading || deleting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || deleting}
              style={{
                ...TOOLBAR_BTN,
                opacity: uploading || deleting ? 0.6 : 1,
                cursor: uploading || deleting ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "Uploading…" : "Upload file"}
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "28rem" }}>
            <thead>
              <tr>
                <th style={TH}>File</th>
                <th style={TH}>Uploaded</th>
                <th style={TH}>Notes</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents === undefined ? (
                <tr>
                  <td colSpan={4} style={{ ...TD, color: "var(--text-secondary)" }}>
                    Loading uploads…
                  </td>
                </tr>
              ) : uploadRows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...TD, color: "var(--text-secondary)" }}>
                    No budget files uploaded yet.
                  </td>
                </tr>
              ) : (
                uploadRows.map((row) => {
                  if (row.kind === "legacy") {
                    return (
                      <tr key="legacy-budget-file">
                        <td style={TD}>
                          <a
                            href={row.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#047857", fontWeight: 600, textDecoration: "none" }}
                          >
                            {row.name}
                          </a>
                        </td>
                        <td style={TD}>—</td>
                        <td style={{ ...TD, color: "var(--text-secondary)" }}>—</td>
                        <td style={TD}>
                          <a
                            href={row.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#047857", fontWeight: 600, fontSize: "0.75rem", textDecoration: "none" }}
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    );
                  }

                  const doc = row.doc;
                  return (
                    <tr key={doc._id}>
                      <td style={TD}>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#047857", fontWeight: 600, textDecoration: "none", wordBreak: "break-word" }}
                        >
                          {doc.name}
                        </a>
                      </td>
                      <td style={TD}>{fmtDateTime(doc.uploadedAt)}</td>
                      <td style={{ ...TD, minWidth: "10rem", maxWidth: "16rem" }}>
                        <textarea
                          value={noteDrafts[doc._id] ?? doc.description ?? ""}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [doc._id]: e.target.value }))
                          }
                          onBlur={(e) => void saveNote(doc._id, e.target.value)}
                          placeholder="Add notes…"
                          rows={2}
                          disabled={savingNoteId === doc._id || deleting}
                          aria-label={`Notes for ${doc.name}`}
                          style={{
                            ...ROW_INPUT,
                            minHeight: "2.5rem",
                            resize: "vertical",
                            width: "100%",
                          }}
                        />
                      </td>
                      <td style={{ ...TD, whiteSpace: "nowrap" }}>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#047857",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            textDecoration: "none",
                            marginRight: "0.65rem",
                          }}
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete({ documentId: doc._id, name: doc.name })}
                          disabled={deleting}
                          style={{
                            padding: "0.2rem 0.5rem",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            borderRadius: "0.35rem",
                            border: "1px solid #dc2626",
                            backgroundColor: "transparent",
                            color: "#dc2626",
                            cursor: deleting ? "not-allowed" : "pointer",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmDelete ? (
        <div
          role="presentation"
          onClick={() => !deleting && setConfirmDelete(null)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 56,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              maxWidth: "24rem",
              width: "100%",
              border: "1px solid var(--border-strong)",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem", color: "var(--text-primary)" }}>Remove file?</h3>
            <p style={{ margin: "0 0 1rem 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              This will permanently remove <strong>{confirmDelete.name}</strong> from budget uploads.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                style={{
                  padding: "0.45rem 0.9rem",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  backgroundColor: "#dc2626",
                  color: "#fff",
                  border: "none",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
