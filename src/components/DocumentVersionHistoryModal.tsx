import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

const MODAL_Z_INDEX = 15000;

type DocumentVersionHistoryModalProps = {
  open: boolean;
  document: Doc<"documents"> | null;
  onClose: () => void;
  onBranched?: (newDocumentId: Id<"documents">) => void;
  onRestored?: () => void;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.55)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  zIndex: MODAL_Z_INDEX,
  padding: "1rem",
  overflowY: "auto",
};

const dialogStyle: React.CSSProperties = {
  backgroundColor: "var(--surface-panel)",
  borderRadius: "0.75rem",
  padding: "1.25rem 1.25rem 1.5rem",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.08)",
  maxWidth: "52rem",
  width: "100%",
  marginTop: "2rem",
};

const btnBase: React.CSSProperties = {
  padding: "0.35rem 0.65rem",
  borderRadius: "0.375rem",
  fontSize: "0.8rem",
  cursor: "pointer",
  fontWeight: 500,
};

function saveTypeLabel(saveType: string): string {
  switch (saveType) {
    case "autosave":
      return "Auto-save";
    case "publish":
      return "Published";
    case "upload":
      return "Upload";
    case "restore":
      return "Restore";
    case "branch":
      return "Branch";
    default:
      return "Manual";
  }
}

function saveTypeBadgeColor(saveType: string): string {
  switch (saveType) {
    case "autosave":
      return "#6b7280";
    case "publish":
      return "#059669";
    case "upload":
      return "#2563eb";
    case "restore":
      return "#d97706";
    case "branch":
      return "#7c3aed";
    default:
      return "#475569";
  }
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DocumentVersionHistoryModal({
  open,
  document,
  onClose,
  onBranched,
  onRestored,
}: DocumentVersionHistoryModalProps) {
  const versions = useQuery(
    api.documentVersions.listDocumentVersions,
    open && document ? { documentId: document._id } : "skip",
  );
  const ensureInitialVersion = useMutation(api.documentVersions.ensureInitialDocumentVersion);
  const restoreVersion = useMutation(api.documentVersions.restoreDocumentVersion);
  const branchVersion = useMutation(api.documentVersions.branchDocumentFromVersion);

  const [busyId, setBusyId] = useState<Id<"documentVersions"> | null>(null);
  const [previewFormData, setPreviewFormData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !document) return;
    void ensureInitialVersion({ documentId: document._id }).catch(() => {
      // list may still work; ignore backfill errors in UI
    });
  }, [open, document, ensureInitialVersion]);

  if (!open || !document) return null;

  async function handleRestore(versionId: Id<"documentVersions">, versionNumber: number) {
    if (!window.confirm(`Restore this document to version ${versionNumber}? Current changes will be saved to history first.`)) {
      return;
    }
    setBusyId(versionId);
    setError(null);
    try {
      await restoreVersion({ versionId });
      onRestored?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBranch(versionId: Id<"documentVersions">, versionNumber: number) {
    const name = window.prompt(`Name for the new document (from v${versionNumber}):`, `${document!.name} (copy)`);
    if (!name?.trim()) return;
    setBusyId(versionId);
    setError(null);
    try {
      const newId = await branchVersion({ versionId, name: name.trim() });
      onBranched?.(newId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create document");
    } finally {
      setBusyId(null);
    }
  }

  return createPortal(
    <div role="presentation" style={overlayStyle} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-version-history-title"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <h2 id="doc-version-history-title" style={{ margin: 0, fontSize: "1.15rem" }}>
              Version history
            </h2>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {document.name}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ ...btnBase, border: "1px solid var(--border-subtle)", background: "none" }}>
            Close
          </button>
        </div>

        {error ? (
          <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: 0 }}>{error}</p>
        ) : null}

        {versions === undefined ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading versions…</p>
        ) : versions.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No saved versions yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem" }}>Version</th>
                  <th style={{ padding: "0.5rem" }}>Saved</th>
                  <th style={{ padding: "0.5rem" }}>By</th>
                  <th style={{ padding: "0.5rem" }}>Type</th>
                  <th style={{ padding: "0.5rem" }}>Label</th>
                  <th style={{ padding: "0.5rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v: NonNullable<typeof versions>[number]) => (
                  <tr key={v._id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.5rem", fontWeight: 600 }}>v{v.versionNumber}</td>
                    <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{formatDateTime(v.savedAt)}</td>
                    <td style={{ padding: "0.5rem" }}>{v.savedByName}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "999px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color: "#fff",
                          backgroundColor: saveTypeBadgeColor(v.saveType),
                        }}
                      >
                        {saveTypeLabel(v.saveType)}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem", color: "var(--text-muted)" }}>{v.label ?? "—"}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                        {v.fileUrl ? (
                          <a
                            href={v.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...btnBase, border: "1px solid #2563eb", color: "#2563eb", background: "none", textDecoration: "none" }}
                          >
                            View file
                          </a>
                        ) : null}
                        {v.formData ? (
                          <button
                            type="button"
                            onClick={() => setPreviewFormData(v.formData ?? null)}
                            style={{ ...btnBase, border: "1px solid #6b7280", color: "#6b7280", background: "none" }}
                          >
                            View form
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === v._id}
                          onClick={() => void handleRestore(v._id, v.versionNumber)}
                          style={{ ...btnBase, border: "1px solid #d97706", color: "#d97706", background: "none" }}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={busyId === v._id}
                          onClick={() => void handleBranch(v._id, v.versionNumber)}
                          style={{ ...btnBase, border: "1px solid #7c3aed", color: "#7c3aed", background: "none" }}
                        >
                          Save as new
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {previewFormData ? (
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <strong style={{ fontSize: "0.85rem" }}>Form data preview</strong>
              <button type="button" onClick={() => setPreviewFormData(null)} style={{ ...btnBase, border: "1px solid var(--border-subtle)", background: "none" }}>
                Hide
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: "0.75rem",
                background: "var(--surface-muted)",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                overflow: "auto",
                maxHeight: "16rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(previewFormData), null, 2);
                } catch {
                  return previewFormData;
                }
              })()}
            </pre>
          </div>
        ) : null}
      </div>
    </div>,
    globalThis.document.body,
  );
}
