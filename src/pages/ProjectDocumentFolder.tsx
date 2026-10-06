import { useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { cardStyle } from "../theme";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DocumentVersionHistoryModal } from "../components/DocumentVersionHistoryModal";
import { PencilIcon } from "../components/PencilIcon";
import { projectSectionHref } from "./projectDetail/projectSectionPaths";

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

/** Legacy daily report uploads use names like `Title - attachment 1` without a task→document DB link. */
const DAILY_REPORT_ATTACHMENT_NAME = /^(.+?)\s+-\s+attachment\s+(\d+)$/i;

/**
 * Best-effort link from a folder document row to its daily report task (older data had no `dailyReportFolderId`).
 */
function findLinkedDailyReportTaskId(
  doc: Doc<"documents">,
  tasks: Doc<"projectTasks">[],
): Id<"projectTasks"> | null {
  if (tasks.length === 0) return null;
  const typeNorm = doc.type.trim().toLowerCase();
  if (typeNorm !== "other") return null;

  const m = doc.name.match(DAILY_REPORT_ATTACHMENT_NAME);
  if (m) {
    const title = m[1].trim();
    let candidates = tasks.filter((t) => t.title.trim() === title);
    if (doc.fileUrl && candidates.length > 1) {
      const byUrl = candidates.filter((t) => t.documentUrls?.includes(doc.fileUrl));
      if (byUrl.length === 1) return byUrl[0]._id;
      if (byUrl.length > 0) candidates = byUrl;
    }
    if (candidates.length === 1) return candidates[0]._id;
    if (candidates.length > 1) {
      const anchor = doc.createdDate ?? doc.uploadedAt;
      const sorted = [...candidates].sort(
        (a, b) => Math.abs((a.dueDate ?? 0) - anchor) - Math.abs((b.dueDate ?? 0) - anchor),
      );
      return sorted[0]._id;
    }
  }

  if (doc.fileUrl) {
    const byUrl = tasks.filter((t) => t.documentUrls?.includes(doc.fileUrl));
    if (byUrl.length === 1) return byUrl[0]._id;
  }
  return null;
}

const SUBTLE_ICON_BTN: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.35rem",
  borderRadius: "0.375rem",
  border: "1px solid var(--border-strong, #e5e7eb)",
  backgroundColor: "var(--surface-panel)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
};

