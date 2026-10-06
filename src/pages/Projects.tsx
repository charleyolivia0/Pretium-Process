import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { cardStyle, shellCardStyle, innerWhiteCardStyle } from "../theme";
import { getProjectStatusStyle } from "../utils/projectStatusStyle";

const PROJECT_STATUSES = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "substantial_completion", label: "Substantial completion" },
  { value: "closed", label: "Closed" },
] as const;

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

function healthDot(health?: string) {
  if (!health) return null;
  const colors: Record<string, string> = {
    green: "#059669",
    amber: "#d97706",
    red: "#dc2626",
  };
  return (
    <span
      style={{
        width: "0.5rem",
        height: "0.5rem",
        borderRadius: "999px",
        display: "inline-block",
        backgroundColor: colors[health] ?? "#9ca3af",
      }}
    />
  );
}

export function Projects() {
  const navigate = useNavigate();
  const user = useQuery(api.users.current);
  const projects = useQuery(api.projects.listProjects, {});
  const usersForAssignment = useQuery(api.users.listUsersForAssignment);
  const createProjectMutation = useMutation(api.projects.createProject);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const isSiteSuper = user?.role === "site_superintendent";
  const dashboardProjects = useQuery(api.projects.getDashboardProjects, {});
  const addFavourite = useMutation(api.users.addFavourite);
  const removeFavourite = useMutation(api.users.removeFavourite);

  function isFavourite(projectId: Id<"projects">): boolean {
    return Boolean(dashboardProjects?.find((r) => r.project._id === projectId)?.isFavourite);
  }

  function toggleFavourite(e: React.MouseEvent, projectId: Id<"projects">) {
    e.preventDefault();
    e.stopPropagation();
    if (isFavourite(projectId)) {
      removeFavourite({ projectId });
    } else {
      addFavourite({ projectId });
    }
  }

  const [showCreate, setShowCreate] = useState(false);
  const [jobName, setJobName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [pmId, setPmId] = useState<Id<"users"> | "">("");
  const [coordinatorId, setCoordinatorId] = useState<Id<"users"> | "">("");
  const [principalId, setPrincipalId] = useState<Id<"users"> | "">("");
  const [siteSuperId, setSiteSuperId] = useState<Id<"users"> | "">("");
  const [siteSupersStr, setSiteSupersStr] = useState("");
  const [budgetDocumentUrl, setBudgetDocumentUrl] = useState("");
  const [safetyDocumentUrl, setSafetyDocumentUrl] = useState("");
  const [budgetDocumentStorageId, setBudgetDocumentStorageId] = useState<Id<"_storage"> | null>(null);
  const [safetyDocumentStorageId, setSafetyDocumentStorageId] = useState<Id<"_storage"> | null>(null);
  const [budgetUploading, setBudgetUploading] = useState(false);
  const [safetyUploading, setSafetyUploading] = useState(false);
  const [status, setStatus] = useState<"planning" | "active" | "substantial_completion" | "closed">("planning");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectsToShow = useMemo(
    () => (projects ?? []).filter((p) => p.inCloseOut !== true && p.inProjectTracker !== false),
    [projects]
  );

  const userNameById = useMemo(() => {
    const map = new Map<Id<"users">, string>();
    (usersForAssignment ?? []).forEach((u) => {
      map.set(u._id, u.name);
    });
    return map;
  }, [usersForAssignment]);

  async function handleFileUpload(
    file: File,
    setStorageId: (id: Id<"_storage"> | null) => void,
    onDone: () => void
  ) {
    try {
      setError(null);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json();
      setStorageId(storageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      onDone();
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jobName.trim() || !clientName.trim()) {
      setError("Job name and client name are required.");
      return;
    }
    setCreating(true);
    try {
      const siteSupers = siteSupersStr
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const projectId = await createProjectMutation({
        name: jobName.trim(),
        clientName: clientName.trim(),
        inProjectTracker: true,
        startupSummaryComplete: true,
        location: location.trim() || undefined,
        status,
        pmId: pmId || undefined,
        coordinatorId: coordinatorId || undefined,
        principalId: principalId || undefined,
        siteSuperId: siteSuperId || undefined,
        siteSupers: siteSupers.length ? siteSupers : undefined,
        // Budget document is optional and upload-only; no link required.
        safetyDocumentUrl: safetyDocumentUrl.trim() || undefined,
        budgetDocumentStorageId: budgetDocumentStorageId || undefined,
        safetyDocumentStorageId: safetyDocumentStorageId || undefined,
      });
      setShowCreate(false);
      setJobName("");
      setClientName("");
      setLocation("");
      setPmId("");
      setCoordinatorId("");
      setPrincipalId("");
      setSiteSupersStr("");
      setBudgetDocumentUrl("");
      setSafetyDocumentUrl("");
      setBudgetDocumentStorageId(null);
      setSafetyDocumentStorageId(null);
      setStatus("planning");
      navigate(`/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 className="page-title">
            Project Tracker <LogoMark />
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
            Select a project to view details, tasks, documents, and schedule.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
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
          {showCreate ? "Cancel" : "Create project"}
        </button>
      </div>

      {showCreate && (
        <div style={{ ...shellCardStyle, marginBottom: "1.5rem", maxWidth: "28rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
            New project
          </h2>
          <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
          <form onSubmit={handleCreateProject}>
            {error && (
              <div style={{ padding: "0.5rem 0.75rem", marginBottom: "1rem", borderRadius: "0.5rem", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: "0.875rem" }}>
                {error}
              </div>
            )}
            <label style={labelStyle} htmlFor="create-job-name">Job name</label>
            <input id="create-job-name" type="text" value={jobName} onChange={(e) => setJobName(e.target.value)} required style={inputStyle} placeholder="e.g. Main St Phase 2" />
            <label style={labelStyle} htmlFor="create-client">Client name</label>
            <input id="create-client" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} required style={inputStyle} placeholder="e.g. Acme Corp" />
            <label style={labelStyle} htmlFor="create-location">Location (optional)</label>
            <input id="create-location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="e.g. Downtown" />
            <label style={labelStyle} htmlFor="create-pm">Project manager</label>
            <select id="create-pm" value={pmId} onChange={(e) => setPmId(e.target.value as Id<"users"> | "")} style={inputStyle}>
              <option value="">- Select -</option>
              {(usersForAssignment ?? []).filter((u) => u.role === "project_manager" || u.role === "admin" || u.role === "principal").map((u) => (
                <option key={u._id} value={u._id}>{u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}</option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="create-coord">Coordinator</label>
            <select id="create-coord" value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value as Id<"users"> | "")} style={inputStyle}>
              <option value="">- Select -</option>
              {(usersForAssignment ?? []).filter((u) => u.role === "coordinator" || u.role === "admin").map((u) => (
                <option key={u._id} value={u._id}>{u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}</option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="create-principal">Principal</label>
            <select id="create-principal" value={principalId} onChange={(e) => setPrincipalId(e.target.value as Id<"users"> | "")} style={inputStyle}>
              <option value="">- Select -</option>
              {(usersForAssignment ?? []).map((u) => (
                <option key={u._id} value={u._id}>{u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}</option>
              ))}
            </select>
            <label style={labelStyle} htmlFor="create-site-super">Site superintendent</label>
            <select id="create-site-super" value={siteSuperId} onChange={(e) => setSiteSuperId(e.target.value as Id<"users"> | "")} style={inputStyle}>
              <option value="">- Select -</option>
              {(usersForAssignment ?? []).filter((u) => u.role === "site_superintendent" || u.role === "admin").map((u) => (
                <option key={u._id} value={u._id}>{u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}</option>
              ))}
            </select>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>Budget document (optional)</label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8125rem",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                <input
                  type="file"
                  disabled={budgetUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBudgetUploading(true);
                    setBudgetDocumentUrl("");
                    await handleFileUpload(file, setBudgetDocumentStorageId, () => setBudgetUploading(false));
                    e.target.value = "";
                  }}
                />
                {budgetUploading
                  ? "Uploading budget document..."
                  : budgetDocumentStorageId
                    ? "✓ Budget file ready"
                    : "Upload from computer"}
              </label>
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle} htmlFor="create-safety-url">Safety document</label>
              <input
                id="create-safety-url"
                type="url"
                value={safetyDocumentUrl}
                onChange={(e) => {
                  setSafetyDocumentUrl(e.target.value);
                  setSafetyDocumentStorageId(null);
                }}
                style={inputStyle}
                placeholder="Paste link (optional)"
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8125rem",
                  color: "#374151",
                  cursor: "pointer",
                }}
              >
                <input
                  type="file"
                  disabled={safetyUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setSafetyUploading(true);
                    setSafetyDocumentUrl("");
                    await handleFileUpload(file, setSafetyDocumentStorageId, () => setSafetyUploading(false));
                    e.target.value = "";
                  }}
                />
                {safetyUploading
                  ? "Uploading safety document..."
                  : safetyDocumentStorageId
                    ? "✓ Safety file ready"
                    : "Or upload from computer"}
              </label>
            </div>
            <label style={labelStyle} htmlFor="create-status">Status</label>
            <select id="create-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={inputStyle}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button type="submit" disabled={creating} style={{ padding: "0.5rem 1rem", borderRadius: "0.5rem", fontWeight: 600, backgroundColor: "#059669", color: "#fff", border: "none", cursor: creating ? "not-allowed" : "pointer", fontFamily: "Montserrat, sans-serif", opacity: creating ? 0.7 : 1 }}>
              {creating ? "Creating..." : "Create project"}
            </button>
          </form>
          </div>
        </div>
      )}

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
          Projects
        </h2>
      {projects === undefined ? (
        <p style={{ color: "#d1fae5" }}>Loading...</p>
      ) : projects.length === 0 ? (
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
          <p style={{ color: "#6b7280", margin: 0 }}>No projects yet.</p>
        </div>
      ) : (
        <div
          style={{
            marginTop: "0.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
            gap: "1rem",
          }}
        >
          {projectsToShow.map((p) => {
            const fav = isFavourite(p._id);
            const siteSuperFromId = p.siteSuperId ? (userNameById.get(p.siteSuperId) ?? "-") : null;
            const siteSuperLegacy = p.siteSupers?.filter(Boolean).join(", ");
            const siteSuperDisplay = siteSuperFromId || siteSuperLegacy || "-";
            return (
              <Link
                key={p._id}
                to={`/projects/${p._id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  className="card-hover"
                  style={{
                    ...innerWhiteCardStyle,
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: "0.25rem",
                        flex: 1,
                      }}
                    >
                      {p.name}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => toggleFavourite(e, p._id)}
                      aria-label={fav ? "Remove from My job" : "Set as My job"}
                      title={fav ? "Remove from My job" : "Set as My job (show on Dashboard)"}
                      style={{
                        padding: "0.35rem 0.5rem",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        flexShrink: 0,
                        fontFamily: "inherit",
                        fontSize: "1.25rem",
                        lineHeight: 1,
                        letterSpacing: "-0.05em",
                        color: fav ? "#059669" : "#9ca3af",
                      }}
                    >
                      ❯❯❯❯
                    </button>
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                    {p.clientName}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                    {p.location || "Location not set"}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>PM: </span>
                    <span style={{ fontWeight: 500 }}>{p.pmId ? userNameById.get(p.pmId) ?? "-" : "-"}</span>
                    {p.coordinatorId && (
                      <>
                        <span style={{ marginLeft: "0.5rem", color: "#6b7280" }}>PC: </span>
                        <span style={{ fontWeight: 500 }}>{userNameById.get(p.coordinatorId) ?? "-"}</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Site supers: </span>
                    <span style={{ fontWeight: 500 }}>{siteSuperDisplay}</span>
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>Principal: </span>
                    <span style={{ fontWeight: 500 }}>{p.principalId ? userNameById.get(p.principalId) ?? "-" : "-"}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "0.375rem",
                        ...getProjectStatusStyle(p.status),
                      }}
                    >
                      {p.status.replace(/_/g, " ")}
                    </span>
                    {healthDot(p.healthStatus)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
