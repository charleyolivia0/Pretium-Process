import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

const cardStyle = {
  padding: "1.25rem",
  borderRadius: "0.75rem",
  backgroundColor: "#ffffff",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)",
};

const ROLES = [
  { value: "project_manager", label: "Project Manager" },
  { value: "coordinator", label: "Coordinator" },
  { value: "accounting", label: "Accounting" },
  { value: "estimating", label: "Estimating" },
  { value: "safety", label: "Safety" },
  { value: "admin", label: "Admin" },
] as const;

function formatDate(ts?: number) {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString();
}

export function Admin() {
  const user = useQuery(api.users.current);
  const users = useQuery(
    api.users.listUsers,
    user?.role === "admin" ? {} : "skip"
  );
  const updateUserRole = useMutation(api.users.updateUserRole);
  const setUserActive = useMutation(api.users.setUserActive);

  if (user === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22", marginBottom: "0.5rem" }}>
          Admin
        </h1>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>
            You need admin access to view and manage users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#022c22", marginBottom: "0.5rem" }}>
        Admin
      </h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Manage team members and roles.
      </p>

      <div style={cardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
          Users
        </h2>
        {users === undefined ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading…</p>
        ) : users.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No users found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "#6b7280", fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "#6b7280", fontWeight: 600 }}>Email</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "#6b7280", fontWeight: 600 }}>Role</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "#6b7280", fontWeight: 600 }}>Last login</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "#6b7280", fontWeight: 600 }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "0.75rem", color: "#111827" }}>{u.name ?? "—"}</td>
                    <td style={{ padding: "0.75rem", color: "#4b5563" }}>{u.email ?? "—"}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <select
                        value={u.role ?? ""}
                        onChange={(e) =>
                          updateUserRole({
                            userId: u._id,
                            role: e.target.value as (typeof ROLES)[number]["value"],
                          })
                        }
                        style={{
                          padding: "0.35rem 0.5rem",
                          borderRadius: "0.375rem",
                          border: "1px solid #e5e7eb",
                          fontFamily: "Montserrat, sans-serif",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.75rem", color: "#6b7280" }}>{formatDate(u.lastLoginAt)}</td>
                    <td style={{ padding: "0.75rem" }}>
                      <button
                        type="button"
                        onClick={() => setUserActive({ userId: u._id, isActive: !u.isActive })}
                        style={{
                          padding: "0.35rem 0.6rem",
                          borderRadius: "0.375rem",
                          fontSize: "0.8125rem",
                          fontWeight: 500,
                          backgroundColor: u.isActive ? "#ecfdf5" : "#fef2f2",
                          color: u.isActive ? "#059669" : "#dc2626",
                          border: "1px solid",
                          borderColor: u.isActive ? "#a7f3d0" : "#fecaca",
                          cursor: "pointer",
                          fontFamily: "Montserrat, sans-serif",
                        }}
                      >
                        {u.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
