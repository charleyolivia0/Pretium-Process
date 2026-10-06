import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { cardStyle, cardWithAccentStyle, primaryButtonStyle, secondaryButtonStyle } from "../theme";
import { getProjectStatusStyle } from "../utils/projectStatusStyle";

const inputStyle = {
  width: "100%" as const,
  marginBottom: "0.75rem",
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "0.25rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const sectionHeadingStyle = {
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--text-primary)",
  margin: "0.5rem 0 0.75rem 0",
  paddingTop: "0.25rem",
  borderTop: "1px solid var(--border-subtle)",
};

function parseBudgetAmount(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/[$,]/g, "");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function resetCreateForm(setters: {
  setJobName: (v: string) => void;
  setClientName: (v: string) => void;
  setLocation: (v: string) => void;
  setPmId: (v: Id<"users"> | "") => void;
  setCoordinatorId: (v: Id<"users"> | "") => void;
  setSiteSuperId: (v: Id<"users"> | "") => void;
  setPrincipalId: (v: Id<"users"> | "") => void;
  setAccountsPayableId: (v: Id<"users"> | "") => void;
  setSafetyMemberId: (v: Id<"users"> | "") => void;
  setBudgetAmount: (v: string) => void;
  setBudgetDocumentStorageId: (v: Id<"_storage"> | null) => void;
}) {
  setters.setJobName("");
  setters.setClientName("");
  setters.setLocation("");
  setters.setPmId("");
  setters.setCoordinatorId("");
  setters.setSiteSuperId("");
  setters.setPrincipalId("");
  setters.setAccountsPayableId("");
  setters.setSafetyMemberId("");
  setters.setBudgetAmount("");
  setters.setBudgetDocumentStorageId(null);
}

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

