import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import { cardStyle, shellCardStyle, innerWhiteCardStyle } from "../theme";

const PATH_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  close_out: "Close Out",
  todo: "To-Do List",
  safety: "Safety",
  inventory: "Inventory",
  boardroom: "Boardroom",
  accounting: "Accounting",
  email: "Email (inbox)",
  admin: "Admin",
  admin_users: "Users",
  admin_access: "Access",
  admin_job_access: "Job access",
  project_start_up: "Start up",
  drawings: "Drawings",
  weekly: "Weekly updates",
  personal_calendar: "Personal calendar",
  assistant: "Chuck",
  account: "Account",
};

export function Access() {
  const user = useQuery(api.users.current);
  const isAdmin = user?.role === "admin";
  const roleAccessRows = useQuery(api.roleAccess.getRoleAccess, isAdmin ? {} : "skip");
  const users = useQuery(api.users.listUsers, isAdmin ? {} : "skip");
  const grants = useQuery(api.roleAccess.getGrants, isAdmin ? {} : "skip");
  const setUserAccess = useMutation(api.roleAccess.setUserAccess);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const pathIds = roleAccessRows ? roleAccessRows.map((r) => r.pathId) : [];

  const pathToUserIds = useMemo(() => {
    const map = new Map<string, Set<Id<"users">>>();
    if (!grants) return map;
    for (const { pathId, userId } of grants) {
      if (!map.has(pathId)) map.set(pathId, new Set());
      map.get(pathId)!.add(userId);
    }
    return map;
  }, [grants]);

  async function toggleAccess(pathId: string, userId: Id<"users">, checked: boolean) {
    setError(null);
    const current = pathToUserIds.get(pathId) ?? new Set<Id<"users">>();
    const next = new Set(current);
    if (checked) next.add(userId);
    else next.delete(userId);
    setUpdating(`${pathId}:${userId}`);
    try {
      await setUserAccess({ pathId, userIds: Array.from(next) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setUpdating(null);
    }
  }

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
        <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>Access <LogoMark /></h1>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>You need admin access to view this page.</p>
          <Link to="/dashboard" style={{ color: "#059669", fontSize: "0.875rem", marginTop: "0.5rem", display: "inline-block" }}>Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>Access <LogoMark /></h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Choose which people can see each section. Check a box to grant that user access; uncheck to remove. If a user has no boxes checked for a section, they fall back to their role&apos;s default access until you assign them here.
      </p>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "0.5rem" }}>User access (sidebar &amp; pages)</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "1rem", marginTop: 0 }}>
          Rows are users; columns are sections. Changes apply immediately.
        </p>
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
        {error && (
          <div style={{ padding: "0.5rem 0.75rem", marginBottom: "1rem", borderRadius: "0.375rem", backgroundColor: "#fef2f2", color: "#dc2626", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        {users === undefined || grants === undefined ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No users found. Create users on the Users page first.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>User</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Role</th>
                  {pathIds.map((pathId) => (
                    <th key={pathId} style={{ textAlign: "center", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {PATH_LABELS[pathId] ?? pathId}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.75rem", color: "var(--text-primary)", fontWeight: 500 }}>{u.name ?? u.email ?? "-"}</td>
                    <td style={{ padding: "0.75rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{u.role?.replace(/_/g, " ") ?? "-"}</td>
                    {pathIds.map((pathId) => {
                      const userIds = pathToUserIds.get(pathId) ?? new Set();
                      const checked = userIds.has(u._id);
                      const key = `${pathId}:${u._id}`;
                      return (
                        <td key={key} style={{ textAlign: "center", padding: "0.5rem 0.75rem" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={updating === key}
                            onChange={(e) => toggleAccess(pathId, u._id, e.target.checked)}
                            aria-label={`${u.name ?? u.email} can access ${PATH_LABELS[pathId] ?? pathId}`}
                            style={{ width: "1.1rem", height: "1.1rem", cursor: updating === key ? "wait" : "pointer" }}
                          />
                        </td>
                      );
                    })}
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
