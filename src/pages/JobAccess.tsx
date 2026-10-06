import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { cardStyle, shellCardStyle, innerWhiteCardStyle } from "../theme";

type ProjectRow = {
  _id: Id<"projects">;
  name: string;
  pmId?: Id<"users">;
  coordinatorId?: Id<"users">;
  principalId?: Id<"users">;
  siteSuperId?: Id<"users">;
  accountsPayableId?: Id<"users">;
  safetyMemberId?: Id<"users">;
  siteSupers?: string[];
};

export function JobAccess() {
  const user = useQuery(api.users.current);
  const isAdmin = user?.role === "admin";
  const users = useQuery(api.users.listUsers, isAdmin ? {} : "skip");
  const projects = useQuery(api.projects.listProjects, isAdmin ? {} : "skip") as ProjectRow[] | undefined;
  const updateProject = useMutation(api.projects.updateProject);
  const [error, setError] = useState<string | null>(null);

  if (user === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>Job access <LogoMark /></h1>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>You need admin access to view this page.</p>
          <Link to="/dashboard" style={{ color: "#059669", fontSize: "0.875rem", marginTop: "0.5rem", display: "inline-block" }}>Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  async function setProjectPm(projectId: Id<"projects">, pmId: Id<"users"> | "" | null) {
    setError(null);
    try {
      await updateProject({ projectId, pmId: pmId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    }
  }

  async function setProjectCoordinator(projectId: Id<"projects">, coordinatorId: Id<"users"> | "" | null) {
    setError(null);
    try {
      await updateProject({ projectId, coordinatorId: coordinatorId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    }
  }

  async function setProjectSiteSuper(projectId: Id<"projects">, siteSuperId: Id<"users"> | "" | null) {
    setError(null);
    try {
      await updateProject({ projectId, siteSuperId: siteSuperId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    }
  }
  async function setProjectPrincipal(projectId: Id<"projects">, principalId: Id<"users"> | "" | null) {
    setError(null);
    try {
      await updateProject({ projectId, principalId: principalId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    }
  }

  async function setProjectAccountsPayable(projectId: Id<"projects">, accountsPayableId: Id<"users"> | "" | null) {
    setError(null);
    try {
      await updateProject({ projectId, accountsPayableId: accountsPayableId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    }
  }

  async function setProjectSafetyMember(projectId: Id<"projects">, safetyMemberId: Id<"users"> | "" | null) {
    setError(null);
    try {
      await updateProject({ projectId, safetyMemberId: safetyMemberId || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    }
  }

  const selectStyle = {
    width: "100%" as const,
    minWidth: "10rem",
  };

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>Job access <LogoMark /></h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Assign Project Manager, Coordinator, Principal, Site Superintendent, Accounts payable, and Safety for each project (job).
      </p>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "0.5rem" }}>Project assignments</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "1rem", marginTop: 0 }}>
          Set PM, Coordinator, Principal, Site Superintendent, Accounts payable, and Safety per project.
        </p>
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
        {error && (
          <div style={{ padding: "0.5rem 0.75rem", marginBottom: "1rem", borderRadius: "0.375rem", backgroundColor: "#fef2f2", color: "#dc2626", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        {projects === undefined || users === undefined ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</p>
        ) : projects.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No projects found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Project</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>PM</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Coordinator</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Principal</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Site superintendent</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Accounts payable</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Safety</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.75rem", color: "var(--text-primary)" }}>{p.name}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={p.pmId ?? ""}
                        onChange={(e) => setProjectPm(p._id, e.target.value ? (e.target.value as Id<"users">) : null)}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        {users.map((u) => (
                          <option key={u._id} value={u._id}>{u.name ?? u.email ?? "-"}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={p.coordinatorId ?? ""}
                        onChange={(e) => setProjectCoordinator(p._id, e.target.value ? (e.target.value as Id<"users">) : null)}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        {users.map((u) => (
                          <option key={u._id} value={u._id}>{u.name ?? u.email ?? "-"}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={p.principalId ?? ""}
                        onChange={(e) => setProjectPrincipal(p._id, e.target.value ? (e.target.value as Id<"users">) : null)}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        {users.map((u) => (
                          <option key={u._id} value={u._id}>{u.name ?? u.email ?? "-"}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={p.siteSuperId ?? ""}
                        onChange={(e) => setProjectSiteSuper(p._id, e.target.value ? (e.target.value as Id<"users">) : null)}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        {users.map((u) => (
                          <option key={u._id} value={u._id}>{u.name ?? u.email ?? "-"}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={p.accountsPayableId ?? ""}
                        onChange={(e) => setProjectAccountsPayable(p._id, e.target.value ? (e.target.value as Id<"users">) : null)}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        {users.filter((u) => u.role === "accounting").map((u) => (
                          <option key={u._id} value={u._id}>{u.name ?? u.email ?? "-"}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={p.safetyMemberId ?? ""}
                        onChange={(e) => setProjectSafetyMember(p._id, e.target.value ? (e.target.value as Id<"users">) : null)}
                        style={selectStyle}
                      >
                        <option value="">-</option>
                        {users.filter((u) => u.role === "safety").map((u) => (
                          <option key={u._id} value={u._id}>{u.name ?? u.email ?? "-"}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link to="/admin" style={{ fontSize: "0.875rem", color: "#059669", fontWeight: 500, textDecoration: "none" }}>{"<-"} Back to Admin</Link>
      </p>
    </div>
  );
}
