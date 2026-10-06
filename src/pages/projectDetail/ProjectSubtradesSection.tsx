import { useMemo, useState } from "react";
import { projectQueryArgs } from "../../lib/projectQueryArgs";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { cardStyle, primaryButtonStyle } from "../../theme";
import { parseSubtradesSubtradeId } from "./projectSectionPaths";
import { useOfflineCachedQuery } from "../../offline/useOfflineCachedQuery";
import { todayDateInputValue } from "../../utils/dateInput";

const GREEN_SIDEBAR_CARD: React.CSSProperties = {
  backgroundColor: "var(--color-emerald-800)",
  color: "#ffffff",
  borderRadius: "0.75rem",
  padding: "1rem",
  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.25)",
};

const CHANGES_LIST_PANEL: React.CSSProperties = {
  position: "relative",
  borderRadius: "0.75rem",
  border: "2px solid var(--color-emerald-800)",
  backgroundColor: "var(--surface-card)",
  padding: "1rem",
  paddingTop: "2.75rem",
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

const SUBTLE_ADD_NEW_BTN: React.CSSProperties = {
  borderRadius: "0.5rem",
  border: "1px solid var(--border-subtle)",
  backgroundColor: "var(--surface-panel)",
  color: "var(--text-secondary)",
  width: "1.9rem",
  height: "1.9rem",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
};

function formatBudget(budget: number | undefined): string {
  if (budget == null) return "—";
  return `$${budget.toLocaleString()}`;
}

const EMPLOYEE_FORM_DOC_TYPES = ["certification", "training", "license", "insurance", "other"] as const;

function formatDocTypeLabel(t: string) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function dateInputToLocalMidnightMs(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

function formatLogTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function formatCalendarDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

type Props = { projectId: string };

export function ProjectSubtradesSection({ projectId }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const subtradeIdParam = parseSubtradesSubtradeId(location.pathname, projectId);

  const project = useOfflineCachedQuery(
    api.projects.getProjectById,
    projectQueryArgs(projectId),
    "projects.getProjectById",
  );
  const subtrades = useOfflineCachedQuery(
    api.subtrades.listByProject,
    projectQueryArgs(projectId),
    "subtrades.listByProject",
  );
  const createSubtrade = useMutation(api.subtrades.create);
  const updateSubtrade = useMutation(api.subtrades.update);
  const removeSubtrade = useMutation(api.subtrades.remove);
  const addEmployeeDocument = useMutation(api.safety.addEmployeeDocument);
  const removeEmployeeDocument = useMutation(api.safety.removeEmployeeDocument);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);

  const [pendingRemoveEmployeeDocId, setPendingRemoveEmployeeDocId] = useState<Id<"safetyEmployeeDocuments"> | null>(
    null,
  );
  const [showNewSubtradeModal, setShowNewSubtradeModal] = useState(false);
  const [newSubtradeName, setNewSubtradeName] = useState("");
  const [newSubtradeBudget, setNewSubtradeBudget] = useState("");
  const [showEmployeeFormModal, setShowEmployeeFormModal] = useState(false);
  const [formDocType, setFormDocType] = useState<string>("certification");
  const [formDocumentDate, setFormDocumentDate] = useState("");
  const [formExpiryDate, setFormExpiryDate] = useState("");
  const [formFileUrl, setFormFileUrl] = useState("");
  const [formStorageId, setFormStorageId] = useState<Id<"_storage"> | null>(null);
  const [formFileUploading, setFormFileUploading] = useState(false);
  /** Per-subtrade notes while editing (cleared on blur after save or when unchanged). */
  const [contractNotesLocal, setContractNotesLocal] = useState<Record<string, string>>({});
  const [showTradeContactModal, setShowTradeContactModal] = useState(false);
  const [editTradePhone, setEditTradePhone] = useState("");
  const [editTradeEmail, setEditTradeEmail] = useState("");
  const [confirmDeleteSubtradeOpen, setConfirmDeleteSubtradeOpen] = useState(false);
  const [deletingSubtrade, setDeletingSubtrade] = useState(false);
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [newContractName, setNewContractName] = useState("");
  const [newContractValue, setNewContractValue] = useState("");
  const [newContractStorageId, setNewContractStorageId] = useState<Id<"_storage"> | null>(null);
  const [newContractFileUploading, setNewContractFileUploading] = useState(false);

  const selectedSubtrade =
    subtradeIdParam && subtrades
      ? subtrades.find((s: Doc<"projectSubtrades">) => String(s._id) === subtradeIdParam)
      : undefined;
  const subtradeIdConvex = selectedSubtrade?._id ?? null;

  const employeeDocs = useQuery(
    api.safety.listEmployeeDocumentsBySubtrade,
    projectId && subtradeIdConvex && selectedSubtrade
      ? { projectId: projectId as Id<"projects">, subtradeId: subtradeIdConvex }
      : "skip",
  );

  const tradeProjects = useQuery(
    api.subtrades.listProjectsForTradeName,
    selectedSubtrade?.name ? { tradeName: selectedSubtrade.name } : "skip",
  );

  const attendancePreview = useQuery(
    api.safety.listRecentJobAttendanceBySubtrade,
    projectId && subtradeIdConvex && selectedSubtrade
      ? { projectId: projectId as Id<"projects">, subtradeId: subtradeIdConvex, limit: 10 }
      : "skip",
  );

  const sortedSubtrades = useMemo(() => {
    return [...(subtrades ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [subtrades]);
  const contractTrackingRows = useMemo(() => {
    return selectedSubtrade ? [selectedSubtrade] : sortedSubtrades;
  }, [selectedSubtrade, sortedSubtrades]);

  const projectLabel = project?.name ?? "—";

  async function handleAddSubtrade(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtradeName.trim() || !projectId) return;
    await createSubtrade({
      projectId: projectId as Id<"projects">,
      name: newSubtradeName.trim(),
      contractStatus: "unsigned",
      budget: newSubtradeBudget.trim() ? parseFloat(newSubtradeBudget) : undefined,
    });
    setNewSubtradeName("");
    setNewSubtradeBudget("");
    setShowNewSubtradeModal(false);
  }

  async function handleEmployeeFormFileUpload(file: File) {
    setFormFileUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setFormStorageId(storageId);
      setFormFileUrl("");
    } finally {
      setFormFileUploading(false);
    }
  }

  function openEmployeeFormModal() {
    setFormDocType("certification");
    setFormDocumentDate(todayDateInputValue());
    setFormExpiryDate("");
    setFormFileUrl("");
    setFormStorageId(null);
    setShowEmployeeFormModal(true);
  }

  async function handleAddEmployeeForm(e: React.FormEvent) {
    e.preventDefault();
    if (!subtradeIdConvex || !projectId) return;
    const docMs = dateInputToLocalMidnightMs(formDocumentDate);
    const expMs = dateInputToLocalMidnightMs(formExpiryDate);
    if (docMs == null || expMs == null) return;
    const recordName = `${formatDocTypeLabel(formDocType)} · ${formDocumentDate}`;
    await addEmployeeDocument({
      projectId: projectId as Id<"projects">,
      subtradeId: subtradeIdConvex,
      employeeName: "—",
      documentType: formDocType,
      name: recordName,
      documentDate: docMs,
      expiryDate: expMs,
      fileUrl: formFileUrl.trim() || undefined,
      storageId: formStorageId ?? undefined,
    });
    setShowEmployeeFormModal(false);
    setFormExpiryDate("");
    setFormFileUrl("");
    setFormStorageId(null);
  }

  function resetNewContractForm() {
    setNewContractName("");
    setNewContractValue("");
    setNewContractStorageId(null);
    setNewContractFileUploading(false);
  }

  async function handleNewContractFileUpload(file: File) {
    setNewContractFileUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setNewContractStorageId(storageId);
    } finally {
      setNewContractFileUploading(false);
    }
  }

  async function handleAddContract(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !newContractName.trim() || !newContractValue.trim()) return;
    const parsedBudget = Number(newContractValue);
    if (!Number.isFinite(parsedBudget)) return;
    await createSubtrade({
      projectId: projectId as Id<"projects">,
      name: newContractName.trim(),
      contractStatus: "unsigned",
      budget: parsedBudget,
      storageId: newContractStorageId ?? undefined,
    });
    setShowNewContractModal(false);
    resetNewContractForm();
  }

  async function saveContractRowNotesBlur(s: Doc<"projectSubtrades">, value: string) {
    const id = String(s._id);
    const server = s.contractNotes ?? "";
    if (value !== server) {
      await updateSubtrade({ subtradeId: s._id, contractNotes: value });
    }
    setContractNotesLocal((m) => {
      if (m[id] === undefined) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  async function setRowContractSentOut(s: Doc<"projectSubtrades">, checked: boolean) {
    await updateSubtrade({ subtradeId: s._id, contractSentOut: checked });
  }

  async function setRowSignedByTradeChecked(s: Doc<"projectSubtrades">, checked: boolean) {
    if (!checked) {
      await updateSubtrade({ subtradeId: s._id, contractStatus: "unsigned" });
      return;
    }
    const st = s.contractStatus;
    await updateSubtrade({
      subtradeId: s._id,
      contractStatus: st === "signed_by_justin" ? "signed_by_justin" : "signed_by_subtrade",
    });
  }

  async function setRowSignedByPplChecked(s: Doc<"projectSubtrades">, checked: boolean) {
    if (checked) {
      await updateSubtrade({ subtradeId: s._id, contractStatus: "signed_by_justin" });
      return;
    }
    if (s.contractStatus === "signed_by_justin") {
      await updateSubtrade({ subtradeId: s._id, contractStatus: "signed_by_subtrade" });
    }
  }

  async function handleSaveTradeContactModal(e: React.FormEvent) {
    e.preventDefault();
    if (!subtradeIdConvex) return;
    await updateSubtrade({
      subtradeId: subtradeIdConvex,
      contactPhone: editTradePhone,
      contactEmail: editTradeEmail,
    });
    setShowTradeContactModal(false);
  }

  async function handleDeleteSubtradeConfirmed() {
    if (!subtradeIdConvex) return;
    setDeletingSubtrade(true);
    try {
      await removeSubtrade({ subtradeId: subtradeIdConvex });
      setConfirmDeleteSubtradeOpen(false);
      setShowTradeContactModal(false);
      navigate(`/projects/${projectId}/subtrades`);
    } finally {
      setDeletingSubtrade(false);
    }
  }

  if (!projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>No project selected.</p>
      </div>
    );
  }

  if (project === undefined || subtrades === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Project not found.</p>
      </div>
    );
  }

  // Invalid or unknown subtrade id in URL
  if (subtradeIdParam && (!subtradeIdConvex || !selectedSubtrade)) {
    return (
      <div style={{ ...cardStyle, fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280", marginBottom: "0.75rem" }}>Subtrade not found.</p>
        <Link to={`/projects/${projectId}/subtrades`} style={{ color: "#059669", fontWeight: 600 }}>
          Back to subtrades list
        </Link>
      </div>
    );
  }

  if (selectedSubtrade && subtradeIdConvex) {
    const masterLogHref = `/safety/project/${projectId}/job-sign-in-out`;
    const safetyEmployeesHref = `/safety/project/${projectId}/subtrade/${subtradeIdConvex}`;

    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "stretch",
            gap: "1rem",
          }}
        >
          <aside style={{ flex: "0 0 15rem", maxWidth: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ ...GREEN_SIDEBAR_CARD, position: "relative", paddingTop: "2.35rem" }}>
              <button
                type="button"
                onClick={() => {
                  setEditTradePhone(selectedSubtrade.contactPhone ?? "");
                  setEditTradeEmail(selectedSubtrade.contactEmail ?? "");
                  setShowTradeContactModal(true);
                }}
                aria-label="Edit phone and email"
                style={{
                  position: "absolute",
                  top: "0.65rem",
                  right: "0.65rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#fff",
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: "0.35rem",
                  padding: "0.25rem 0.55rem",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Edit
              </button>
              <div style={{ fontSize: "0.7rem", opacity: 0.9, marginBottom: "0.35rem" }}>Trade</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem" }}>{selectedSubtrade.name}</div>
              {(selectedSubtrade.contactPhone || selectedSubtrade.contactEmail) && (
                <div style={{ fontSize: "0.78rem", lineHeight: 1.45, opacity: 0.95 }}>
                  {selectedSubtrade.contactPhone ? (
                    <div style={{ marginBottom: "0.3rem" }}>
                      <span style={{ opacity: 0.85 }}>Phone </span>
                      <a
                        href={`tel:${selectedSubtrade.contactPhone.replace(/\s/g, "")}`}
                        style={{ color: "#fff", fontWeight: 600 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {selectedSubtrade.contactPhone}
                      </a>
                    </div>
                  ) : null}
                  {selectedSubtrade.contactEmail ? (
                    <div>
                      <span style={{ opacity: 0.85 }}>Email </span>
                      <a
                        href={`mailto:${selectedSubtrade.contactEmail}`}
                        style={{ color: "#fff", fontWeight: 600, wordBreak: "break-all" as const }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {selectedSubtrade.contactEmail}
                      </a>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div style={GREEN_SIDEBAR_CARD}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem" }}>Trades projects</div>
              {tradeProjects === undefined ? (
                <div style={{ fontSize: "0.78rem", opacity: 0.9 }}>Loading...</div>
              ) : tradeProjects.length === 0 ? (
                <div style={{ fontSize: "0.78rem", opacity: 0.9 }}>No projects found.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem", lineHeight: 1.5 }}>
                  {tradeProjects.map((tradeProject) => (
                    <li key={tradeProject.projectId}>
                      <Link to={`/projects/${tradeProject.projectId}`} style={{ color: "#fff", fontWeight: 600 }}>
                        {tradeProject.projectName}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div style={{ flex: "1 1 20rem", minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={CHANGES_LIST_PANEL}>
              <div
                style={{
                  position: "absolute",
                  top: "0.72rem",
                  right: "0.72rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditTradePhone(selectedSubtrade.contactPhone ?? "");
                    setEditTradeEmail(selectedSubtrade.contactEmail ?? "");
                    setShowTradeContactModal(true);
                  }}
                  title="Edit trade contact"
                  aria-label="Edit trade contact"
                  style={SUBTLE_ADD_NEW_BTN}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "1rem",
                      height: "1rem",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.74rem",
                      lineHeight: 1,
                    }}
                  >
                    ✎
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetNewContractForm();
                    setShowNewContractModal(true);
                  }}
                  title="Add new contract"
                  aria-label="Add new contract"
                  style={SUBTLE_ADD_NEW_BTN}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "1rem",
                      height: "1rem",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.95rem",
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                </button>
              </div>
              <h3 className="section-header" style={{ margin: "0 0 0.55rem 0", fontSize: "1rem", color: "var(--text-primary)" }}>
                Contract tracking
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-strong)" }}>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Project</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Subtrade</th>
                      <th style={{ padding: "0.35rem 0.5rem" }}>Value</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "center", width: "5.5rem", whiteSpace: "nowrap" }}>Sent out</th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "center", width: "7.5rem", whiteSpace: "nowrap" }}>
                        Signed by trade
                      </th>
                      <th style={{ padding: "0.35rem 0.5rem", textAlign: "center", width: "7.5rem", whiteSpace: "nowrap" }}>
                        Signed by PPL
                      </th>
                      <th style={{ padding: "0.35rem 0.5rem", minWidth: "10rem" }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractTrackingRows.map((s: Doc<"projectSubtrades">) => {
                      const active = s._id === subtradeIdConvex;
                      const rowId = String(s._id);
                      const signedByTrade =
                        s.contractStatus === "signed_by_subtrade" || s.contractStatus === "signed_by_justin";
                      const signedByPpl = s.contractStatus === "signed_by_justin";
                      const notesValue = contractNotesLocal[rowId] ?? s.contractNotes ?? "";
                      return (
                        <tr
                          key={s._id}
                          onClick={() => navigate(`/projects/${projectId}/subtrades/${s._id}`)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              navigate(`/projects/${projectId}/subtrades/${s._id}`);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          style={{
                            borderBottom: "1px solid var(--border-strong)",
                            cursor: "pointer",
                            backgroundColor: active ? "rgba(16, 185, 129, 0.12)" : undefined,
                          }}
                        >
                          <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)" }}>{projectLabel}</td>
                          <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)" }}>{formatBudget(s.budget)}</td>
                          <td
                            style={{ padding: "0.45rem 0.5rem", textAlign: "center", verticalAlign: "middle" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(s.contractSentOut)}
                              onChange={(e) => void setRowContractSentOut(s, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Sent out — ${s.name}`}
                              style={{
                                width: "1.15rem",
                                height: "1.15rem",
                                accentColor: "#059669",
                                cursor: "pointer",
                              }}
                            />
                          </td>
                          <td
                            style={{ padding: "0.45rem 0.5rem", textAlign: "center", verticalAlign: "middle" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={signedByTrade}
                              onChange={(e) => void setRowSignedByTradeChecked(s, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Signed by trade — ${s.name}`}
                              style={{
                                width: "1.15rem",
                                height: "1.15rem",
                                accentColor: "#059669",
                                cursor: "pointer",
                              }}
                            />
                          </td>
                          <td
                            style={{ padding: "0.45rem 0.5rem", textAlign: "center", verticalAlign: "middle" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={signedByPpl}
                              onChange={(e) => void setRowSignedByPplChecked(s, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Signed by PPL — ${s.name}`}
                              style={{
                                width: "1.15rem",
                                height: "1.15rem",
                                accentColor: "#059669",
                                cursor: "pointer",
                              }}
                            />
                          </td>
                          <td
                            style={{ padding: "0.35rem 0.5rem", verticalAlign: "top" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <textarea
                              value={notesValue}
                              onChange={(e) =>
                                setContractNotesLocal((m) => ({ ...m, [rowId]: e.target.value }))
                              }
                              onBlur={(e) => void saveContractRowNotesBlur(s, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              placeholder="Notes…"
                              rows={2}
                              style={{
                                width: "100%",
                                minWidth: "8rem",
                                boxSizing: "border-box",
                                borderRadius: "0.45rem",
                                border: "1px solid var(--border-subtle)",
                                padding: "0.4rem",
                                fontSize: "0.75rem",
                                fontFamily: "Montserrat, sans-serif",
                                color: "var(--text-primary)",
                                backgroundColor: "var(--surface-panel)",
                                resize: "vertical" as const,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "1rem",
                alignItems: "start",
              }}
              className="subtrades-detail-bottom-grid"
            >
              <div style={{ ...cardStyle, margin: 0, position: "relative", paddingTop: "2.65rem" }}>
                <button
                  type="button"
                  onClick={openEmployeeFormModal}
                  title="Add employee form"
                  aria-label="Add employee form"
                  style={{ ...ADD_PLUS_BTN, top: "0.65rem", right: "0.65rem" }}
                >
                  +
                </button>
                <h3 className="section-header" style={{ margin: "0 0 0.65rem 0", fontSize: "1rem" }}>
                  <Link
                    to={safetyEmployeesHref}
                    style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}
                    className="card-hover"
                  >
                    Employee forms
                  </Link>
                </h3>
                {employeeDocs === undefined ? (
                  <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading...</p>
                ) : employeeDocs.length === 0 ? (
                  <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>No employee forms yet. Use + to add one.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-strong)" }}>
                          <th style={{ padding: "0.35rem 0.5rem" }}>Type</th>
                          <th style={{ padding: "0.35rem 0.5rem" }}>Date</th>
                          <th style={{ padding: "0.35rem 0.5rem" }}>Expiry</th>
                          <th style={{ padding: "0.35rem 0.5rem" }}>File</th>
                          <th style={{ padding: "0.35rem 0.5rem", width: "4.5rem" }} />
                        </tr>
                      </thead>
                      <tbody>
                        {employeeDocs.map((row: Doc<"safetyEmployeeDocuments">) => (
                          <tr key={row._id} style={{ borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" }}>
                            <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>{formatDocTypeLabel(row.documentType)}</td>
                            <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)" }}>{formatCalendarDate(row.documentDate)}</td>
                            <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-secondary)" }}>{formatCalendarDate(row.expiryDate)}</td>
                            <td style={{ padding: "0.45rem 0.5rem" }}>
                              {row.fileUrl ? (
                                <a href={row.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", fontWeight: 600 }}>
                                  View
                                </a>
                              ) : (
                                <span style={{ color: "var(--text-secondary)" }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: "0.45rem 0.5rem" }}>
                              <button
                                type="button"
                                onClick={() => setPendingRemoveEmployeeDocId(row._id)}
                                style={{
                                  padding: "0.2rem 0.45rem",
                                  fontSize: "0.7rem",
                                  borderRadius: "0.35rem",
                                  border: "1px solid #dc2626",
                                  color: "#dc2626",
                                  background: "none",
                                  cursor: "pointer",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <Link
                  to={masterLogHref}
                  style={{
                    ...cardStyle,
                    margin: 0,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                    cursor: "pointer",
                    outlineOffset: 2,
                  }}
                  className="card-hover"
                >
                  <h3 className="section-header" style={{ margin: "0 0 0.35rem 0", fontSize: "1rem" }}>
                    Sign in / out log
                  </h3>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem 0" }}>
                    From the external job form. Open master log →
                  </p>
                  {attendancePreview === undefined ? (
                    <p style={{ color: "#6b7280", fontSize: "0.8125rem", margin: 0 }}>Loading…</p>
                  ) : attendancePreview.length === 0 ? (
                    <p style={{ color: "#6b7280", fontSize: "0.8125rem", margin: 0 }}>No entries yet for this trade.</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.78rem", lineHeight: 1.45 }}>
                      {attendancePreview.map((row: Doc<"jobAttendanceLogs">) => (
                        <li key={row._id} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.35rem", marginTop: "0.35rem" }}>
                          <span style={{ fontWeight: 600 }}>{row.workerName}</span>, {formatLogTime(row.signedAt)}{" "}
                          <span style={{ color: "var(--text-secondary)" }}>({row.action === "in" ? "In" : "Out"})</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </Link>
            </div>
          </div>
        </div>

        <Link to={`/projects/${projectId}/subtrades`} style={{ fontSize: "0.875rem", color: "#059669", fontWeight: 600 }}>
          ← Back to subtrades list
        </Link>

        {showEmployeeFormModal && (
          <div
            role="presentation"
            onClick={() => setShowEmployeeFormModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 55,
              padding: "1rem",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="employee-form-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "var(--surface-panel)",
                borderRadius: "0.75rem",
                padding: "1.5rem",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
                maxWidth: "26rem",
                width: "100%",
              }}
            >
              <h2
                id="employee-form-title"
                style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}
              >
                New employee form
              </h2>
              <form onSubmit={(e) => void handleAddEmployeeForm(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    Type of document
                  </label>
                  <select
                    value={formDocType}
                    onChange={(e) => setFormDocType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "0.875rem",
                    }}
                  >
                    {EMPLOYEE_FORM_DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {formatDocTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formDocumentDate}
                    onChange={(e) => setFormDocumentDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    Expiry date
                  </label>
                  <input
                    type="date"
                    required
                    value={formExpiryDate}
                    onChange={(e) => setFormExpiryDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    File (optional)
                  </label>
                  <input
                    type="url"
                    value={formFileUrl}
                    onChange={(e) => {
                      setFormFileUrl(e.target.value);
                      setFormStorageId(null);
                    }}
                    placeholder="Link to document"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                      marginBottom: "0.5rem",
                    }}
                  />
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.35rem 0.65rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "0.8125rem",
                      cursor: formFileUploading ? "wait" : "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    <input
                      type="file"
                      disabled={formFileUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await handleEmployeeFormFileUpload(file);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                    {formFileUploading ? "Uploading…" : formStorageId ? "✓ File attached" : "Upload file"}
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowEmployeeFormModal(false)}
                    style={{
                      padding: "0.4rem 0.85rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "var(--surface-panel)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                      fontFamily: "Montserrat, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!formDocumentDate || !formExpiryDate}
                    style={{
                      ...primaryButtonStyle,
                      opacity: !formDocumentDate || !formExpiryDate ? 0.5 : 1,
                      cursor: !formDocumentDate || !formExpiryDate ? "not-allowed" : "pointer",
                    }}
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showNewContractModal && (
          <div
            role="presentation"
            onClick={() => {
              setShowNewContractModal(false);
              resetNewContractForm();
            }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 55,
              padding: "1rem",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-contract-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "var(--surface-panel)",
                borderRadius: "0.75rem",
                padding: "1.5rem",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
                maxWidth: "28rem",
                width: "100%",
              }}
            >
              <h2
                id="new-contract-title"
                style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}
              >
                New contract
              </h2>
              <form onSubmit={(e) => void handleAddContract(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    Document name
                  </label>
                  <input
                    type="text"
                    required
                    value={newContractName}
                    onChange={(e) => setNewContractName(e.target.value)}
                    placeholder="e.g. Plumbing contract"
                    style={{ width: "100%" }}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    Value ($)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={0.01}
                    value={newContractValue}
                    onChange={(e) => setNewContractValue(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                    Document upload
                  </label>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.35rem 0.65rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "0.8125rem",
                      cursor: newContractFileUploading ? "wait" : "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    <input
                      type="file"
                      disabled={newContractFileUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await handleNewContractFileUpload(file);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                    {newContractFileUploading ? "Uploading..." : newContractStorageId ? "✓ File attached" : "Upload file"}
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewContractModal(false);
                      resetNewContractForm();
                    }}
                    style={{
                      padding: "0.4rem 0.85rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "var(--surface-panel)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                      fontFamily: "Montserrat, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newContractName.trim() || !newContractValue.trim() || newContractFileUploading}
                    style={{
                      ...primaryButtonStyle,
                      opacity: !newContractName.trim() || !newContractValue.trim() || newContractFileUploading ? 0.5 : 1,
                      cursor:
                        !newContractName.trim() || !newContractValue.trim() || newContractFileUploading
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Save contract
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showTradeContactModal && subtradeIdConvex && (
          <div
            role="presentation"
            onClick={() => setShowTradeContactModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 55,
              padding: "1rem",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="trade-contact-title"
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "var(--surface-panel)",
                borderRadius: "0.75rem",
                padding: "1.5rem",
                boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
                maxWidth: "24rem",
                width: "100%",
              }}
            >
              <h2
                id="trade-contact-title"
                style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}
              >
                Trade contact
              </h2>
              <form onSubmit={(e) => void handleSaveTradeContactModal(e)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label
                    htmlFor="trade-contact-phone"
                    style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}
                  >
                    Phone
                  </label>
                  <input
                    id="trade-contact-phone"
                    type="tel"
                    value={editTradePhone}
                    onChange={(e) => setEditTradePhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="e.g. (555) 123-4567"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="trade-contact-email"
                    style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}
                  >
                    Email
                  </label>
                  <input
                    id="trade-contact-email"
                    type="email"
                    value={editTradeEmail}
                    onChange={(e) => setEditTradeEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="name@company.com"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "Montserrat, sans-serif",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginTop: "0.25rem",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSubtradeOpen(true)}
                    style={{
                      padding: "0.4rem 0.85rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #dc2626",
                      backgroundColor: "var(--surface-panel)",
                      color: "#dc2626",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      fontFamily: "Montserrat, sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setShowTradeContactModal(false)}
                      style={{
                        padding: "0.4rem 0.85rem",
                        borderRadius: "0.5rem",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "var(--surface-panel)",
                        color: "var(--text-primary)",
                        fontSize: "0.85rem",
                        fontFamily: "Montserrat, sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" style={primaryButtonStyle}>
                      Save
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmDeleteSubtradeOpen}
          title="Are you sure?"
          confirmLabel="Yes, delete"
          loading={deletingSubtrade}
          message={
            selectedSubtrade ? (
              <>
                This will permanently remove subtrade{" "}
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedSubtrade.name}</span> from
                the project.
              </>
            ) : (
              ""
            )
          }
          onCancel={() => {
            if (!deletingSubtrade) setConfirmDeleteSubtradeOpen(false);
          }}
          onConfirm={handleDeleteSubtradeConfirmed}
        />

        <ConfirmDialog
          open={pendingRemoveEmployeeDocId !== null}
          message="This will permanently remove this employee document."
          onCancel={() => setPendingRemoveEmployeeDocId(null)}
          onConfirm={async () => {
            if (!pendingRemoveEmployeeDocId) return;
            const documentId = pendingRemoveEmployeeDocId;
            setPendingRemoveEmployeeDocId(null);
            await removeEmployeeDocument({ documentId });
          }}
        />

        <style>{`
          @media (max-width: 52rem) {
            .subtrades-detail-bottom-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    );
  }

  // ——— List view ———
  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div style={{ ...cardStyle, padding: "1.25rem" }}>
      <div style={CHANGES_LIST_PANEL}>
        <button
          type="button"
          onClick={() => {
            setNewSubtradeName("");
            setNewSubtradeBudget("");
            setShowNewSubtradeModal(true);
          }}
          title="Add subtrade"
          aria-label="Add subtrade"
          style={ADD_PLUS_BTN}
        >
          +
        </button>
        <h2 className="section-header" style={{ color: "var(--text-primary)", margin: "0 0 0.35rem 0", fontSize: "1.125rem" }}>
          Subtrades
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 0.75rem 0" }}>
          Click a company for trade detail, tasks, and sign-in/out. Use + to add a subtrade.
        </p>

        {sortedSubtrades.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>No subtrades yet. Use + to add one.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-strong)" }}>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Company</th>
                </tr>
              </thead>
              <tbody>
                {sortedSubtrades.map((s: Doc<"projectSubtrades">) => (
                  <tr
                    key={s._id}
                    onClick={() => navigate(`/projects/${projectId}/subtrades/${s._id}`)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        navigate(`/projects/${projectId}/subtrades/${s._id}`);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    style={{
                      borderBottom: "1px solid var(--border-strong)",
                      cursor: "pointer",
                      verticalAlign: "top",
                    }}
                  >
                    <td style={{ padding: "0.5rem 0.5rem", fontWeight: 600, color: "var(--text-primary)" }}>{s.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>

      {showNewSubtradeModal && (
        <div
          role="presentation"
          onClick={() => {
            setShowNewSubtradeModal(false);
            setNewSubtradeName("");
            setNewSubtradeBudget("");
          }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
            padding: "1rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-subtrade-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              maxWidth: "28rem",
              width: "100%",
            }}
          >
            <h2
              id="new-subtrade-title"
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: "1rem",
              }}
            >
              New subtrade
            </h2>
            <form onSubmit={handleAddSubtrade} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                  Subtrade name
                </label>
                <input
                  type="text"
                  placeholder="e.g. ABC Plumbing"
                  value={newSubtradeName}
                  onChange={(e) => setNewSubtradeName(e.target.value)}
                  style={{ width: "100%" }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-primary)", fontSize: "0.875rem" }}>
                  Budget ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0"
                  value={newSubtradeBudget}
                  onChange={(e) => setNewSubtradeBudget(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSubtradeModal(false);
                    setNewSubtradeName("");
                    setNewSubtradeBudget("");
                  }}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    fontFamily: "Montserrat, sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newSubtradeName.trim()}
                  style={{
                    ...primaryButtonStyle,
                    opacity: !newSubtradeName.trim() ? 0.5 : 1,
                    cursor: !newSubtradeName.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  Add subtrade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
