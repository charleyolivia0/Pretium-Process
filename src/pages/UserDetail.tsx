import { useState, useEffect, useRef, type CSSProperties, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
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

function toDateInputValue(ts?: number) {
  if (ts == null) return "";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const d = new Date(value + "T12:00:00");
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

const inputStyle: CSSProperties = {
  minWidth: "10rem",
  padding: "0.5rem 0.5rem",
  borderRadius: "0.375rem",
  border: "1px solid #e5e7eb",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.875rem",
};

export function UserDetail() {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const user = useQuery(api.users.current);
  const isAdmin = user?.role === "admin";
  const userId = userIdParam as Id<"users"> | undefined;
  const profile = useQuery(
    api.users.getUserForAdmin,
    isAdmin && userId ? { userId } : "skip"
  );
  const usersList = useQuery(api.users.listUsers, isAdmin ? {} : "skip");
  const updateUserRole = useMutation(api.users.updateUserRole);
  const updateUserAdminProfile = useMutation(api.users.updateUserAdminProfile);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);

  const [phone, setPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState("");
  const [employmentInput, setEmploymentInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [confirmRemoveResume, setConfirmRemoveResume] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const syncedProfileId = useRef<string | null>(null);

  useEffect(() => {
    syncedProfileId.current = null;
  }, [userIdParam]);

  useEffect(() => {
    if (!profile || !userId) return;
    const key = profile._id;
    if (syncedProfileId.current === key) return;
    syncedProfileId.current = key;
    setPhone(profile.phone ?? "");
    setBirthdayInput(toDateInputValue(profile.birthdayAt));
    setEmploymentInput(toDateInputValue(profile.employmentStartAt));
  }, [profile, userId]);

  const adminCount = usersList?.filter((u: { role?: string }) => u.role === "admin").length ?? 0;

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
        <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
          User <LogoMark />
        </h1>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>You need admin access to view this page.</p>
          <Link to="/dashboard" style={{ color: "#059669", fontSize: "0.875rem", marginTop: "0.5rem", display: "inline-block" }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!userIdParam) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Missing user.</p>
        <Link to="/admin/users" style={{ color: "#059669", fontSize: "0.875rem" }}>
          {"<-"} Back to Users
        </Link>
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
          User <LogoMark />
        </h1>
        <div style={cardStyle}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>User not found.</p>
          <Link to="/admin/users" style={{ color: "#059669", fontSize: "0.875rem", marginTop: "0.5rem", display: "inline-block" }}>
            {"<-"} Back to Users
          </Link>
        </div>
      </div>
    );
  }

  const isLastAdmin = profile.role === "admin" && adminCount <= 1;

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    setError(null);
    setSaveLoading(true);
    try {
      const b = birthdayInput === "" ? null : dateInputToTimestamp(birthdayInput);
      const emp = employmentInput === "" ? null : dateInputToTimestamp(employmentInput);
      await updateUserAdminProfile({
        userId,
        phone: phone.trim() || null,
        birthdayAt: b === undefined ? null : b,
        employmentStartAt: emp === undefined ? null : emp,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleRoleChange(role: (typeof ROLES)[number]["value"]) {
    if (!userId) return;
    setError(null);
    try {
      await updateUserRole({ userId, role });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function handleResumeFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setError(null);
    setUploadingResume(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await updateUserAdminProfile({ userId, resumeStorageId: storageId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume upload failed");
    } finally {
      setUploadingResume(false);
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    }
  }

  async function handleRemoveResume() {
    if (!userId) return;
    setError(null);
    try {
      await updateUserAdminProfile({ userId, resumeStorageId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove resume");
    }
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <p style={{ marginBottom: "0.75rem" }}>
        <Link to="/admin/users" style={{ fontSize: "0.875rem", color: "#059669", fontWeight: 500, textDecoration: "none" }}>
          {"<-"} Back to Users
        </Link>
      </p>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
        {profile.name ?? "User"} <LogoMark />
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Email, phone, role, dates, and resume. Email is read-only; change the password from the Users list.
      </p>

      <div style={shellCardStyle}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "0.5rem" }}>Profile</h2>
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
          {error && (
            <div
              style={{
                padding: "0.5rem 0.75rem",
                marginBottom: "1rem",
                borderRadius: "0.375rem",
                backgroundColor: "#fef2f2",
                color: "#dc2626",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <dl style={{ margin: 0, display: "grid", gap: "0.75rem", fontSize: "0.875rem" }}>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Email</dt>
              <dd style={{ margin: 0, color: "var(--text-primary)" }}>{profile.email ?? "-"}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Last login</dt>
              <dd style={{ margin: 0, color: "var(--text-primary)" }}>{formatDate(profile.lastLoginAt)}</dd>
            </div>
            <div>
              <dt style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Status</dt>
              <dd style={{ margin: 0, color: "var(--text-primary)" }}>{profile.isActive ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <label htmlFor="user-role" style={{ fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                Role
              </label>
              <select
                id="user-role"
                value={profile.role ?? ""}
                onChange={(e) => handleRoleChange(e.target.value as (typeof ROLES)[number]["value"])}
                disabled={isLastAdmin}
                title={isLastAdmin ? "At least one admin must remain" : undefined}
                style={{ ...inputStyle, opacity: isLastAdmin ? 0.8 : 1 }}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {isLastAdmin && (
                <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>(last admin)</span>
              )}
            </div>
          </dl>

          <form onSubmit={handleSaveProfile} style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="user-phone" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                Phone
              </label>
              <input
                id="user-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                style={{ ...inputStyle, width: "100%", maxWidth: "20rem" }}
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <label htmlFor="user-birthday" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Birthday
                </label>
                <input id="user-birthday" type="date" value={birthdayInput} onChange={(e) => setBirthdayInput(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="user-start" style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                  Start date
                </label>
                <input id="user-start" type="date" value={employmentInput} onChange={(e) => setEmploymentInput(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <button
                type="submit"
                disabled={saveLoading}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  fontWeight: 600,
                  backgroundColor: "#059669",
                  color: "#fff",
                  border: "none",
                  fontFamily: "Montserrat, sans-serif",
                  cursor: saveLoading ? "not-allowed" : "pointer",
                  opacity: saveLoading ? 0.7 : 1,
                }}
              >
                {saveLoading ? "Saving..." : "Save phone & dates"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--border-strong)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>Resume</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
              PDF or Word document from your device.
            </p>
            {profile.resumeUrl ? (
              <p style={{ marginBottom: "0.75rem" }}>
                <a href={profile.resumeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#059669", fontWeight: 500 }}>
                  Open current resume
                </a>
              </p>
            ) : (
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>No file uploaded.</p>
            )}
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleResumeFile}
              disabled={uploadingResume}
              style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}
            />
            {uploadingResume && <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Uploading...</p>}
            {profile.resumeStorageId && (
              <button
                type="button"
                onClick={() => setConfirmRemoveResume(true)}
                disabled={uploadingResume}
                style={{
                  padding: "0.35rem 0.65rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.8125rem",
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                }}
              >
                Remove resume
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemoveResume}
        confirmLabel="Remove resume"
        message="This will permanently remove the uploaded resume file."
        onCancel={() => setConfirmRemoveResume(false)}
        onConfirm={async () => {
          setConfirmRemoveResume(false);
          await handleRemoveResume();
        }}
      />
    </div>
  );
}