export function ProjectDocumentFolder() {
  const { projectId, folderId } = useParams<{ projectId: string; folderId: string }>();
  const navigate = useNavigate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteFolderOpen, setConfirmDeleteFolderOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyDoc, setHistoryDoc] = useState<Doc<"documents"> | null>(null);

  const folder = useQuery(
    api.documents.getDocumentFolder,
    folderId ? { folderId: folderId as Id<"documentFolders"> } : "skip",
  );
  const documents = useQuery(
    api.documents.listDocumentsInFolder,
    projectId && folderId
      ? {
          projectId: projectId as Id<"projects">,
          folderId: folderId as Id<"documentFolders">,
        }
      : "skip",
  );
  const dailyReportsInFolder = useQuery(
    api.tasks.listDailyReportsInFolder,
    projectId && folderId
      ? {
          projectId: projectId as Id<"projects">,
          folderId: folderId as Id<"documentFolders">,
        }
      : "skip",
  );
  const project = useQuery(
    api.projects.getProjectById,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );
  const projectTasks = useQuery(
    api.tasks.listTasksByProject,
    projectId ? { projectId: projectId as Id<"projects"> } : "skip",
  );

  const updateFolder = useMutation(api.documents.updateDocumentFolder);
  const deleteFolder = useMutation(api.documents.deleteDocumentFolder);

  const backTo = projectId ? projectSectionHref(projectId, "daily_reports") : "/projects";

  function openSettings() {
    if (folder) setEditName(folder.name);
    setActionError(null);
    setConfirmDeleteFolderOpen(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setConfirmDeleteFolderOpen(false);
    setActionError(null);
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!folderId) return;
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateFolder({ folderId: folderId as Id<"documentFolders">, name });
      closeSettings();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update folder");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteFolder() {
    if (!folderId) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteFolder({ folderId: folderId as Id<"documentFolders"> });
      navigate(backTo);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete folder");
    } finally {
      setDeleting(false);
    }
  }

  if (!projectId || !folderId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Invalid folder link.</p>
        <Link to="/projects" style={{ color: "#059669", textDecoration: "none" }}>
          Back to projects
        </Link>
      </div>
    );
  }

  if (
    project === undefined ||
    folder === undefined ||
    documents === undefined ||
    dailyReportsInFolder === undefined ||
    projectTasks === undefined
  ) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (project === null || folder === null || folder.projectId !== projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Folder not found.</p>
        <Link to={backTo} style={{ color: "#059669", textDecoration: "none" }}>
          {"<-"} Back to daily reports
        </Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "40rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          to={backTo}
          style={{
            display: "inline-block",
            fontSize: "0.875rem",
            color: "#047857",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {"<-"} Back to folders
        </Link>
      </div>

      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--text-primary)" }}>
              {folder.name}
            </h1>
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "#6b7280" }}>
              {project.name}
              {project.clientName ? ` · ${project.clientName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={openSettings}
            style={SUBTLE_ICON_BTN}
            title="Folder settings"
            aria-label="Folder settings"
          >
            <PencilIcon size={18} />
          </button>
        </div>
      </div>

      {dailyReportsInFolder.length > 0 ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--text-primary)" }}>
            Daily reports
          </h2>
          <p style={{ margin: "0 0 0.65rem", fontSize: "0.8125rem", color: "#6b7280" }}>
            Open a report for the full write-up, attachments, and Edit or Delete on its own page.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {dailyReportsInFolder.map((t: Doc<"projectTasks">) => (
              <li key={t._id}>
                <Link
                  to={`/projects/${projectId}/daily-report/${t._id}?fromFolder=${folderId}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: "0.35rem",
                    padding: "0.75rem 0.9rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-strong, #e5e7eb)",
                    backgroundColor: "var(--surface-card)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", width: "100%" }}>
                    <span style={{ color: "var(--text-secondary)", flexShrink: 0, fontSize: "0.8125rem" }}>
                      {formatDate(t.dueDate)}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        color: "var(--text-primary)",
                        minWidth: 0,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title}
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "#047857", flexShrink: 0, fontWeight: 600 }}>Open full report →</span>
                  </div>
                  {t.description?.trim() ? (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#6b7280",
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden",
                      }}
                    >
                      {t.description.trim()}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--text-primary)" }}>Documents</h2>
      <p style={{ margin: "0 0 0.65rem", fontSize: "0.8125rem", color: "#6b7280" }}>
        Older daily report uploads may appear only here. When we can match them to a report, use{" "}
        <strong style={{ color: "var(--text-secondary)", fontWeight: 600 }}>View full report</strong> for the written log and
        edit/delete.
      </p>
      {documents.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          {dailyReportsInFolder.length === 0 ? "No daily reports or documents in this folder yet." : "No other documents in this folder."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {documents.map((d: Doc<"documents">) => {
            const linkedReportId = findLinkedDailyReportTaskId(d, projectTasks);
            const reportHref =
              linkedReportId && projectId && folderId
                ? `/projects/${projectId}/daily-report/${linkedReportId}?fromFolder=${folderId}`
                : null;
            return (
              <li key={d._id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-strong, #e5e7eb)",
                    backgroundColor: "var(--surface-card)",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>{d.name}</div>
                    <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.2rem" }}>
                      {d.type}
                      {" · "}
                      {formatDate(d.createdDate ?? d.uploadedAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexShrink: 0, flexWrap: "wrap" }}>
                    {reportHref ? (
                      <Link
                        to={reportHref}
                        style={{
                          fontWeight: 600,
                          color: "#047857",
                          textDecoration: "none",
                          fontSize: "0.875rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        View full report
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setHistoryDoc(d)}
                      style={{
                        fontWeight: 600,
                        color: "#6b7280",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        whiteSpace: "nowrap",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      History
                    </button>
                    <Link
                      to={`/projects/${projectId}/documents/${d._id}/view`}
                      style={{
                        fontWeight: 600,
                        color: "#047857",
                        textDecoration: "none",
                        fontSize: "0.875rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      View
                    </Link>
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontWeight: 600,
                        color: "#6b7280",
                        textDecoration: "none",
                        fontSize: "0.875rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Open file
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {settingsOpen && (
        <div
          role="presentation"
          onClick={closeSettings}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-settings-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle,
              maxWidth: "22rem",
              width: "94%",
              maxHeight: "92vh",
              overflow: "auto",
            }}
          >
            <h2 id="folder-settings-title" style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.75rem", color: "var(--text-primary)" }}>
              Folder settings
            </h2>

            <form onSubmit={handleSaveName} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <label style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                Folder name
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "0.25rem",
                    padding: "0.4rem 0.5rem",
                    borderRadius: "0.375rem",
                    border: "1px solid #e5e7eb",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.875rem",
                  }}
                />
              </label>
              {actionError ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "#dc2626" }}>{actionError}</p>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={closeSettings}
                  disabled={saving}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !editName.trim()}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    cursor: saving || !editName.trim() ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.85rem",
                    opacity: saving || !editName.trim() ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save name"}
                </button>
              </div>
            </form>

            <div
              style={{
                marginTop: "1.25rem",
                paddingTop: "1.25rem",
                borderTop: "1px solid var(--border-strong, #e5e7eb)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setConfirmDeleteFolderOpen(true);
                }}
                style={{
                  padding: "0.4rem 0.65rem",
                  fontSize: "0.8125rem",
                  borderRadius: "0.375rem",
                  border: "1px solid #fecaca",
                  backgroundColor: "transparent",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Delete folder...
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentVersionHistoryModal
        open={historyDoc != null}
        document={historyDoc}
        onClose={() => setHistoryDoc(null)}
      />
      <ConfirmDialog
        open={confirmDeleteFolderOpen}
        confirmLabel="Delete folder"
        loading={deleting}
        message="Delete this folder? Documents stay in the project but will no longer be grouped here."
        onCancel={() => setConfirmDeleteFolderOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteFolderOpen(false);
          await handleDeleteFolder();
        }}
      />
    </div>
  );
}
