import { useEffect, useMemo, useRef, useState } from "react";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FolderPlusIcon } from "../components/FolderPlusIcon";
import { PencilIcon } from "../components/PencilIcon";
import { cardStyle, innerWhiteCardStyle, shellCardStyle } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { formatHeicConversionError, normalizeImageFileForUpload } from "../utils/heicImage";

const ROOT_FOLDER = "__root__";

/** Left-column selection: none yet, project root (no folder), or a folder id. */
type SelectedFolder = null | "root" | Id<"drawingFolders">;

/** Row from `api.drawings.listDrawings` (document + uploader display name). */
type DrawingListItem = Doc<"drawings"> & { uploaderName: string };

function formatDateTime(value: number) {
  return new Date(value).toLocaleString();
}

function folderRowStyle(selected: boolean): import("react").CSSProperties {
  return {
    width: "100%",
    textAlign: "left",
    fontSize: "0.8125rem",
    padding: "0.4rem 0.5rem",
    borderRadius: "0.375rem",
    border: selected ? "1px solid #059669" : "1px solid #e5e7eb",
    backgroundColor: selected ? "rgba(5, 150, 105, 0.12)" : "#ffffff",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontWeight: selected ? 600 : 500,
    fontFamily: "inherit",
  };
}

const SUBTLE_ICON_BTN: import("react").CSSProperties = {
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

export function DrawingProject() {
  const { projectId } = useParams<{ projectId: Id<"projects"> }>();
  const isMobile = useIsMobile(768);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<SelectedFolder>(null);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState<string>(ROOT_FOLDER);
  const [uploadNotes, setUploadNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editFolderName, setEditFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [confirmDeleteFolderOpen, setConfirmDeleteFolderOpen] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [pendingDeleteDrawing, setPendingDeleteDrawing] = useState<DrawingListItem | null>(null);
  const [deletingDrawingId, setDeletingDrawingId] = useState<Id<"drawings"> | null>(null);

  const project = useQuery(
    api.projects.getProjectById,
    projectQueryArgs(projectId),
  );
  const folders = useQuery(
    api.drawings.listFoldersByProject,
    projectQueryArgs(projectId),
  );
  const drawings = useQuery(
    api.drawings.listDrawings,
    projectQueryArgs(projectId),
  );
  const createFolder = useMutation(api.drawings.createFolder);
  const updateDrawingFolder = useMutation(api.drawings.updateDrawingFolder);
  const deleteDrawingFolder = useMutation(api.drawings.deleteDrawingFolder);
  const createDrawingRecord = useMutation(api.drawings.createDrawingRecord);
  const deleteDrawing = useMutation(api.drawings.deleteDrawing);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);

  const filteredDrawings = useMemo((): DrawingListItem[] => {
    if (!drawings || selectedFolderId === null) return [];
    if (selectedFolderId === "root") return drawings.filter((d: DrawingListItem) => !d.folderId);
    return drawings.filter((d: DrawingListItem) => d.folderId === selectedFolderId);
  }, [drawings, selectedFolderId]);

  if (!projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Missing project id.</p>
      </div>
    );
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || !projectId) return;
    setIsCreatingFolder(true);
    try {
      await createFolder({ projectId, name });
      setNewFolderName("");
      setShowCreateFolderForm(false);
    } finally {
      setIsCreatingFolder(false);
    }
  }

  function selectedDrawingFolderIdForSettings(): Id<"drawingFolders"> | null {
    if (selectedFolderId === null) return null;
    if (selectedFolderId === "root") return null;
    return selectedFolderId;
  }

  function openSettings() {
    const drawingFolderId = selectedDrawingFolderIdForSettings();
    if (!drawingFolderId) return;
    if (!folders) return; // still loading

    const folder = folders.find((f: Doc<"drawingFolders">) => f._id === drawingFolderId);
    if (!folder) return;

    setEditFolderName(folder.name);
    setFolderActionError(null);
    setConfirmDeleteFolderOpen(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    setConfirmDeleteFolderOpen(false);
    setFolderActionError(null);
  }

  async function handleSaveFolderName(e: React.FormEvent) {
    e.preventDefault();
    const drawingFolderId = selectedDrawingFolderIdForSettings();
    if (!drawingFolderId) return;

    const cleanedName = editFolderName.trim();
    if (!cleanedName) return;

    setSavingFolder(true);
    setFolderActionError(null);
    try {
      await updateDrawingFolder({ folderId: drawingFolderId, name: cleanedName });
      closeSettings();
    } catch (err) {
      setFolderActionError(err instanceof Error ? err.message : "Could not update folder");
    } finally {
      setSavingFolder(false);
    }
  }

  async function handleDeleteFolder() {
    const drawingFolderId = selectedDrawingFolderIdForSettings();
    if (!drawingFolderId) return;

    setDeletingFolder(true);
    setFolderActionError(null);
    try {
      await deleteDrawingFolder({ folderId: drawingFolderId });
      setSelectedFolderId("root");
      setUploadFolderId(ROOT_FOLDER);
      setShowUploadPrompt(false);
      closeSettings();
    } catch (err) {
      setFolderActionError(err instanceof Error ? err.message : "Could not delete folder");
    } finally {
      setDeletingFolder(false);
    }
  }

  useEffect(() => {
    if (!showCreateFolderForm) return;
    // Small UX improvement: focus the newly revealed input.
    newFolderInputRef.current?.focus();
  }, [showCreateFolderForm]);

  useEffect(() => {
    // Ensure we always have something selected once folders finish loading,
    // so the right column + edit action become usable immediately.
    if (folders === undefined) return;
    if (folders.length > 0) {
      // If we’re currently on Root (or nothing), select the first real folder.
      if (selectedFolderId === null || selectedFolderId === "root") {
        setSelectedFolderId(folders[0]._id);
      }
    } else {
      // If there are no folders, keep a stable selection.
      if (selectedFolderId === null) setSelectedFolderId("root");
    }
  }, [folders, selectedFolderId]);

  function openUploadPrompt() {
    setShowUploadPrompt(true);
    setUploadNotes("");
    if (selectedFolderId === "root") setUploadFolderId(ROOT_FOLDER);
    else if (selectedFolderId) setUploadFolderId(selectedFolderId);
    else setUploadFolderId(ROOT_FOLDER);
  }

  function requestDeleteDrawing(d: DrawingListItem) {
    setPendingDeleteDrawing(d);
  }

  async function confirmDeleteDrawing() {
    const d = pendingDeleteDrawing;
    if (!d || !projectId) return;
    setPendingDeleteDrawing(null);
    setDeletingDrawingId(d._id);
    try {
      await deleteDrawing({ drawingId: d._id, projectId });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete drawing");
    } finally {
      setDeletingDrawingId(null);
    }
  }

  async function uploadDrawingFile(file: File, folderId: string, notes: string) {
    if (!projectId) return;
    setIsUploading(true);
    try {
      let normalized: File;
      try {
        normalized = await normalizeImageFileForUpload(file);
      } catch (err) {
        window.alert(formatHeicConversionError(err, file.name));
        return;
      }
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: normalized });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      await createDrawingRecord({
        projectId,
        name: normalized.name,
        notes,
        storageId,
        folderId: folderId === ROOT_FOLDER ? undefined : (folderId as Id<"drawingFolders">),
      });
      setShowUploadPrompt(false);
      setUploadNotes("");
      if (selectedFolderId === "root") setUploadFolderId(ROOT_FOLDER);
      else if (selectedFolderId) setUploadFolderId(selectedFolderId);
      else setUploadFolderId(ROOT_FOLDER);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>
            {project?.name ?? "Loading project..."} Drawings
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Files are shown newest to oldest.
          </p>
        </div>
        <Link to="/drawings" style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}>
          Back to projects
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(16rem, 22rem) minmax(0, 1fr)", gap: "1rem", minWidth: 0 }}>
        <section style={shellCardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#ffffff", margin: 0 }}>
              Folders
            </h2>
            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <button
                type="button"
                aria-label={showCreateFolderForm ? "Cancel creating folder" : "Create folder"}
                title={showCreateFolderForm ? "Cancel creating folder" : "Create folder"}
                disabled={isCreatingFolder}
                onClick={() => setShowCreateFolderForm((v) => !v)}
                style={{
                  width: "fit-content",
                  padding: "0.45rem",
                  minWidth: "2.35rem",
                  minHeight: "2.35rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #0f766e",
                  backgroundColor: "var(--surface-panel)",
                  color: "#0f766e",
                  fontWeight: 600,
                  cursor: isCreatingFolder ? "not-allowed" : "pointer",
                  opacity: isCreatingFolder ? 0.6 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ display: "inline-flex", opacity: isCreatingFolder ? 0.65 : 1 }}>
                  <FolderPlusIcon size={20} />
                </span>
              </button>

              <button
                type="button"
                aria-label="Edit folder"
                title="Edit folder"
                disabled={selectedDrawingFolderIdForSettings() == null}
                onClick={openSettings}
                style={{
                  ...SUBTLE_ICON_BTN,
                  opacity: selectedDrawingFolderIdForSettings() == null ? 0.55 : 1,
                  cursor: selectedDrawingFolderIdForSettings() == null ? "not-allowed" : "pointer",
                }}
              >
                <PencilIcon size={18} />
              </button>
            </div>
          </div>

          {showCreateFolderForm && (
            <div style={{ ...innerWhiteCardStyle, marginBottom: "0.75rem" }}>
              <form onSubmit={handleCreateFolder} style={{ display: "grid", gap: "0.35rem" }}>
                <label
                  htmlFor="new-folder-name"
                  style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  New folder
                </label>
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "stretch" }}>
                  <input
                    ref={newFolderInputRef}
                    id="new-folder-name"
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. IFC Set 2026-03-20"
                    style={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", padding: "0.3rem 0.45rem" }}
                  />
                  <button
                    type="submit"
                    aria-label={isCreatingFolder ? "Creating folder" : "Create folder"}
                    title={isCreatingFolder ? "Creating folder" : "Create folder"}
                    disabled={isCreatingFolder || !newFolderName.trim()}
                    style={{
                      width: "fit-content",
                      padding: "0.45rem",
                      minWidth: "2.35rem",
                      minHeight: "2.35rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #0f766e",
                      backgroundColor: "var(--surface-panel)",
                      color: "#0f766e",
                      fontWeight: 600,
                      cursor: isCreatingFolder || !newFolderName.trim() ? "not-allowed" : "pointer",
                      opacity: isCreatingFolder || !newFolderName.trim() ? 0.6 : 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ display: "inline-flex", opacity: isCreatingFolder ? 0.65 : 1 }}>
                      <FolderPlusIcon size={20} />
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={innerWhiteCardStyle}>
            {folders === undefined ? (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>Loading...</p>
            ) : (
              <div style={{ display: "grid", gap: "0.35rem" }}>
                {folders.length === 0 ? (
                  <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    No folders yet - use New folder to add one.
                  </p>
                ) : (
                  folders.map((folder: Doc<"drawingFolders">) => (
                    <button
                      key={folder._id}
                      type="button"
                      onClick={() => setSelectedFolderId(folder._id)}
                      style={folderRowStyle(selectedFolderId === folder._id)}
                    >
                      {folder.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        <section style={shellCardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#ffffff", margin: 0 }}>
              Drawings
            </h2>
            <button
              type="button"
              onClick={openUploadPrompt}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "0.5rem",
                border: "none",
                backgroundColor: "#059669",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Upload from device
            </button>
          </div>

          {showUploadPrompt && (
            <div style={{ ...innerWhiteCardStyle, marginBottom: "0.75rem", border: "1px solid #a7f3d0" }}>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label htmlFor="upload-folder-select" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Choose destination folder for this upload
                </label>
                <select
                  id="upload-folder-select"
                  value={uploadFolderId}
                  onChange={(e) => setUploadFolderId(e.target.value)}
                  disabled={isUploading}
                >
                  <option value={ROOT_FOLDER}>Root</option>
                  {(folders ?? []).map((folder: Doc<"drawingFolders">) => (
                    <option key={folder._id} value={folder._id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  Comments or notes
                </label>
                <textarea
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  disabled={isUploading}
                  rows={4}
                  placeholder="Add any notes about this drawing upload..."
                  style={{
                    width: "100%",
                    resize: "vertical",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.875rem",
                    padding: "0.5rem 0.65rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #d1d5db",
                    boxSizing: "border-box",
                  }}
                />
                <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif,image/heic,image/heif"
                    disabled={isUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      await uploadDrawingFile(file, uploadFolderId, uploadNotes);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadPrompt(false);
                      setUploadNotes("");
                    }}
                    disabled={isUploading}
                    style={{
                      padding: "0.4rem 0.7rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #d1d5db",
                      backgroundColor: "var(--surface-panel)",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                      cursor: isUploading ? "not-allowed" : "pointer",
                    }}
                  >
                    {isUploading ? "Uploading..." : "Cancel"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={innerWhiteCardStyle}>
            {drawings === undefined ? (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>Loading...</p>
            ) : selectedFolderId === null ? (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>Select a folder to view drawings.</p>
            ) : filteredDrawings.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>No drawing files in this folder.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {filteredDrawings.map((drawing: DrawingListItem) => (
                  <div
                    key={drawing._id}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                      padding: "0.65rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e7eb",
                      backgroundColor: "var(--surface-panel)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: "grid", gap: "0.35rem" }}>
                      <div style={{ fontSize: "0.925rem", fontWeight: 600, color: "var(--text-primary)" }}>{drawing.name}</div>
                      <div style={{ fontSize: "0.775rem", color: "var(--text-secondary)" }}>
                        Uploaded by {drawing.uploaderName} on {formatDateTime(drawing.uploadedAt)}
                      </div>
                      {drawing.notes ? (
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {drawing.notes}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginTop: "0.15rem" }}>
                        <Link
                          to={`/drawings/project/${projectId}/drawing/${drawing._id}`}
                          style={{
                            padding: "0.35rem 0.65rem",
                            borderRadius: "0.375rem",
                            border: "none",
                            backgroundColor: "#059669",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            textDecoration: "none",
                            fontFamily: "Montserrat, sans-serif",
                          }}
                        >
                          Open / mark up
                        </Link>
                        <a
                          href={drawing.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: "0.8125rem",
                            color: "#6b7280",
                            fontWeight: 600,
                          }}
                        >
                          Open file in new tab
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${drawing.name}`}
                      title="Delete drawing"
                      disabled={deletingDrawingId === drawing._id}
                      onClick={() => requestDeleteDrawing(drawing)}
                      style={{
                        flexShrink: 0,
                        alignSelf: "flex-start",
                        padding: "0.35rem 0.55rem",
                        borderRadius: "0.375rem",
                        border: "1px solid #fecaca",
                        backgroundColor: "transparent",
                        color: "#b91c1c",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        cursor: deletingDrawingId === drawing._id ? "not-allowed" : "pointer",
                        fontFamily: "Montserrat, sans-serif",
                        opacity: deletingDrawingId === drawing._id ? 0.65 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {deletingDrawingId === drawing._id ? "…" : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

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
            aria-labelledby="drawing-folder-settings-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle,
              maxWidth: "22rem",
              width: "94%",
              maxHeight: "92vh",
              overflow: "auto",
            }}
          >
            <h2
              id="drawing-folder-settings-title"
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                margin: "0 0 0.75rem",
                color: "var(--text-primary)",
              }}
            >
              Folder settings
            </h2>

            <form onSubmit={handleSaveFolderName} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <label style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Folder name
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  disabled={savingFolder}
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
              {folderActionError ? (
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "#dc2626" }}>{folderActionError}</p>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={closeSettings}
                  disabled={savingFolder}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    cursor: savingFolder ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingFolder || !editFolderName.trim()}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    cursor: savingFolder || !editFolderName.trim() ? "not-allowed" : "pointer",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.85rem",
                    opacity: savingFolder || !editFolderName.trim() ? 0.7 : 1,
                  }}
                >
                  {savingFolder ? "Saving..." : "Save name"}
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
                  setFolderActionError(null);
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

      <ConfirmDialog
        open={confirmDeleteFolderOpen}
        confirmLabel="Delete folder"
        loading={deletingFolder}
        message="Delete this folder? Drawings stay in the project but will no longer be grouped here."
        onCancel={() => setConfirmDeleteFolderOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteFolderOpen(false);
          await handleDeleteFolder();
        }}
      />
      <ConfirmDialog
        open={pendingDeleteDrawing !== null}
        loading={pendingDeleteDrawing !== null && deletingDrawingId === pendingDeleteDrawing._id}
        message={
          pendingDeleteDrawing ? (
            <>
              This will permanently delete{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{pendingDeleteDrawing.name}</span>. The
              file and any mark-up will be removed.
            </>
          ) : null
        }
        onCancel={() => setPendingDeleteDrawing(null)}
        onConfirm={() => void confirmDeleteDrawing()}
      />
    </div>
  );
}
