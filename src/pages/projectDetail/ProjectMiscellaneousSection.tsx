import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { FolderPlusIcon } from "../../components/FolderPlusIcon";
import { DocumentPlusIcon } from "../../components/DocumentPlusIcon";
import { FolderIcon } from "../../components/FolderIcon";

const MISC_DOC_TYPE = "MISC";

const spreadsheetShellStyle: React.CSSProperties = {
  border: "1px solid var(--border-subtle)",
  borderRadius: "0.5rem",
  overflow: "hidden",
  fontSize: "0.8125rem",
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minHeight: "12rem",
};

const fileHeaderRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr 1fr",
  gap: "0.5rem",
  padding: "0.45rem 0.6rem",
  backgroundColor: "var(--surface-panel)",
  borderBottom: "1px solid var(--border-subtle)",
  fontWeight: 600,
  color: "var(--text-primary)",
};

const fileRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr 1fr",
  gap: "0.5rem",
  padding: "0.5rem 0.6rem",
  borderTop: "1px solid var(--border-subtle)",
  color: "var(--text-secondary)",
  alignItems: "center",
};

const toolbarBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.35rem 0.65rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
  borderRadius: "0.5rem",
  border: "1px solid rgba(255,255,255,0.45)",
  backgroundColor: "rgba(255,255,255,0.2)",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
};

const folderRowStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  borderRadius: "0.4rem",
  border: "1px solid var(--border-strong)",
  backgroundColor: "transparent",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.875rem",
  color: "var(--text-primary)",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

type Props = {
  projectId: Id<"projects">;
};

