import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import {
  cardStyle,
  innerWhiteCardStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  shellCardStyle,
  widgetTitleStyle,
} from "../theme";
import { dateInputValueToTimestamp, todayDateInputValue } from "../utils/dateInput";
import { useIsMobile } from "../hooks/useIsMobile";

const SESSION_KEY = "tradePortalSessionToken";

/** Set when you have the orientation form URL. Empty = card shows but link is disabled. */
const ORIENTATION_FORM_URL = "";

type AssignmentRow = {
  assignmentId: Id<"tradePortalAssignments">;
  projectId: Id<"projects">;
  projectName: string;
  subtradeId: Id<"projectSubtrades">;
  subtradeName: string;
};

function isPortalSessionErrorMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("portal session") ||
    lower.includes("session token") ||
    lower.includes("portal account is inactive") ||
    lower.includes("not assigned to your trade account")
  );
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function formatDate(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString();
}

async function uploadStorageFile(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }
  const payload = (await response.json()) as { storageId?: string };
  if (!payload.storageId) throw new Error("Upload did not return storageId");
  return payload.storageId as Id<"_storage">;
}

export function TradePortal() {
  const isMobile = useIsMobile(768);
  const [tradeName, setTradeName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | "">("");
  const [selectedSubtradeId, setSelectedSubtradeId] = useState<Id<"projectSubtrades"> | "">("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [employeeName, setEmployeeName] = useState("");
  const [documentType, setDocumentType] = useState("Employee Document");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentDate, setDocumentDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const [workerName, setWorkerName] = useState("");
  const [attendanceAction, setAttendanceAction] = useState<"in" | "out">("in");
  const [attendanceActionTouched, setAttendanceActionTouched] = useState(false);
  const [attendanceTime, setAttendanceTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [weatherSummary, setWeatherSummary] = useState("");
  const [reportDate, setReportDate] = useState(() => todayDateInputValue());
  const [reportPhotos, setReportPhotos] = useState<FileList | null>(null);
  const [reportFiles, setReportFiles] = useState<FileList | null>(null);

  const signIn = useMutation(api.tradePortal.signIn);
  const signOut = useMutation(api.tradePortal.signOut);
  const generateUploadUrl = useMutation(api.tradePortal.portalGenerateUploadUrl);
  const submitEmployeeDocument = useMutation(api.tradePortal.submitEmployeeDocument);
  const submitAttendance = useMutation(api.tradePortal.submitAttendance);
  const submitProgressReport = useMutation(api.tradePortal.submitProgressReport);

  useEffect(() => {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) setSessionToken(existing);
  }, []);

  const sessionState = useQuery(
    api.tradePortal.getSessionState,
    sessionToken ? { sessionToken } : "skip",
  );
  const sessionError = sessionState?.sessionError;

  useEffect(() => {
    if (!sessionError) return;
    resetPortalSession(sessionError);
  }, [sessionError]);

  const assignments = (sessionState?.assignments ?? []) as AssignmentRow[];
  const assignedProjects = useMemo(() => {
    const byProject = new Map<string, { projectId: Id<"projects">; projectName: string }>();
    for (const assignment of assignments) {
      if (!byProject.has(assignment.projectId)) {
        byProject.set(assignment.projectId, {
          projectId: assignment.projectId,
          projectName: assignment.projectName,
        });
      }
    }
    return [...byProject.values()];
  }, [assignments]);
  useEffect(() => {
    if (assignments.length === 0) {
      setSelectedProjectId("");
      setSelectedSubtradeId("");
      return;
    }
    if (!selectedProjectId || !assignments.some((row) => row.projectId === selectedProjectId)) {
      setSelectedProjectId(assignments[0].projectId);
    }
  }, [assignments, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedSubtradeId("");
      return;
    }
    const options = assignments.filter((row) => row.projectId === selectedProjectId);
    if (options.length === 0) {
      setSelectedSubtradeId("");
      return;
    }
    if (!selectedSubtradeId || !options.some((row) => row.subtradeId === selectedSubtradeId)) {
      setSelectedSubtradeId(options[0].subtradeId);
    }
  }, [assignments, selectedProjectId, selectedSubtradeId]);

  const activeAssignment = useMemo(
    () =>
      assignments.find(
        (row) => row.projectId === selectedProjectId && row.subtradeId === selectedSubtradeId,
      ) ?? null,
    [assignments, selectedProjectId, selectedSubtradeId],
  );

  const employeeDocs = useQuery(
    api.tradePortal.listEmployeeDocuments,
    sessionToken && activeAssignment
      ? { sessionToken, assignmentId: activeAssignment.assignmentId }
      : "skip",
  );

  const progressReports = useQuery(
    api.tradePortal.listProgressReports,
    sessionToken && activeAssignment
      ? { sessionToken, assignmentId: activeAssignment.assignmentId, limit: 20 }
      : "skip",
  );

  const attendanceResolution = useQuery(
    api.safety.resolveJobAttendanceAction,
    activeAssignment && workerName.trim()
      ? {
          projectId: activeAssignment.projectId,
          subtradeId: activeAssignment.subtradeId,
          workerName: workerName.trim(),
        }
      : "skip",
  );

  useEffect(() => {
    setAttendanceActionTouched(false);
    setAttendanceAction("in");
  }, [workerName, activeAssignment?.projectId, activeAssignment?.subtradeId]);

  useEffect(() => {
    if (attendanceActionTouched || !attendanceResolution?.isOnSite) return;
    setAttendanceAction("out");
  }, [attendanceResolution, attendanceActionTouched]);

  function formatAttendanceTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  async function handlePortalLogin(e: React.FormEvent) {
    e.preventDefault();
    setPortalError(null);
    setSuccessMessage(null);
    setBusyAction("login");
    try {
      const result = await signIn({
        tradeName: tradeName.trim(),
        passcode: passcode.trim(),
      });
      window.localStorage.setItem(SESSION_KEY, result.sessionToken);
      setSessionToken(result.sessionToken);
      setPasscode("");
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSignOut() {
    if (!sessionToken) return;
    setBusyAction("logout");
    try {
      await signOut({ sessionToken });
    } finally {
      window.localStorage.removeItem(SESSION_KEY);
      setSessionToken(null);
      setSelectedProjectId("");
      setSelectedSubtradeId("");
      setBusyAction(null);
    }
  }

  function resetPortalSession(message?: string) {
    window.localStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setSelectedProjectId("");
    setSelectedSubtradeId("");
    setPortalError(
      message && isPortalSessionErrorMessage(message)
        ? "Your portal session expired or changed. Please sign in again."
        : (message ?? "Please sign in again."),
    );
  }

  function handlePortalActionError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback;
    if (isPortalSessionErrorMessage(message)) {
      resetPortalSession(message);
      return;
    }
    setPortalError(message);
  }

  function parseDateInput(value: string) {
    return dateInputValueToTimestamp(value);
  }

  function buildSignedAtFromTime(value: string) {
    const [hh, mm] = value.split(":").map(Number);
    const now = new Date();
    const stamp = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number.isFinite(hh) ? hh : now.getHours(),
      Number.isFinite(mm) ? mm : now.getMinutes(),
      0,
      0,
    ).getTime();
    return stamp;
  }

  async function handleEmployeeDocumentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionToken || !activeAssignment) return;
    setPortalError(null);
    setSuccessMessage(null);
    setBusyAction("employeeDoc");
    try {
      let storageId: Id<"_storage"> | undefined;
      if (documentFile) {
        const uploadUrl = await generateUploadUrl({ sessionToken });
        storageId = await uploadStorageFile(uploadUrl, documentFile);
      }
      await submitEmployeeDocument({
        sessionToken,
        assignmentId: activeAssignment.assignmentId,
        employeeName: employeeName.trim(),
        documentType: documentType.trim(),
        name: documentTitle.trim(),
        storageId,
        documentDate: parseDateInput(documentDate),
        expiryDate: parseDateInput(expiryDate),
      });
      setEmployeeName("");
      setDocumentTitle("");
      setDocumentFile(null);
      setDocumentDate("");
      setExpiryDate("");
      setSuccessMessage("Employee document submitted.");
    } catch (err) {
      handlePortalActionError(err, "Could not submit employee document");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAttendanceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionToken || !activeAssignment) return;
    setPortalError(null);
    setSuccessMessage(null);
    setBusyAction("attendance");
    try {
      await submitAttendance({
        sessionToken,
        assignmentId: activeAssignment.assignmentId,
        workerName: workerName.trim(),
        action: attendanceAction,
        signedAt: buildSignedAtFromTime(attendanceTime),
      });
      setWorkerName("");
      setAttendanceAction("in");
      setAttendanceActionTouched(false);
      setSuccessMessage("Sign in/out recorded in master log.");
    } catch (err) {
      handlePortalActionError(err, "Could not submit attendance");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleProgressSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionToken || !activeAssignment) return;
    setPortalError(null);
    setSuccessMessage(null);
    setBusyAction("progress");
    try {
      const photoStorageIds: Id<"_storage">[] = [];
      const documentStorageIds: Id<"_storage">[] = [];
      if (reportPhotos && reportPhotos.length > 0) {
        for (const file of Array.from(reportPhotos)) {
          const uploadUrl = await generateUploadUrl({ sessionToken });
          photoStorageIds.push(await uploadStorageFile(uploadUrl, file));
        }
      }
      if (reportFiles && reportFiles.length > 0) {
        for (const file of Array.from(reportFiles)) {
          const uploadUrl = await generateUploadUrl({ sessionToken });
          documentStorageIds.push(await uploadStorageFile(uploadUrl, file));
        }
      }
      await submitProgressReport({
        sessionToken,
        assignmentId: activeAssignment.assignmentId,
        title: reportTitle.trim(),
        description: reportDescription.trim() || undefined,
        weatherSummary: weatherSummary.trim() || undefined,
        reportDate: parseDateInput(reportDate),
        photoStorageIds: photoStorageIds.length > 0 ? photoStorageIds : undefined,
        documentStorageIds: documentStorageIds.length > 0 ? documentStorageIds : undefined,
      });
      setReportTitle("");
      setReportDescription("");
      setWeatherSummary("");
      setReportPhotos(null);
      setReportFiles(null);
      setSuccessMessage("Progress report submitted to daily reports.");
    } catch (err) {
      handlePortalActionError(err, "Could not submit progress report");
    } finally {
      setBusyAction(null);
    }
  }

  if (!sessionToken) {
    return (
      <div
        className="app-shell-graph-paper"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        <div style={{ ...cardStyle, width: "100%", maxWidth: "28rem" }}>
          <h1 style={{ marginTop: 0, marginBottom: "0.35rem", color: "var(--text-primary)" }}>Trade Portal</h1>
          <p style={{ marginTop: 0, marginBottom: "1rem", color: "var(--text-secondary)" }}>
            Enter your trade name and portal passcode.
          </p>
          <form onSubmit={handlePortalLogin}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Trade name</label>
            <input
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              required
              placeholder="e.g. Electrical"
              style={{ width: "100%", marginBottom: "0.75rem" }}
            />
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Passcode</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              required
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            {portalError ? (
              <p style={{ marginTop: 0, marginBottom: "0.75rem", color: "#b91c1c", fontWeight: 600 }}>{portalError}</p>
            ) : null}
            <button type="submit" style={{ ...primaryButtonStyle, width: "100%" }} disabled={busyAction === "login"}>
              {busyAction === "login" ? "Signing in..." : "Open portal"}
            </button>
          </form>
          <Link to="/login" style={{ display: "inline-block", marginTop: "0.75rem", color: "#065f46" }}>
            Back to app login
          </Link>
        </div>
      </div>
    );
  }

  if (sessionState === undefined) {
    return (
      <div
        className="app-shell-graph-paper"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        <div style={{ ...cardStyle, width: "100%", maxWidth: "28rem" }}>
          <h1 style={{ marginTop: 0, marginBottom: "0.35rem", color: "var(--text-primary)" }}>Trade Portal</h1>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>Checking your portal session...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="app-shell-graph-paper"
      style={{
        minHeight: "100vh",
        padding: "1.25rem",
        fontFamily: "Montserrat, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1220px", margin: "0 auto" }}>
        <div style={{ ...cardStyle, marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ margin: 0 }}>Trade Portal</h2>
            <p style={{ margin: "0.35rem 0 0 0", color: "var(--text-secondary)" }}>
              Signed in as {sessionState?.tradeName ?? "Trade"}.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" style={secondaryButtonStyle} onClick={handleSignOut} disabled={busyAction === "logout"}>
              {busyAction === "logout" ? "Signing out..." : "Sign out"}
            </button>
          </div>
          </div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Assigned job</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value as Id<"projects">)}
            style={{ width: "100%", maxWidth: "38rem" }}
          >
            {assignedProjects.map((row) => (
              <option key={row.projectId} value={row.projectId}>
                {row.projectName}
              </option>
            ))}
          </select>
        </div>

        {portalError ? (
          <div style={{ ...cardStyle, borderColor: "#fca5a5", marginBottom: "1rem" }}>
            <strong style={{ color: "#991b1b" }}>{portalError}</strong>
          </div>
        ) : null}
        {successMessage ? (
          <div style={{ ...cardStyle, borderColor: "#86efac", marginBottom: "1rem" }}>
            <strong style={{ color: "#166534" }}>{successMessage}</strong>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1.05fr 1.35fr 0.9fr", alignItems: "start", minWidth: 0 }}>
          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={shellCardStyle}>
              <h3 style={{ ...widgetTitleStyle, marginTop: 0, marginBottom: "0.75rem" }}>Project / Trade</h3>
              <p style={{ margin: "0 0 0.4rem 0", color: "#ffffff" }}>
                <strong>Project:</strong> {activeAssignment?.projectName ?? "—"}
              </p>
              <p style={{ margin: 0, color: "#d1fae5" }}>
                <strong>Trade:</strong> {activeAssignment?.subtradeName ?? "—"}
              </p>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Sign In / Out</h3>
              <form onSubmit={handleAttendanceSubmit}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Worker name</label>
                <input
                  value={workerName}
                  onChange={(e) => {
                    setWorkerName(e.target.value);
                    setAttendanceActionTouched(false);
                  }}
                  required
                  style={{ width: "100%", marginBottom: "0.5rem" }}
                />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Action</label>
                <select
                  value={attendanceAction}
                  onChange={(e) => {
                    setAttendanceAction(e.target.value as "in" | "out");
                    setAttendanceActionTouched(true);
                  }}
                  style={{ width: "100%", marginBottom: "0.35rem" }}
                >
                  <option value="in">Sign in</option>
                  <option value="out">Sign out</option>
                </select>
                {workerName.trim() && attendanceResolution?.isOnSite && attendanceResolution.openSignedInAt ? (
                  <p style={{ margin: "0 0 0.65rem", fontSize: "0.8rem", color: "#6b7280" }}>
                    Signed in at {formatAttendanceTime(attendanceResolution.openSignedInAt)} — will sign out
                  </p>
                ) : null}
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Time</label>
                <input type="time" value={attendanceTime} onChange={(e) => setAttendanceTime(e.target.value)} style={{ width: "100%", marginBottom: "0.75rem" }} />
                <button type="submit" style={{ ...primaryButtonStyle, width: "100%" }} disabled={busyAction === "attendance"}>
                  {busyAction === "attendance" ? "Submitting..." : "Update master log"}
                </button>
              </form>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Orientation Form</h3>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "#6b7280" }}>
                Complete site orientation before starting work.
              </p>
              {ORIENTATION_FORM_URL ? (
                <a
                  href={ORIENTATION_FORM_URL}
                  style={{ ...primaryButtonStyle, display: "block", textAlign: "center", textDecoration: "none", width: "100%" }}
                >
                  Open orientation form
                </a>
              ) : (
                <button type="button" disabled style={{ ...primaryButtonStyle, width: "100%", opacity: 0.6, cursor: "not-allowed" }}>
                  Link coming soon
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Employee Documents</h3>
              <form onSubmit={handleEmployeeDocumentSubmit}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Employee name</label>
                <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} required style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Document type</label>
                <input value={documentType} onChange={(e) => setDocumentType(e.target.value)} required style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Document title</label>
                <input value={documentTitle} onChange={(e) => setDocumentTitle(e.target.value)} required style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Issue date</label>
                <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Expiry date</label>
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>File upload</label>
                <input
                  type="file"
                  onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
                  style={{ width: "100%", marginBottom: "0.75rem" }}
                />
                <button type="submit" style={{ ...primaryButtonStyle, width: "100%" }} disabled={busyAction === "employeeDoc"}>
                  {busyAction === "employeeDoc" ? "Uploading..." : "Upload to employee docs"}
                </button>
              </form>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: "0.75rem" }}>Progress Reports</h3>
              <form onSubmit={handleProgressSubmit}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Report title</label>
                <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)} required style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Date</label>
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Weather summary</label>
                <input value={weatherSummary} onChange={(e) => setWeatherSummary(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Description</label>
                <textarea value={reportDescription} onChange={(e) => setReportDescription(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Photos</label>
                <input type="file" multiple onChange={(e) => setReportPhotos(e.target.files)} style={{ width: "100%", marginBottom: "0.5rem" }} />
                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Attachments</label>
                <input type="file" multiple onChange={(e) => setReportFiles(e.target.files)} style={{ width: "100%", marginBottom: "0.75rem" }} />
                <button type="submit" style={{ ...primaryButtonStyle, width: "100%" }} disabled={busyAction === "progress"}>
                  {busyAction === "progress" ? "Submitting..." : "Submit to daily reports"}
                </button>
              </form>
            </div>
          </div>

          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={{ ...shellCardStyle, minHeight: "17rem" }}>
              <h3 style={{ ...widgetTitleStyle, marginTop: 0, marginBottom: "0.75rem" }}>My Uploaded Documents</h3>
              <div style={{ maxHeight: "14rem", overflow: "auto", display: "grid", gap: "0.5rem" }}>
                {(employeeDocs ?? []).length === 0 ? (
                  <p style={{ margin: 0, color: "#d1fae5" }}>No documents uploaded yet.</p>
                ) : (
                  (employeeDocs ?? []).map((doc) => (
                    <div key={doc._id} style={{ ...innerWhiteCardStyle, padding: "0.5rem" }}>
                      <strong style={{ display: "block" }}>{doc.name}</strong>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {doc.employeeName} • {doc.documentType}
                      </span>
                      <br />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Uploaded {formatDateTime(doc.uploadedAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ ...shellCardStyle, minHeight: "17rem" }}>
              <h3 style={{ ...widgetTitleStyle, marginTop: 0, marginBottom: "0.75rem" }}>My Progress Reports</h3>
              <div style={{ maxHeight: "14rem", overflow: "auto", display: "grid", gap: "0.5rem" }}>
                {(progressReports ?? []).length === 0 ? (
                  <p style={{ margin: 0, color: "#d1fae5" }}>No progress reports submitted yet.</p>
                ) : (
                  (progressReports ?? []).map((report) => (
                    <div key={report._id} style={{ ...innerWhiteCardStyle, padding: "0.5rem" }}>
                      <strong style={{ display: "block" }}>{report.title}</strong>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Date: {formatDate(report.dueDate)}
                      </span>
                      {report.description ? (
                        <>
                          <br />
                          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{report.description}</span>
                        </>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