export function ProjectStartUp() {
  const navigate = useNavigate();
  const createProjectMutation = useMutation(api.projects.createProject);
  const promoteToTracker = useMutation(api.projects.promoteProjectToTracker);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const startupQueue = useQuery(api.projects.listStartupQueueProjects);
  const usersForAssignment = useQuery(api.users.listUsersForAssignment);

  const [showCreate, setShowCreate] = useState(false);
  const [jobName, setJobName] = useState("");
  const [clientName, setClientName] = useState("");
  const [location, setLocation] = useState("");
  const [pmId, setPmId] = useState<Id<"users"> | "">("");
  const [coordinatorId, setCoordinatorId] = useState<Id<"users"> | "">("");
  const [siteSuperId, setSiteSuperId] = useState<Id<"users"> | "">("");
  const [principalId, setPrincipalId] = useState<Id<"users"> | "">("");
  const [accountsPayableId, setAccountsPayableId] = useState<Id<"users"> | "">("");
  const [safetyMemberId, setSafetyMemberId] = useState<Id<"users"> | "">("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetDocumentStorageId, setBudgetDocumentStorageId] = useState<Id<"_storage"> | null>(null);
  const [budgetUploading, setBudgetUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<Id<"projects"> | null>(null);

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
      setError("Project name and client name are required.");
      return;
    }
    if (!location.trim()) {
      setError("Location is required.");
      return;
    }
    if (!pmId || !coordinatorId || !siteSuperId || !principalId || !accountsPayableId || !safetyMemberId) {
      setError("All team roles are required: PM, PC, Site Super, Principal, Accounts payable, and Safety.");
      return;
    }
    if (budgetAmount.trim()) {
      const parsed = parseBudgetAmount(budgetAmount);
      if (parsed === undefined) {
        setError("Budget amount must be a valid number.");
        return;
      }
    }
    if (budgetUploading) {
      setError("Please wait for the budget file upload to finish.");
      return;
    }

    const startupSummaryComplete =
      location.trim().length > 0 &&
      !!pmId &&
      !!coordinatorId &&
      !!siteSuperId &&
      !!principalId &&
      !!accountsPayableId &&
      !!safetyMemberId;

    setCreating(true);
    try {
      const projectId = await createProjectMutation({
        name: jobName.trim(),
        clientName: clientName.trim(),
        location: location.trim(),
        pmId: pmId || undefined,
        coordinatorId: coordinatorId || undefined,
        siteSuperId: siteSuperId || undefined,
        principalId: principalId || undefined,
        accountsPayableId: accountsPayableId || undefined,
        safetyMemberId: safetyMemberId || undefined,
        budget: parseBudgetAmount(budgetAmount),
        budgetDocumentStorageId: budgetDocumentStorageId || undefined,
        status: "planning",
        inProjectTracker: false,
        startupSummaryComplete,
      });
      resetCreateForm({
        setJobName,
        setClientName,
        setLocation,
        setPmId,
        setCoordinatorId,
        setSiteSuperId,
        setPrincipalId,
        setAccountsPayableId,
        setSafetyMemberId,
        setBudgetAmount,
        setBudgetDocumentStorageId,
      });
      navigate(`/project-start-up/summary/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  async function handlePromote(projectId: Id<"projects">) {
    setError(null);
    setPromotingId(projectId);
    try {
      await promoteToTracker({ projectId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote project");
    } finally {
      setPromotingId(null);
    }
  }

  const users = usersForAssignment ?? [];

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 className="page-title">
            Project Start Up <LogoMark />
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
            Start a new project, then complete the startup summary details. New startup projects stay in this
            queue until you send them to Project Tracker.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          style={showCreate ? secondaryButtonStyle : primaryButtonStyle}
        >
          {showCreate ? "Cancel" : "Create project"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            marginBottom: "1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#fef2f2",
            color: "#b91c1c",
            fontSize: "0.875rem",
            maxWidth: "42rem",
          }}
        >
          {error}
        </div>
      )}

      {showCreate && (
        <div style={{ ...cardWithAccentStyle, marginBottom: "1.5rem", maxWidth: "36rem" }}>
          <h2 className="section-header" style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 1rem 0" }}>
            New project
          </h2>
            <form onSubmit={handleCreateProject}>
              <label style={labelStyle} htmlFor="startup-project-name">
                Project name
              </label>
              <input
                id="startup-project-name"
                type="text"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                required
                style={inputStyle}
                placeholder="e.g. Main St Phase 2"
              />

              <label style={labelStyle} htmlFor="startup-client">
                Client name
              </label>
              <input
                id="startup-client"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                style={inputStyle}
                placeholder="e.g. Acme Corp"
              />

              <label style={labelStyle} htmlFor="startup-location">
                Location
              </label>
              <input
                id="startup-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                style={inputStyle}
                placeholder="e.g. Downtown"
              />

              <h3 style={sectionHeadingStyle}>Team</h3>

              <label style={labelStyle} htmlFor="startup-pm">
                PM
              </label>
              <select
                id="startup-pm"
                value={pmId}
                onChange={(e) => setPmId(e.target.value as Id<"users"> | "")}
                required
                style={inputStyle}
              >
                <option value="">- Select -</option>
                {users.filter((u) => u.role === "project_manager" || u.role === "admin" || u.role === "principal").map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="startup-pc">
                PC
              </label>
              <select
                id="startup-pc"
                value={coordinatorId}
                onChange={(e) => setCoordinatorId(e.target.value as Id<"users"> | "")}
                required
                style={inputStyle}
              >
                <option value="">- Select -</option>
                {users.filter((u) => u.role === "coordinator" || u.role === "admin").map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="startup-site-super">
                Site Super
              </label>
              <select
                id="startup-site-super"
                value={siteSuperId}
                onChange={(e) => setSiteSuperId(e.target.value as Id<"users"> | "")}
                required
                style={inputStyle}
              >
                <option value="">- Select -</option>
                {users.filter((u) => u.role === "site_superintendent").map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="startup-principal">
                Principal
              </label>
              <select
                id="startup-principal"
                value={principalId}
                onChange={(e) => setPrincipalId(e.target.value as Id<"users"> | "")}
                required
                style={inputStyle}
              >
                <option value="">- Select -</option>
                {users.filter((u) => u.role === "admin").map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="startup-accounts-payable">
                Accounts payable
              </label>
              <select
                id="startup-accounts-payable"
                value={accountsPayableId}
                onChange={(e) => setAccountsPayableId(e.target.value as Id<"users"> | "")}
                required
                style={inputStyle}
              >
                <option value="">- Select -</option>
                {users.filter((u) => u.role === "accounting").map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>

              <label style={labelStyle} htmlFor="startup-safety">
                Safety
              </label>
              <select
                id="startup-safety"
                value={safetyMemberId}
                onChange={(e) => setSafetyMemberId(e.target.value as Id<"users"> | "")}
                required
                style={inputStyle}
              >
                <option value="">- Select -</option>
                {users.filter((u) => u.role === "safety").map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} {u.role ? `(${u.role.replace(/_/g, " ")})` : ""}
                  </option>
                ))}
              </select>

              <h3 style={sectionHeadingStyle}>Budget</h3>

              <label style={labelStyle} htmlFor="startup-budget-amount">
                Budget amount (optional)
              </label>
              <input
                id="startup-budget-amount"
                type="text"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                style={inputStyle}
                placeholder="e.g. 500000"
              />

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={labelStyle}>Budget document (optional)</label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    cursor: budgetUploading ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="file"
                    disabled={budgetUploading || creating}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBudgetUploading(true);
                      setBudgetDocumentStorageId(null);
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

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="submit"
                  disabled={creating || budgetUploading}
                  style={{
                    ...primaryButtonStyle,
                    cursor: creating || budgetUploading ? "not-allowed" : "pointer",
                    opacity: creating || budgetUploading ? 0.7 : 1,
                  }}
                >
                  {creating ? "Creating..." : "Create project"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setError(null);
                  }}
                  disabled={creating || budgetUploading}
                  style={{
                    ...secondaryButtonStyle,
                    cursor: creating || budgetUploading ? "not-allowed" : "pointer",
                    opacity: creating || budgetUploading ? 0.7 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
        </div>
      )}

      <div style={cardWithAccentStyle}>
        <h2 className="section-header" style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 1rem 0" }}>
          Startup queue
        </h2>
        {startupQueue === undefined || usersForAssignment === undefined ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
        ) : startupQueue.length === 0 ? (
          <div style={{ ...cardStyle, marginTop: "0.5rem" }}>
            <p style={{ color: "#6b7280", margin: 0 }}>
              No startup projects yet. Create a project to add it here.
            </p>
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
            {startupQueue.map((p) => {
              const siteSuperFromId = p.siteSuperId ? (userNameById.get(p.siteSuperId) ?? "-") : null;
              const siteSuperLegacy = p.siteSupers?.filter(Boolean).join(", ");
              const siteSuperDisplay = siteSuperFromId || siteSuperLegacy || "-";
              return (
                <div
                  key={p._id}
                  className="card-hover"
                  style={{
                    ...cardStyle,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Link
                    to={`/project-start-up/summary/${p._id}`}
                    style={{ textDecoration: "none", color: "inherit", flex: 1 }}
                  >
                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {p.name}
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
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.375rem",
                          backgroundColor: p.startupSummaryComplete ? "#dcfce7" : "#fef3c7",
                          color: p.startupSummaryComplete ? "#166534" : "#92400e",
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      >
                        {p.startupSummaryComplete ? "Summary complete" : "Summary in progress"}
                      </span>
                      {healthDot(p.healthStatus)}
                    </div>
                  </Link>
                  <button
                    type="button"
                    disabled={promotingId === p._id || !p.startupSummaryComplete}
                    onClick={() => handlePromote(p._id)}
                    style={{
                      ...primaryButtonStyle,
                      marginTop: "0.75rem",
                      fontSize: "0.8125rem",
                      padding: "0.45rem 0.75rem",
                      cursor: promotingId === p._id || !p.startupSummaryComplete ? "not-allowed" : "pointer",
                      opacity: promotingId === p._id || !p.startupSummaryComplete ? 0.7 : 1,
                    }}
                  >
                    {promotingId === p._id
                      ? "Sending..."
                      : p.startupSummaryComplete
                        ? "Send to Project Tracker"
                        : "Complete summary to send"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
