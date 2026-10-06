import { useState } from "react";
import { projectQueryArgs, subtradeQueryArgs, asProjectId, withProjectId } from "../lib/projectQueryArgs";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { cardStyle } from "../theme";
import { safetyJobSummaryHref } from "./projectDetail/projectSectionPaths";

const inputStyle = {
  width: "100%" as const,
  marginBottom: "0.75rem",
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const DOC_TYPES = ["certification", "training", "license", "insurance", "other"];

function dateInputToLocalMs(value: string): number | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

export function SafetySubtradeEmployees() {
  const { projectId, subtradeId } = useParams<{ projectId: string; subtradeId: string }>();

  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const subtrade = useQuery(api.subtrades.listByProject, "skip") // placeholder to satisfy hook rules
    ? null
    : null;

  // Fetch subtrade via ProjectDetail already having helper API; we add a specific query instead.
  const subtradeDoc = useQuery(
    api.subtrades.listByProject,
    projectQueryArgs(projectId)
  )?.find((s) => s._id === (subtradeId as unknown as Id<"projectSubtrades">));

  const employeeDocs = useQuery(
    api.safety.listEmployeeDocumentsBySubtrade,
    subtradeQueryArgs(projectId, subtradeId),
  );

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const addEmployeeDoc = useMutation(api.safety.addEmployeeDocument);
  const removeEmployeeDoc = useMutation(api.safety.removeEmployeeDocument);

  const [pendingRemoveDocId, setPendingRemoveDocId] = useState<Id<"safetyEmployeeDocuments"> | null>(null);
  const [empName, setEmpName] = useState("");
  const [empDocType, setEmpDocType] = useState("certification");
  const [empDocName, setEmpDocName] = useState("");
  const [empDocUrl, setEmpDocUrl] = useState("");
  const [empDocStorageId, setEmpDocStorageId] = useState<Id<"_storage"> | null>(null);
  const [empUploading, setEmpUploading] = useState(false);
  const [empDocDate, setEmpDocDate] = useState("");
  const [empExpiryDate, setEmpExpiryDate] = useState("");
  const workerSuggestions = useQuery(
    api.safety.listRecentWorkersByProjectTrade,
    projectId && subtradeId
      ? withProjectId(projectId, {
          subtradeId: subtradeId as Id<"projectSubtrades">,
          search: empName.trim() || undefined,
          limit: 8,
        })
      : "skip",
  );

  if (!projectId || !subtradeId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: "#ffffff" }}>
        <p>Missing project or trade.</p>
        <Link to={projectId ? safetyJobSummaryHref(projectId) : "/safety"} style={{ color: "#ffffff" }}>
          Back to safety summary
        </Link>
      </div>
    );
  }

  if (project === undefined || employeeDocs === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: "#ffffff" }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: "#ffffff" }}>
        <p>Project not found.</p>
        <Link to={safetyJobSummaryHref(projectId)} style={{ color: "#ffffff" }}>
          Back to safety summary
        </Link>
      </div>
    );
  }

  async function handleFileUpload(
    file: File,
    setStorageId: (id: Id<"_storage"> | null) => void,
    onDone: () => void
  ) {
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      setStorageId(storageId);
    } finally {
      onDone();
    }
  }

  async function handleAddEmployeeDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!empName.trim() || !empDocName.trim()) return;
    await addEmployeeDoc({
      projectId: projectId as Id<"projects">,
      subtradeId: subtradeId as Id<"projectSubtrades">,
      employeeName: empName.trim(),
      documentType: empDocType,
      name: empDocName.trim(),
      fileUrl: empDocUrl.trim() || undefined,
      storageId: empDocStorageId ?? undefined,
      documentDate: dateInputToLocalMs(empDocDate),
      expiryDate: dateInputToLocalMs(empExpiryDate),
    });
    setEmpName("");
    setEmpDocType("certification");
    setEmpDocName("");
    setEmpDocUrl("");
    setEmpDocStorageId(null);
    setEmpDocDate("");
    setEmpExpiryDate("");
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", color: "#ffffff" }}>
      <Link
        to={safetyJobSummaryHref(projectId)}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: "#000000",
          textDecoration: "none",
        }}
      >
        {"<-"} Back to safety summary
      </Link>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#000000", marginBottom: "0.25rem" }}>
        Employee documents - {subtradeDoc?.name ?? "Trade"}
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Project {project.name} · {project.clientName}
        {project.location && ` · ${project.location}`}
      </p>

      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#000000", marginBottom: "1rem" }}>
          Employee documents for this trade
        </h2>
        <form onSubmit={handleAddEmployeeDoc} style={{ marginBottom: "1.5rem", maxWidth: "28rem" }}>
          <label style={labelStyle}>Employee name</label>
          <input
            type="text"
            value={empName}
            onChange={(e) => setEmpName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. John Smith"
            required
          />
          {workerSuggestions && workerSuggestions.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.75rem" }}>
              {workerSuggestions.map((w) => (
                <button
                  key={w.workerNameNormalized}
                  type="button"
                  onClick={() => setEmpName(w.workerName)}
                  style={{
                    border: "1px solid #d1d5db",
                    backgroundColor: "#f9fafb",
                    borderRadius: "999px",
                    padding: "0.2rem 0.55rem",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  {w.workerName}
                </button>
              ))}
            </div>
          ) : null}
          <label style={labelStyle}>Document type</label>
          <select
            value={empDocType}
            onChange={(e) => setEmpDocType(e.target.value)}
            style={inputStyle}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label style={labelStyle}>Document name</label>
          <input
            type="text"
            value={empDocName}
            onChange={(e) => setEmpDocName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. OSHA 30 Certificate"
            required
          />
          <label style={labelStyle}>Document date (optional)</label>
          <input type="date" value={empDocDate} onChange={(e) => setEmpDocDate(e.target.value)} style={inputStyle} />
          <label style={labelStyle}>Expiry date (optional)</label>
          <input type="date" value={empExpiryDate} onChange={(e) => setEmpExpiryDate(e.target.value)} style={inputStyle} />
          <label style={labelStyle}>File (upload or link, optional)</label>
          <input
            type="url"
            value={empDocUrl}
            onChange={(e) => {
              setEmpDocUrl(e.target.value);
              setEmpDocStorageId(null);
            }}
            style={inputStyle}
            placeholder="Paste a link (optional if uploading a file)"
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
              color: "#374151",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
              marginBottom: "0.75rem",
            }}
          >
            <input
              type="file"
              disabled={empUploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setEmpUploading(true);
                setEmpDocUrl("");
                await handleFileUpload(file, setEmpDocStorageId, () => setEmpUploading(false));
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
            {empUploading
              ? "Uploading file..."
              : empDocStorageId
                ? "✓ File ready to attach"
                : "Upload from computer"}
          </label>
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
            Add document
          </button>
        </form>

        {employeeDocs.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No employee documents yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Employee</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Document</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Doc date</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Expiry</th>
                  <th style={{ textAlign: "left", padding: "0.5rem", color: "#6b7280" }}>Uploaded</th>
                  <th style={{ width: "4rem" }} />
                </tr>
              </thead>
              <tbody>
                {employeeDocs.map((d) => (
                  <tr key={d._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.5rem" }}>{d.employeeName}</td>
                    <td style={{ padding: "0.5rem" }}>{d.documentType}</td>
                    <td style={{ padding: "0.5rem" }}>
                      {d.fileUrl ? (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#059669", textDecoration: "none" }}
                        >
                          {d.name}
                        </a>
                      ) : (
                        <span>{d.name}</span>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem", color: "#6b7280" }}>{formatDate(d.documentDate)}</td>
                    <td style={{ padding: "0.5rem", color: "#6b7280" }}>{formatDate(d.expiryDate)}</td>
                    <td style={{ padding: "0.5rem", color: "#6b7280" }}>{formatDate(d.uploadedAt)}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => setPendingRemoveDocId(d._id)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          fontSize: "0.75rem",
                          borderRadius: "0.375rem",
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

      <ConfirmDialog
        open={pendingRemoveDocId !== null}
        message="This will permanently remove this employee document."
        onCancel={() => setPendingRemoveDocId(null)}
        onConfirm={async () => {
          if (!pendingRemoveDocId) return;
          const documentId = pendingRemoveDocId;
          setPendingRemoveDocId(null);
          await removeEmployeeDoc({ documentId });
        }}
      />
    </div>
  );
}

