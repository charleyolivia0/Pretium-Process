import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { FunctionArgs } from "convex/server";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LogoMark } from "../components/LogoMark";
import { cardStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { useMascotsPreference } from "../contexts/MascotsPreferenceContext";
import { MyCustomNotificationsSection } from "../components/MyCustomNotificationsSection";

const MANUAL_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.txt,.xlsx,.xls,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatManualDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function auditEntryMatchesSearch(row: Doc<"appAuditLogs">, queryLower: string): boolean {
  if (!queryLower) return true;
  const hay = [
    row.action,
    row.actorLabel,
    row.summary ?? "",
    row.resourceType ?? "",
    row.resourceId ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(queryLower);
}

type EmployeeManualRow = {
  _id: Id<"employeeManuals">;
  title: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: number;
  uploadedByName: string;
};

function EmployeeManualsSection({
  isAdmin,
  generateUploadUrl,
  addEmployeeManual,
}: {
  isAdmin: boolean;
  generateUploadUrl: () => Promise<string>;
  addEmployeeManual: (args: {
    title: string;
    fileName: string;
    storageId: Id<"_storage">;
  }) => Promise<Id<"employeeManuals">>;
}) {
  const manuals = useQuery(api.employeeManuals.list);
  const removeManual = useMutation(api.employeeManuals.remove);
  const askManualQuestion = useAction(api.employeeManualQa.ask);
  const { theme } = useTheme();
  const [manualTitle, setManualTitle] = useState("");
  const [manualUploading, setManualUploading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualQuestion, setManualQuestion] = useState("");
  const [manualAnswer, setManualAnswer] = useState<string | null>(null);
  const [manualAnswerSources, setManualAnswerSources] = useState<string[]>([]);
  const [manualAnswerNote, setManualAnswerNote] = useState<string | null>(null);
  const [manualAnswerError, setManualAnswerError] = useState<string | null>(null);
  const [askingManual, setAskingManual] = useState(false);
  const [pendingRemoveManual, setPendingRemoveManual] = useState<{ id: Id<"employeeManuals">; title: string } | null>(
    null,
  );
  const manualFileRef = useRef<HTMLInputElement>(null);

  const isDark = theme === "dark";

  async function handleManualFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const extOk = /\.(pdf|doc|docx|ppt|pptx|txt|xlsx|xls)$/i.test(file.name);
    if (!extOk && file.type && !file.type.includes("pdf") && !file.type.includes("word") && !file.type.includes("sheet")) {
      setManualError("Please upload a PDF, Word, or common office file.");
      if (manualFileRef.current) manualFileRef.current.value = "";
      return;
    }
    setManualError(null);
    setManualUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const title = (manualTitle.trim() || file.name.replace(/\.[^.]+$/, "")).trim() || file.name;
      await addEmployeeManual({ title, fileName: file.name, storageId });
      setManualTitle("");
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setManualUploading(false);
      if (manualFileRef.current) manualFileRef.current.value = "";
    }
  }

  async function handleAskManualQuestion(e: React.FormEvent) {
    e.preventDefault();
    const question = manualQuestion.trim();
    if (!question) {
      setManualAnswerError("Enter a question first.");
      return;
    }
    setAskingManual(true);
    setManualAnswerError(null);
    try {
      const result = await askManualQuestion({ question });
      setManualAnswer(result.answer ?? null);
      setManualAnswerSources(result.sources ?? []);
      setManualAnswerNote(result.confidenceNote ?? null);
      setManualAnswerError(result.error ?? null);
    } catch (err) {
      setManualAnswer(null);
      setManualAnswerSources([]);
      setManualAnswerNote(null);
      setManualAnswerError(err instanceof Error ? err.message : "Failed to get an answer.");
    } finally {
      setAskingManual(false);
    }
  }

  return (
    <section
      id="employee-manuals"
      style={{
        ...cardStyle,
        backgroundColor: isDark ? "#020617" : cardStyle.backgroundColor,
        borderColor: isDark ? "#1f2937" : (cardStyle.border as string | undefined),
        boxShadow: isDark ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
      }}
    >
      <h2
        style={{
          fontSize: "1.125rem",
          fontWeight: 600,
          color: isDark ? "#e5e7eb" : "#111827",
          marginBottom: "0.25rem",
        }}
      >
        Employee manuals
      </h2>
      <p
        style={{
          fontSize: "0.875rem",
          color: isDark ? "#9ca3af" : "#6b7280",
          marginBottom: "1rem",
          marginTop: 0,
        }}
      >
        Onboarding and reference documents for the team. Everyone signed in can open or download them.
        {isAdmin ? " As an admin, you can add or remove files here." : ""}
      </p>

      {isAdmin && (
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="manual-title"
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: isDark ? "#d1d5db" : "#374151",
              marginBottom: "0.35rem",
            }}
          >
            Title (optional - defaults to file name)
          </label>
          <input
            id="manual-title"
            type="text"
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="e.g. Pretium safety handbook"
            disabled={manualUploading}
            style={{
              display: "block",
              width: "100%",
              maxWidth: "24rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: isDark ? "1px solid #374151" : "1px solid #d1d5db",
              backgroundColor: isDark ? "#0f172a" : "#fff",
              color: isDark ? "#e5e7eb" : "#111827",
              fontSize: "0.9375rem",
              marginBottom: "0.5rem",
              fontFamily: "Montserrat, sans-serif",
            }}
          />
          <input
            ref={manualFileRef}
            type="file"
            accept={MANUAL_ACCEPT}
            onChange={handleManualFile}
            disabled={manualUploading}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => manualFileRef.current?.click()}
            disabled={manualUploading}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#047857",
              backgroundColor: isDark ? "#022c22" : "#ecfdf5",
              border: "1px solid #059669",
              cursor: manualUploading ? "not-allowed" : "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            {manualUploading ? "Uploading..." : "Upload manual"}
          </button>
          {manualError && (
            <p style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "#dc2626", marginBottom: 0 }}>{manualError}</p>
          )}
        </div>
      )}

      {manuals === undefined ? (
        <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: 0 }}>Loading...</p>
      ) : manuals.length === 0 ? (
        <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: 0 }}>
          No manuals uploaded yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {manuals.map((m: EmployeeManualRow) => (
            <li
              key={m._id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.65rem 0.75rem",
                borderRadius: "0.5rem",
                border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
                backgroundColor: isDark ? "#0f172a" : "#f9fafb",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <a
                  href={m.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontWeight: 600,
                    fontSize: "0.9375rem",
                    color: "#059669",
                    textDecoration: "none",
                    wordBreak: "break-word",
                  }}
                >
                  {m.title}
                </a>
                <div style={{ fontSize: "0.75rem", color: isDark ? "#9ca3af" : "#6b7280", marginTop: "0.2rem" }}>
                  {m.fileName} · {formatManualDate(m.uploadedAt)}
                  {m.uploadedByName ? ` · ${m.uploadedByName}` : ""}
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setPendingRemoveManual({ id: m._id, title: m.title })}
                  style={{
                    flexShrink: 0,
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#b91c1c",
                    background: "transparent",
                    border: "1px solid #fecaca",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingRemoveManual !== null}
        message={
          pendingRemoveManual ? (
            <>
              This will permanently remove manual{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{pendingRemoveManual.title}</span>.
            </>
          ) : null
        }
        onCancel={() => setPendingRemoveManual(null)}
        onConfirm={async () => {
          if (!pendingRemoveManual) return;
          const { id } = pendingRemoveManual;
          setPendingRemoveManual(null);
          await removeManual({ manualId: id });
        }}
      />

      <div
        style={{
          marginTop: "1rem",
          borderTop: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
          paddingTop: "1rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            marginBottom: "0.35rem",
            fontSize: "1rem",
            fontWeight: 600,
            color: isDark ? "#e5e7eb" : "#111827",
          }}
        >
          Ask the manual
        </h3>
        <p style={{ margin: 0, marginBottom: "0.7rem", fontSize: "0.8125rem", color: isDark ? "#9ca3af" : "#6b7280" }}>
          Ask a question and get an answer from uploaded employee manuals.
        </p>
        <form onSubmit={handleAskManualQuestion}>
          <textarea
            value={manualQuestion}
            onChange={(e) => setManualQuestion(e.target.value)}
            placeholder="e.g. How many sick days do we get each year?"
            disabled={askingManual || manuals === undefined}
            rows={3}
            style={{
              width: "100%",
              borderRadius: "0.5rem",
              border: isDark ? "1px solid #374151" : "1px solid #d1d5db",
              backgroundColor: isDark ? "#0f172a" : "#fff",
              color: isDark ? "#e5e7eb" : "#111827",
              padding: "0.6rem 0.75rem",
              fontSize: "0.9rem",
              resize: "vertical",
              fontFamily: "Montserrat, sans-serif",
            }}
          />
          <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={askingManual || manuals === undefined || manuals.length === 0}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#fff",
                backgroundColor: "#059669",
                border: "none",
                cursor: askingManual ? "not-allowed" : "pointer",
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              {askingManual ? "Thinking..." : "Ask manual"}
            </button>
            {manuals !== undefined && manuals.length === 0 && (
              <span style={{ fontSize: "0.75rem", color: isDark ? "#9ca3af" : "#6b7280" }}>
                Upload at least one manual to use the bot.
              </span>
            )}
          </div>
        </form>
        {manualAnswerError && (
          <p style={{ marginTop: "0.6rem", marginBottom: 0, fontSize: "0.8125rem", color: "#dc2626" }}>{manualAnswerError}</p>
        )}
        {manualAnswer && (
          <div
            style={{
              marginTop: "0.8rem",
              borderRadius: "0.5rem",
              border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
              backgroundColor: isDark ? "#0f172a" : "#f9fafb",
              padding: "0.75rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.875rem", color: isDark ? "#e5e7eb" : "#111827", whiteSpace: "pre-wrap" }}>
              {manualAnswer}
            </p>
            {manualAnswerNote && (
              <p style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.75rem", color: isDark ? "#9ca3af" : "#6b7280" }}>
                {manualAnswerNote}
              </p>
            )}
            {manualAnswerSources.length > 0 && (
              <p style={{ marginTop: "0.35rem", marginBottom: 0, fontSize: "0.75rem", color: isDark ? "#9ca3af" : "#6b7280" }}>
                Sources: {manualAnswerSources.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AdminAuditLogSection({ user }: { user: Doc<"users"> | null }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isAdmin = user?.role === "admin";
  const counts = useQuery(api.auditLog.adminCount, user ? {} : "skip");
  const auditData = useQuery(api.auditLog.listRecent, isAdmin ? { limit: 150 } : "skip");
  const writeTestEntry = useMutation(api.auditLog.writeTestEntry);
  const bootstrapFirstAdmin = useMutation(api.auditLog.bootstrapFirstAdminIfNone);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [auditSearch, setAuditSearch] = useState("");

  const auditEntries =
    isAdmin && auditData !== undefined && auditData.status === "ok" ? auditData.entries : [];
  const auditSearchLower = auditSearch.trim().toLowerCase();
  const filteredAuditEntries = useMemo(
    () => auditEntries.filter((row) => auditEntryMatchesSearch(row, auditSearchLower)),
    [auditEntries, auditSearchLower],
  );

  if (!user) return null;

  return (
    <details
      style={{
        marginTop: "2rem",
        maxWidth: "84rem",
        borderRadius: "0.75rem",
        border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
        backgroundColor: isDark ? "#020617" : "#f9fafb",
        padding: "0.75rem 1rem",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: isDark ? "#9ca3af" : "#6b7280",
          listStyle: "none",
        }}
      >
        Audit log
      </summary>
      <p
        style={{
          margin: "0.5rem 0 0.75rem",
          fontSize: "0.75rem",
          color: isDark ? "#6b7280" : "#9ca3af",
        }}
      >
        Who changed what in the app, newest first. Expand only when you need it.
      </p>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.7rem", color: isDark ? "#64748b" : "#9ca3af" }}>
        After resetting Convex, set <code style={{ fontSize: "0.7rem" }}>VITE_CONVEX_URL</code> in{" "}
        <code style={{ fontSize: "0.7rem" }}>.env.local</code> to the URL from <code style={{ fontSize: "0.7rem" }}>npx convex dev</code>, restart Vite, then sign in again.
      </p>
      {counts?.authenticated && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: isDark ? "#94a3b8" : "#64748b" }}>
          Users in database: {counts.users} · Admins: {counts.admins}
          {!isAdmin && counts.admins === 0 ? " — no admin yet, so the app hides admin tools until you promote one (below)." : null}
        </p>
      )}
      {!isAdmin && counts?.authenticated && counts.admins === 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            disabled={bootstrapBusy}
            onClick={async () => {
              setBootstrapMessage(null);
              setBootstrapBusy(true);
              try {
                await bootstrapFirstAdmin({});
                setBootstrapMessage("You are now an admin. Refresh the page if the list below does not update.");
              } catch (e) {
                setBootstrapMessage(e instanceof Error ? e.message : "Could not promote");
              } finally {
                setBootstrapBusy(false);
              }
            }}
            style={{
              padding: "0.4rem 0.75rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "#fff",
              backgroundColor: "#059669",
              border: "none",
              borderRadius: "0.5rem",
              cursor: bootstrapBusy ? "not-allowed" : "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            {bootstrapBusy ? "Working…" : "Make me admin (only when there are zero admins)"}
          </button>
          {bootstrapMessage && (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: bootstrapMessage.includes("now") ? "#059669" : "#dc2626" }}>{bootstrapMessage}</p>
          )}
        </div>
      )}
      {!isAdmin && counts?.authenticated && counts.admins > 0 && (
        <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: "0 0 0.75rem" }}>
          Full audit log is only available to admins. Your role is &quot;{user.role ?? "unknown"}&quot;. Ask an admin to set your role to admin under Admin → Users.
        </p>
      )}
      {isAdmin && (
      <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={testBusy}
          onClick={async () => {
            setTestMessage(null);
            setTestBusy(true);
            try {
              await writeTestEntry({});
              setTestMessage("Test entry recorded.");
            } catch (e) {
              setTestMessage(e instanceof Error ? e.message : "Failed to record test entry");
            } finally {
              setTestBusy(false);
            }
          }}
          style={{
            padding: "0.3rem 0.65rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#047857",
            backgroundColor: isDark ? "#022c22" : "#ecfdf5",
            border: "1px solid #059669",
            borderRadius: "0.5rem",
            cursor: testBusy ? "not-allowed" : "pointer",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          {testBusy ? "Recording…" : "Record test entry"}
        </button>
        {testMessage && (
          <span style={{ fontSize: "0.75rem", color: testMessage.startsWith("Test entry") ? "#059669" : "#dc2626" }}>{testMessage}</span>
        )}
      </div>
      )}
      {!isAdmin ? null : auditData === undefined ? (
        <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: 0 }}>Loading…</p>
      ) : auditData.status === "unauthenticated" ? (
        <p style={{ fontSize: "0.875rem", color: "#dc2626", margin: 0 }}>Not signed in (session missing). Try signing out and back in.</p>
      ) : auditData.status === "forbidden" ? (
        <p style={{ fontSize: "0.875rem", color: "#dc2626", margin: 0 }}>
          Admin only. Your account role is &quot;{String(auditData.yourRole ?? "unknown")}&quot;. Ask an admin to set your role to admin in Users.
        </p>
      ) : auditEntries.length === 0 ? (
        <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: 0 }}>No entries yet. Use &quot;Record test entry&quot; above or perform an action in the app.</p>
      ) : (
        <>
          <div style={{ marginBottom: "0.65rem" }}>
            <label
              htmlFor="audit-log-search"
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: isDark ? "#94a3b8" : "#64748b",
                marginBottom: "0.35rem",
              }}
            >
              Search
            </label>
            <input
              id="audit-log-search"
              type="search"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filter by action, person, summary, resource…"
              autoComplete="off"
              style={{
                width: "100%",
                maxWidth: "28rem",
                padding: "0.45rem 0.65rem",
                fontSize: "0.8125rem",
                borderRadius: "0.5rem",
                border: isDark ? "1px solid #374151" : "1px solid #d1d5db",
                backgroundColor: isDark ? "#0f172a" : "#fff",
                color: isDark ? "#e5e7eb" : "#111827",
                fontFamily: "Montserrat, sans-serif",
              }}
            />
            {auditSearchLower ? (
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.7rem", color: isDark ? "#64748b" : "#9ca3af" }}>
                Showing {filteredAuditEntries.length} of {auditEntries.length}
              </p>
            ) : null}
          </div>
          {filteredAuditEntries.length === 0 ? (
            <p style={{ fontSize: "0.875rem", color: isDark ? "#9ca3af" : "#6b7280", margin: 0 }}>
              No entries match your search. Clear the search box or try different words.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {filteredAuditEntries.map((row: Doc<"appAuditLogs">) => (
                <li
                  key={row._id}
                  style={{
                    fontSize: "0.8125rem",
                    padding: "0.5rem 0.65rem",
                    borderRadius: "0.5rem",
                    border: isDark ? "1px solid #1f2937" : "1px solid #e5e7eb",
                    backgroundColor: isDark ? "#0f172a" : "#fff",
                    color: isDark ? "#e5e7eb" : "#111827",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "0.15rem" }}>{row.action}</div>
                  <div style={{ color: isDark ? "#9ca3af" : "#6b7280", fontSize: "0.75rem" }}>
                    {formatManualDate(row.createdAt)} · {row.actorLabel}
                    {row.summary ? ` · ${row.summary}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </details>
  );
}

export function Account() {
  const user = useQuery(api.users.current);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const setUserImage = useMutation(api.users.setUserImage);
  const removeUserImage = useMutation(api.users.removeUserImage);
  const addEmployeeManual = useMutation(api.employeeManuals.add);

  const [uploading, setUploading] = useState(false);

  function getUserInitial(value: string | undefined): string {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "?";
  }
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { mascotsOn, setMascotsOn } = useMascotsPreference();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setUploadError("Please select an image file (e.g. JPG, PNG).");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: "POST", body: file });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      await setUserImage({ storageId });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    setUploadError(null);
    setConfirmRemovePhoto(false);
    try {
      await removeUserImage({});
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to remove photo");
    }
  }

  if (user === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", padding: "1rem" }}>
        <p style={{ color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (user === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", padding: "1rem" }}>
        <p style={{ color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>Sign in to manage your account.</p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "84rem", width: "100%" }}>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: theme === "dark" ? "#e5e7eb" : "#022c22",
          marginBottom: "0.25rem",
        }}
      >
        Account <LogoMark />
      </h1>
      <p
        style={{
          color: theme === "dark" ? "#9ca3af" : "#6b7280",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
        }}
      >
        Manage your profile picture, employee manuals, and notifications.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
            Profile
          </p>
          <section
            style={{
              ...cardStyle,
              backgroundColor: theme === "dark" ? "#020617" : cardStyle.backgroundColor,
              borderColor: theme === "dark" ? "#1f2937" : (cardStyle.border as string | undefined),
              boxShadow: theme === "dark" ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
            }}
          >
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: theme === "dark" ? "#e5e7eb" : "#111827", marginBottom: "0.25rem" }}>
              Profile picture
            </h2>
            <p style={{ marginTop: 0, marginBottom: "0.9rem", fontSize: "0.8125rem", color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
              Update the photo shown across your account and project activity.
            </p>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1.25rem", flexWrap: "wrap" }}>
              <div
                style={{
                  width: "6rem",
                  height: "6rem",
                  borderRadius: "50%",
                  overflow: "hidden",
                  backgroundColor: theme === "dark" ? "#020617" : "#f3f4f6",
                  flexShrink: 0,
                }}
              >
                {user?.image ? (
                  <img src={user.image} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: theme === "dark" ? "#6b7280" : "#9ca3af",
                      fontSize: "1.5rem",
                      fontWeight: 600,
                    }}
                  >
                    {getUserInitial(user?.name ?? user?.email)}
                  </div>
                )}
              </div>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} style={{ display: "none" }} />
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: "0.4rem 0.75rem",
                      borderRadius: "0.5rem",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "#047857",
                      backgroundColor: theme === "dark" ? "#022c22" : "#ecfdf5",
                      border: "1px solid #059669",
                      cursor: uploading ? "not-allowed" : "pointer",
                      fontFamily: "Montserrat, sans-serif",
                    }}
                  >
                    {uploading ? "Uploading..." : "Choose from computer"}
                  </button>
                  {user?.image && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemovePhoto(true)}
                      disabled={uploading}
                      style={{
                        padding: "0.4rem 0.75rem",
                        borderRadius: "0.5rem",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        color: theme === "dark" ? "#d1d5db" : "#6b7280",
                        backgroundColor: theme === "dark" ? "#020617" : "#f3f4f6",
                        border: theme === "dark" ? "1px solid #374151" : "1px solid #e5e7eb",
                        cursor: uploading ? "not-allowed" : "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                {uploadError && <p style={{ marginTop: "0.5rem", marginBottom: 0, fontSize: "0.8125rem", color: "#dc2626" }}>{uploadError}</p>}
              </div>
            </div>
          </section>
          <section
            style={{
              ...cardStyle,
              backgroundColor: theme === "dark" ? "#020617" : cardStyle.backgroundColor,
              borderColor: theme === "dark" ? "#1f2937" : (cardStyle.border as string | undefined),
              boxShadow: theme === "dark" ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: theme === "dark" ? "#e5e7eb" : "#111827",
                marginBottom: "0.75rem",
              }}
            >
              Appearance
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div style={{ fontSize: "0.875rem", color: theme === "dark" ? "#9ca3af" : "#4b5563" }}>
                  <div style={{ fontWeight: 500 }}>Dark mode</div>
                  <div>Switch between light and dark themes for this app.</div>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle dark mode"
                  style={{
                    position: "relative",
                    width: "3rem",
                    height: "1.5rem",
                    flexShrink: 0,
                    borderRadius: "999px",
                    border: "1px solid rgba(148, 163, 184, 0.6)",
                    backgroundColor: theme === "dark" ? "#0f172a" : "#e5e7eb",
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: theme === "dark" ? "1.5rem" : "0.15rem",
                      width: "1.2rem",
                      height: "1.2rem",
                      borderRadius: "999px",
                      backgroundColor: "var(--surface-panel)",
                      boxShadow: "0 2px 6px rgba(15,23,42,0.4)",
                      transition: "left 150ms ease",
                      pointerEvents: "none",
                    }}
                  />
                </button>
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: "0.875rem", color: theme === "dark" ? "#9ca3af" : "#4b5563" }}>
                  <div style={{ fontWeight: 500 }}>Mascots</div>
                  <div>
                    Show corner characters and page mascots. Chuck&apos;s image on Assistant stays visible. Use the bell for
                    notifications when mascots are off.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={mascotsOn}
                  onChange={(e) => setMascotsOn(e.target.checked)}
                  aria-label="Show mascots"
                  style={{
                    width: "1.2rem",
                    height: "1.2rem",
                    flexShrink: 0,
                    borderRadius: "0.375rem",
                    border: "1px solid #d1d5db",
                    cursor: "pointer",
                    accentColor: "#059669",
                  }}
                />
              </label>
            </div>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
            Preferences
          </p>
          <NotificationSettingsCard userRole={user?.role} />
          <MyCustomNotificationsSection />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: theme === "dark" ? "#9ca3af" : "#6b7280" }}>
            Manuals & AI
          </p>
          <EmployeeManualsSection isAdmin={user?.role === "admin"} generateUploadUrl={generateUploadUrl} addEmployeeManual={addEmployeeManual} />
        </div>
      </div>

      <AdminAuditLogSection user={user} />

      <ConfirmDialog
        open={confirmRemovePhoto}
        confirmLabel="Yes, remove photo"
        message="This will remove your profile picture. You can upload a new one at any time."
        onCancel={() => setConfirmRemovePhoto(false)}
        onConfirm={() => {
          setConfirmRemovePhoto(false);
          void handleRemovePhoto();
        }}
      />

    </div>
  );
}

function NotificationSettingsCard({ userRole }: { userRole?: string }) {
  const prefs = useQuery(api.notifications.getPreferences);
  const updatePreferences = useMutation(api.notifications.updatePreferences);
  const { theme } = useTheme();

  const loading = prefs === undefined;
  const isAdmin = userRole === "admin";
  const isPrincipal = userRole === "principal";

  type PrefKey =
    | "projectContractsEnabled"
    | "projectChangesFollowupEnabled"
    | "boardroomBookingsEnabled"
    | "boardroomApprovalsEnabled"
    | "safetyChangesEnabled"
    | "adminBoardroomRequestsEnabled"
    | "taskDueRemindersEnabled"
    | "dailyReportRemindersEnabled"
    | "safetyDocExpiryRemindersEnabled"
    | "boardroomStatusUpdatesEnabled"
    | "principalOverdueAlertsEnabled"
    | "rfiActionRequiredEnabled"
    | "submittalActionRequiredEnabled"
    | "weeklyUpdateEnabled"
    | "tradeLoginSetupRequiredEnabled"
    | "personalChangeRemindersEnabled";

  const preferenceOptions = useMemo(() => {
    const options: {
      section: string;
      key: PrefKey;
      label: string;
      adminOnly?: boolean;
      principalOnly?: boolean;
    }[] = [
      { section: "Projects", key: "projectContractsEnabled", label: "Contract updates on my projects" },
      {
        section: "Projects",
        key: "projectChangesFollowupEnabled",
        label: "Changes items needing follow-up (>5 days unpaid)",
      },
      {
        section: "Projects",
        key: "personalChangeRemindersEnabled",
        label: "Personal document reminders (intervals I set on change rows)",
      },
      { section: "Projects", key: "taskDueRemindersEnabled", label: "Task due soon and overdue (my projects)" },
      { section: "Projects", key: "dailyReportRemindersEnabled", label: "Daily report missing (active projects)" },
      { section: "Workflow", key: "rfiActionRequiredEnabled", label: "RFI: action required (ball-in-court / overdue)" },
      {
        section: "Workflow",
        key: "submittalActionRequiredEnabled",
        label: "Submittal: action required (ball-in-court / overdue)",
      },
      { section: "Boardroom", key: "boardroomBookingsEnabled", label: "Boardroom bookings that include me" },
      { section: "Boardroom", key: "boardroomApprovalsEnabled", label: "Boardroom approvals for my requests" },
      {
        section: "Boardroom",
        key: "boardroomStatusUpdatesEnabled",
        label: "Boardroom rejections and schedule changes",
      },
      {
        section: "Boardroom",
        key: "adminBoardroomRequestsEnabled",
        label: "Admin: new boardroom requests awaiting review",
        adminOnly: true,
      },
      { section: "Safety & documents", key: "safetyChangesEnabled", label: "Safety updates on my projects" },
      { section: "Safety & documents", key: "safetyDocExpiryRemindersEnabled", label: "Document expiry reminders" },
      { section: "Reports", key: "weeklyUpdateEnabled", label: "Weekly update ready (Monday digest)" },
      {
        section: "Principal",
        key: "principalOverdueAlertsEnabled",
        label: "Overdue task and change alerts (Principal)",
        principalOnly: true,
      },
      {
        section: "Admin",
        key: "tradeLoginSetupRequiredEnabled",
        label: "Trade login setup required",
        adminOnly: true,
      },
    ];
    return options.filter((opt) => {
      if (opt.adminOnly && !isAdmin) return false;
      if (opt.principalOnly && !isPrincipal) return false;
      return true;
    });
  }, [isAdmin, isPrincipal]);

  const sections = useMemo(
    () => [...new Set(preferenceOptions.map((opt) => opt.section))],
    [preferenceOptions],
  );

  const [selectedKey, setSelectedKey] = useState<PrefKey>("projectContractsEnabled");

  const activeKey = preferenceOptions.some((opt) => opt.key === selectedKey)
    ? selectedKey
    : preferenceOptions[0]?.key;

  const selectedOption = preferenceOptions.find((opt) => opt.key === activeKey);

  async function handleToggle(key: PrefKey, next: boolean) {
    try {
      await updatePreferences({ [key]: next } as FunctionArgs<typeof api.notifications.updatePreferences>);
    } catch {
      // ignore for now; UI will refetch prefs
    }
  }

  function isPrefEnabled(key: PrefKey): boolean {
    if (!prefs) return true;
    const value = prefs[key];
    if (typeof value === "boolean") return value;
    return true;
  }

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.45rem 0.5rem",
    borderRadius: "0.35rem",
    border: `1px solid ${theme === "dark" ? "#374151" : "#d1d5db"}`,
    fontFamily: "Montserrat, sans-serif",
    fontSize: "0.875rem",
    backgroundColor: theme === "dark" ? "#0f172a" : "#fff",
    color: theme === "dark" ? "#e5e7eb" : "#111827",
    boxSizing: "border-box",
  };

  return (
    <section
      style={{
        ...cardStyle,
        backgroundColor: theme === "dark" ? "#020617" : cardStyle.backgroundColor,
        borderColor: theme === "dark" ? "#1f2937" : (cardStyle.border as string | undefined),
        boxShadow: theme === "dark" ? "0 16px 40px rgba(0,0,0,0.7)" : cardStyle.boxShadow,
      }}
    >
      <h2
        style={{
          fontSize: "1.125rem",
          fontWeight: 600,
          color: theme === "dark" ? "#e5e7eb" : "#111827",
          marginBottom: "0.75rem",
        }}
      >
        Notification settings
      </h2>
      {loading || !prefs || !selectedOption ? (
        <p style={{ fontSize: "0.875rem", color: theme === "dark" ? "#9ca3af" : "#6b7280", margin: 0 }}>Loading...</p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            fontSize: "0.875rem",
            color: theme === "dark" ? "#e5e7eb" : "#374151",
          }}
        >
          <div>
            <label
              htmlFor="notification-preference-select"
              style={{
                display: "block",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: theme === "dark" ? "#9ca3af" : "#6b7280",
                marginBottom: "0.25rem",
              }}
            >
              Notification
            </label>
            <select
              id="notification-preference-select"
              value={activeKey}
              onChange={(e) => setSelectedKey(e.target.value as PrefKey)}
              style={selectStyle}
            >
              {sections.map((section) => (
                <optgroup key={section} label={section}>
                  {preferenceOptions
                    .filter((opt) => opt.section === section)
                    .map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label} ({isPrefEnabled(opt.key) ? "on" : "off"})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <PreferenceToggle
            label={selectedOption.label}
            checked={isPrefEnabled(selectedOption.key)}
            onChange={(next) => handleToggle(selectedOption.key, next)}
          />
        </div>
      )}
    </section>
  );
}

function PreferenceToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: "1.2rem",
          height: "1.2rem",
          borderRadius: "0.375rem",
          border: "1px solid #d1d5db",
          cursor: "pointer",
          accentColor: "#059669",
        }}
      />
    </label>
  );
}
