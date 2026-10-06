import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LogoMark } from "../components/LogoMark";
import { cardStyle, shellCardStyle, innerWhiteCardStyle } from "../theme";

const ROLES = [
  { value: "project_manager", label: "Project Manager" },
  { value: "coordinator", label: "Coordinator" },
  { value: "accounting", label: "Accounting" },
  { value: "safety", label: "Safety" },
  { value: "admin", label: "Admin" },
  { value: "principal", label: "Principal" },
  { value: "site_superintendent", label: "Site Superintendent" },
] as const;

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

export function Users() {
  const user = useQuery(api.users.current);
  const isAdmin = user?.role === "admin";
  const users = useQuery(api.users.listUsers, isAdmin ? {} : "skip");
  const updateUserRole = useMutation(api.users.updateUserRole);
  const setUserActive = useMutation(api.users.setUserActive);
  const deleteUser = useMutation(api.users.deleteUser);
  const createUserAction = useAction(api.users.createUser);
  const setTemporaryPasswordAction = useAction(api.users.setTemporaryPassword);
  const [error, setError] = useState<string | null>(null);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<(typeof ROLES)[number]["value"]>("project_manager");
  const [createLoading, setCreateLoading] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createSuccessPassword, setCreateSuccessPassword] = useState("");
  const [createSuccessReveal, setCreateSuccessReveal] = useState(false);
  const [tempPasswordUserId, setTempPasswordUserId] = useState<Id<"users"> | null>(null);
  const [tempPasswordInput, setTempPasswordInput] = useState("");
  const [tempPasswordLoading, setTempPasswordLoading] = useState(false);
  const [tempPasswordRevealFor, setTempPasswordRevealFor] = useState<Id<"users"> | null>(null);
  const [tempPasswordRevealValue, setTempPasswordRevealValue] = useState("");
  const [tempPasswordRevealVisible, setTempPasswordRevealVisible] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<{ id: Id<"users">; label: string } | null>(null);
  const adminCount = users?.filter((u) => u.role === "admin").length ?? 0;

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
        <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>Users <LogoMark /></h1>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>You need admin access to view this page.</p>
          <Link to="/dashboard" style={{ color: "#059669", fontSize: "0.875rem", marginTop: "0.5rem", display: "inline-block" }}>Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  async function handleRoleChange(userId: Id<"users">, role: (typeof ROLES)[number]["value"]) {
    setError(null);
    try {
      await updateUserRole({ userId, role });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreateSuccess(false);
    setCreateSuccessPassword("");
    setCreateLoading(true);
    try {
      await createUserAction({
        email: createEmail.trim(),
        password: createPassword,
        name: createName.trim(),
        role: createRole,
      });
      setCreateSuccessPassword(createPassword);
      setCreateSuccessReveal(false);
      setCreateEmail("");
      setCreatePassword("");
      setCreateName("");
      setCreateRole("project_manager");
      setCreateSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleSetTempPassword(userId: Id<"users">) {
    if (!tempPasswordInput.trim() || tempPasswordInput.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setError(null);
    setTempPasswordLoading(true);
    try {
      await setTemporaryPasswordAction({ userId, newPassword: tempPasswordInput });
      setTempPasswordRevealFor(userId);
      setTempPasswordRevealValue(tempPasswordInput);
      setTempPasswordRevealVisible(false);
      setTempPasswordUserId(null);
      setTempPasswordInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set password");
    } finally {
      setTempPasswordLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => { /* optional toast */ });
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>Users <LogoMark /></h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Create accounts for your team (sign-up is disabled). Share the password with the user; they can change it in Account. Manage role and active status below.
      </p>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "0.5rem" }}>Create new user &amp; user list</h2>
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.75rem" }}>Create new user</h3>
        <form onSubmit={handleCreateUser} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "end", marginBottom: "1.5rem" }}>
          <div>
            <label htmlFor="create-name" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Name</label>
            <input
              id="create-name"
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              placeholder="Full name"
              style={{ minWidth: "10rem", padding: "0.5rem 0.5rem", borderRadius: "0.375rem", border: "1px solid #e5e7eb", fontFamily: "Montserrat, sans-serif", fontSize: "0.875rem" }}
            />
          </div>
          <div>
            <label htmlFor="create-email" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Email</label>
            <input
              id="create-email"
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
              placeholder="user@example.com"
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="create-password" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Password (min 8)</label>
            <input
              id="create-password"
              type="text"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              required
              minLength={8}
              placeholder="Give to user; they can change in Account"
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="create-role" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Role</label>
            <select
              id="create-role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as (typeof ROLES)[number]["value"])}
              style={{ width: "100%" }}
            >
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={createLoading}
            style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", fontWeight: 600, backgroundColor: "#059669", color: "#fff", border: "none", fontFamily: "Montserrat, sans-serif", cursor: createLoading ? "not-allowed" : "pointer", opacity: createLoading ? 0.7 : 1 }}
          >
            {createLoading ? "Creating..." : "Create user"}
          </button>
        </form>
        {createSuccess && createSuccessPassword && (
          <div style={{ marginBottom: "1rem", padding: "0.75rem", borderRadius: "0.5rem", backgroundColor: "var(--surface-muted)", fontSize: "0.875rem" }}>
            <p style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: "0.5rem" }}>User created. Password (not stored - copy now):</p>
            <span style={{ fontFamily: "monospace", marginRight: "0.5rem" }}>{createSuccessReveal ? createSuccessPassword : "********"}</span>
            <button type="button" onClick={() => setCreateSuccessReveal((v) => !v)} style={{ marginRight: "0.5rem", padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}>{createSuccessReveal ? "Hide" : "Show"}</button>
            <button type="button" onClick={() => copyToClipboard(createSuccessPassword)} style={{ marginRight: "0.5rem", padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}>Copy</button>
            <button type="button" onClick={() => { setCreateSuccess(false); setCreateSuccessPassword(""); }} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}>Dismiss</button>
          </div>
        )}

        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Passwords are not stored. You only see them when you create a user or set a temporary password.</p>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>User list</h3>
        {error && (
          <div style={{ padding: "0.5rem 0.75rem", marginBottom: "1rem", borderRadius: "0.375rem", backgroundColor: "#fef2f2", color: "#dc2626", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}
        {users === undefined ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No users found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Email</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Role</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Last login</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Active</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Password</th>
                  <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isLastAdmin = u.role === "admin" && adminCount <= 1;
                  return (
                    <tr key={u._id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "0.75rem", color: "var(--text-primary)" }}>
                        <Link
                          to={`/admin/users/${u._id}`}
                          style={{ color: "#059669", fontWeight: 600, textDecoration: "none" }}
                        >
                          {u.name ?? "-"}
                        </Link>
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>{u.email ?? "-"}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <select
                          value={u.role ?? ""}
                          onChange={(e) => handleRoleChange(u._id, e.target.value as (typeof ROLES)[number]["value"])}
                          disabled={isLastAdmin}
                          title={isLastAdmin ? "At least one admin must remain" : undefined}
                          style={{ opacity: isLastAdmin ? 0.8 : 1 }}
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        {isLastAdmin && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>(last admin)</span>}
                      </td>
                      <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>{formatDate(u.lastLoginAt)}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <button
                          type="button"
                          onClick={() => { setError(null); setUserActive({ userId: u._id, isActive: !u.isActive }); }}
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
                      <td style={{ padding: "0.75rem", fontSize: "0.8125rem" }}>
                        {tempPasswordUserId === u._id ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              value={tempPasswordInput}
                              onChange={(e) => setTempPasswordInput(e.target.value)}
                              placeholder="Min 8 chars"
                              style={{ width: "8rem", padding: "0.25rem 0.35rem", borderRadius: "0.25rem", border: "1px solid #e5e7eb", fontSize: "0.8125rem" }}
                            />
                            <button type="button" onClick={() => handleSetTempPassword(u._id)} disabled={tempPasswordLoading || tempPasswordInput.length < 8} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: tempPasswordLoading ? "not-allowed" : "pointer" }}>{tempPasswordLoading ? "..." : "Set"}</button>
                            <button type="button" onClick={() => { setTempPasswordUserId(null); setTempPasswordInput(""); setError(null); }} style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer" }}>Cancel</button>
                          </span>
                        ) : tempPasswordRevealFor === u._id ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                            <span style={{ fontFamily: "monospace" }}>{tempPasswordRevealVisible ? tempPasswordRevealValue : "********"}</span>
                            <button type="button" onClick={() => setTempPasswordRevealVisible((v) => !v)} style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem", cursor: "pointer" }}>{tempPasswordRevealVisible ? "Hide" : "Show"}</button>
                            <button type="button" onClick={() => copyToClipboard(tempPasswordRevealValue)} style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem", cursor: "pointer" }}>Copy</button>
                            <button type="button" onClick={() => { setTempPasswordRevealFor(null); setTempPasswordRevealValue(""); }} style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem", cursor: "pointer" }}>Done</button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setTempPasswordUserId(u._id); setTempPasswordInput(""); setError(null); }}
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", cursor: "pointer", border: "1px solid #d1d5db", borderRadius: "0.25rem", background: "#f9fafb" }}
                          >
                            Set temp password
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setConfirmDeleteUser({
                              id: u._id,
                              label: u.name ?? u.email ?? "this user",
                            });
                          }}
                          disabled={isLastAdmin}
                          title={isLastAdmin ? "Cannot delete the last admin" : "Delete user"}
                          style={{
                            padding: "0.35rem 0.6rem",
                            borderRadius: "0.375rem",
                            fontSize: "0.8125rem",
                            fontWeight: 500,
                            backgroundColor: "#fef2f2",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            cursor: isLastAdmin ? "not-allowed" : "pointer",
                            fontFamily: "Montserrat, sans-serif",
                            opacity: isLastAdmin ? 0.6 : 1,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
      <p style={{ marginTop: "1rem" }}>
        <Link to="/admin" style={{ fontSize: "0.875rem", color: "#059669", fontWeight: 500, textDecoration: "none" }}>{"<-"} Back to Admin</Link>
      </p>

      <ConfirmDialog
        open={confirmDeleteUser !== null}
        confirmLabel="Yes, delete user"
        message={
          confirmDeleteUser ? (
            <>
              This will permanently delete{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{confirmDeleteUser.label}</span>. They
              will lose access and cannot sign in again.
            </>
          ) : null
        }
        onCancel={() => setConfirmDeleteUser(null)}
        onConfirm={async () => {
          const toDelete = confirmDeleteUser;
          setConfirmDeleteUser(null);
          if (!toDelete) return;
          try {
            await deleteUser({ userId: toDelete.id });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete user");
          }
        }}
      />
    </div>
  );
}