function FileSpreadsheet({
  docs,
  loading,
  emptyMessage,
}: {
  docs: Doc<"documents">[];
  loading: boolean;
  emptyMessage: string;
}) {
  return (
    <div style={spreadsheetShellStyle}>
      <div style={fileHeaderRowStyle}>
        <span>Document name</span>
        <span>Uploaded</span>
        <span>File</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>Loading documents…</div>
        ) : docs.length === 0 ? (
          <div style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>{emptyMessage}</div>
        ) : (
          docs.map((doc) => (
            <div key={doc._id} style={fileRowStyle}>
              <span style={{ color: "var(--text-primary)", wordBreak: "break-word" }}>{doc.name}</span>
              <span>{formatDate(doc.uploadedAt)}</span>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--color-emerald-500)", fontWeight: 500 }}
              >
                Open
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ProjectMiscellaneousSection({ projectId }: Props) {
  const documents = useQuery(api.documents.listDocumentsByProject, { projectId });
  const documentFolders = useQuery(api.documents.listDocumentFoldersByProject, { projectId });
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const createDocumentFolder = useMutation(api.documents.createDocumentFolder);

  const [selectedFolderId, setSelectedFolderId] = useState<Id<"documentFolders"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const dropZoneInputRef = useRef<HTMLInputElement>(null);
  const toolbarInputRef = useRef<HTMLInputElement>(null);

  const miscDocuments = useMemo(
    () =>
      (documents ?? [])
        .filter((d) => d.type.toUpperCase() === MISC_DOC_TYPE)
        .slice()
        .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0)),
    [documents],
  );

  const hasFolders = (documentFolders?.length ?? 0) > 0;

  const sortedFolders = useMemo(
    () => (documentFolders ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [documentFolders],
  );

  const miscCountByFolderId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of miscDocuments) {
      if (!doc.folderId) continue;
      counts.set(doc.folderId, (counts.get(doc.folderId) ?? 0) + 1);
    }
    return counts;
  }, [miscDocuments]);

  const unfiledMiscDocuments = useMemo(
    () => miscDocuments.filter((d) => !d.folderId),
    [miscDocuments],
  );

  const folderMiscDocuments = useMemo(() => {
    if (!selectedFolderId) return [];
    return miscDocuments.filter((d) => d.folderId === selectedFolderId);
  }, [miscDocuments, selectedFolderId]);

  const selectedFolderName = useMemo(() => {
    if (!selectedFolderId) return null;
    return sortedFolders.find((f) => f._id === selectedFolderId)?.name ?? "Folder";
  }, [selectedFolderId, sortedFolders]);

  const isFlatView = !hasFolders;
  const isFrontPage = hasFolders && selectedFolderId === null;
  const isFolderDetail = hasFolders && selectedFolderId !== null;

  const uploadTargetFolderId = isFolderDetail ? selectedFolderId ?? undefined : undefined;

  const dropZoneHint = isFolderDetail
    ? `Files upload to ${selectedFolderName ?? "this folder"}.`
    : hasFolders
      ? "Files upload as unfiled."
      : "Drop files here or click to upload.";

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of files) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: file.type ? { "Content-Type": file.type } : {},
          body: file,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        await createDocument({
          projectId,
          type: MISC_DOC_TYPE,
          name: file.name,
          storageId,
          folderId: uploadTargetFolderId,
        });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (uploading) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void uploadFiles(files);
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setFolderCreating(true);
    setFolderError(null);
    try {
      await createDocumentFolder({ projectId, name });
      setNewFolderName("");
      setShowCreateFolderForm(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setFolderCreating(false);
    }
  }

  const cardTitle = isFolderDetail ? (selectedFolderName ?? "Folder") : "Documents";
  const showCreateFolder = isFlatView || isFrontPage;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontFamily: "Montserrat, sans-serif" }}>
      <div>
        <h2 className="section-header" style={{ margin: 0 }}>
          Miscellaneous
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.35rem", marginBottom: 0 }}>
          Catch-all documents for this project. Browse folders or upload files.
        </p>
      </div>

      {isFolderDetail && (
        <button
          type="button"
          onClick={() => setSelectedFolderId(null)}
          style={{
            alignSelf: "flex-start",
            padding: "0.35rem 0.65rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
            borderRadius: "0.5rem",
            border: "1px solid var(--border-strong)",
            backgroundColor: "var(--surface-panel)",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          ← All folders
        </button>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && dropZoneInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!uploading) dropZoneInputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: dragActive ? "2px dashed var(--color-emerald-500)" : "2px dashed var(--border-strong)",
          borderRadius: "0.75rem",
          padding: "2.5rem 1.5rem",
          textAlign: "center",
          backgroundColor: dragActive ? "rgba(16, 185, 129, 0.08)" : "var(--surface-panel)",
          cursor: uploading ? "not-allowed" : "pointer",
          transition: "border-color 0.15s, background-color 0.15s",
        }}
      >
        <input
          ref={dropZoneInputRef}
          type="file"
          multiple
          disabled={uploading}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) void uploadFiles(files);
          }}
          style={{ display: "none" }}
        />
        <p style={{ margin: 0, fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>
          {uploading ? "Uploading…" : "Drop files here or click to upload"}
        </p>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{dropZoneHint}</p>
      </div>

      {uploadError && (
        <p style={{ margin: 0, color: "#b91c1c", fontSize: "0.875rem" }} role="alert">
          {uploadError}
        </p>
      )}

      <div
        aria-label="Miscellaneous documents"
        style={{
          borderRadius: "0.75rem",
          border: "2px solid var(--color-emerald-800)",
          overflow: "hidden",
          backgroundColor: "var(--surface-card)",
          display: "flex",
          flexDirection: "column",
          minHeight: "24rem",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--color-emerald-800)",
            color: "#fff",
            padding: "0.45rem 0.6rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            minHeight: "2.25rem",
          }}
        >
          <span>{cardTitle}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {showCreateFolder && (
              <button
                type="button"
                onClick={() => {
                  setFolderError(null);
                  setShowCreateFolderForm((v) => !v);
                }}
                title="Create folder"
                aria-label="Create folder"
                style={toolbarBtnStyle}
              >
                <FolderPlusIcon size={16} />
                Create folder
              </button>
            )}
            <button
              type="button"
              onClick={() => !uploading && toolbarInputRef.current?.click()}
              disabled={uploading}
              title="Upload documents"
              aria-label="Upload documents"
              style={{ ...toolbarBtnStyle, opacity: uploading ? 0.7 : 1 }}
            >
              <DocumentPlusIcon size={16} />
              Upload documents
            </button>
            <input
              ref={toolbarInputRef}
              type="file"
              multiple
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                if (files.length) void uploadFiles(files);
              }}
              style={{ display: "none" }}
            />
          </div>
        </div>

        {showCreateFolderForm && showCreateFolder && (
          <form
            onSubmit={(e) => void handleCreateFolder(e)}
            style={{
              padding: "0.65rem 0.75rem",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
              backgroundColor: "var(--surface-muted)",
            }}
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name"
              disabled={folderCreating}
              style={{
                flex: "1 1 12rem",
                padding: "0.4rem 0.55rem",
                fontSize: "0.8125rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-strong)",
                fontFamily: "Montserrat, sans-serif",
              }}
            />
            <button
              type="submit"
              disabled={folderCreating || !newFolderName.trim()}
              style={{
                padding: "0.4rem 0.75rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                borderRadius: "0.375rem",
                border: "none",
                backgroundColor: "var(--color-emerald-500)",
                color: "#fff",
                cursor: folderCreating || !newFolderName.trim() ? "not-allowed" : "pointer",
                opacity: folderCreating || !newFolderName.trim() ? 0.7 : 1,
              }}
            >
              {folderCreating ? "Creating…" : "Add folder"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateFolderForm(false);
                setNewFolderName("");
                setFolderError(null);
              }}
              style={{
                padding: "0.4rem 0.65rem",
                fontSize: "0.8125rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-strong)",
                backgroundColor: "var(--surface-panel)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            {folderError && (
              <span style={{ color: "#b91c1c", fontSize: "0.8125rem", width: "100%" }} role="alert">
                {folderError}
              </span>
            )}
          </form>
        )}

        <div style={{ padding: "0.75rem", flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isFlatView && (
            <FileSpreadsheet
              docs={miscDocuments}
              loading={documents === undefined}
              emptyMessage="No documents yet. Drop files above or use Upload documents."
            />
          )}

          {isFrontPage && (
            <>
              <div>
                {documentFolders === undefined ? (
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.8125rem" }}>Loading folders…</p>
                ) : sortedFolders.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    No folders yet. Create one to organize documents.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {sortedFolders.map((folder) => {
                      const count = miscCountByFolderId.get(folder._id) ?? 0;
                      return (
                        <button
                          key={folder._id}
                          type="button"
                          onClick={() => setSelectedFolderId(folder._id)}
                          style={folderRowStyle}
                          className="card-hover"
                        >
                          <FolderIcon size={18} />
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {folder.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-secondary)",
                              flexShrink: 0,
                            }}
                          >
                            ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <FileSpreadsheet
                  docs={unfiledMiscDocuments}
                  loading={documents === undefined}
                  emptyMessage="No unfiled documents."
                />
              </div>
            </>
          )}

          {isFolderDetail && (
            <FileSpreadsheet
              docs={folderMiscDocuments}
              loading={documents === undefined}
              emptyMessage="No documents in this folder yet."
            />
          )}
        </div>
      </div>
    </div>
  );
}
