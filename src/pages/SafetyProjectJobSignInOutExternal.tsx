import { useEffect, useState } from "react";
import { projectQueryArgs, withProjectId, asProjectId } from "../lib/projectQueryArgs";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { cardStyle } from "../theme";
import { useOfflineContext } from "../offline/OfflineProvider";
import { useOfflineCachedQuery } from "../offline/useOfflineCachedQuery";

const CENTRAL_TIMEZONE = "America/Chicago";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function getTimeZoneDateParts(ts: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

function getDayKeyCentral(ts: number) {
  // Numeric grouping key derived from the CT (America/Chicago) calendar date.
  const d = getTimeZoneDateParts(ts);
  return Date.UTC(d.year, d.month - 1, d.day);
}

function useCentralDayKey() {
  const [dayKey, setDayKey] = useState(() => getDayKeyCentral(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setDayKey(getDayKeyCentral(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);
  return dayKey;
}

function getTimeZoneDateTimeParts(ts: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return { year, month, day, hour, minute };
}

function zonedTimeToEpochMillis(params: {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}) {
  // Convert a CT wall-clock time (params) into an epoch millis timestamp.
  // Uses a small iterative correction loop to account for DST offsets.
  const desiredAsUTC = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute, 0);
  let guess = desiredAsUTC;
  for (let i = 0; i < 3; i++) {
    const parts = getTimeZoneDateTimeParts(guess);
    const obtainedAsUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const diff = desiredAsUTC - obtainedAsUTC;
    if (Math.abs(diff) < 60_000) break;
    guess += diff;
  }
  return guess;
}

function formatDayKey(dayKey: number) {
  // dayKey is a UTC-based numeric key derived from CT date parts.
  return new Date(dayKey).toLocaleDateString(undefined, { timeZone: "UTC" });
}

function formatSignedAtCT(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    timeZone: CENTRAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SafetyProjectJobSignInOutExternal() {
  const { projectId } = useParams<{ projectId: string }>();

  const { isOffline, queueJob } = useOfflineContext();
  const project = useOfflineCachedQuery(
    api.projects.getProjectByIdForAttendance,
    projectQueryArgs(projectId),
    "projects.getProjectByIdForAttendance"
  );
  const subtrades = useOfflineCachedQuery(
    api.subtrades.listByProjectPublic,
    projectQueryArgs(projectId),
    "subtrades.listByProjectPublic"
  );

  const recordAttendance = useMutation(api.safety.recordJobAttendance);

  const todayDayKey = useCentralDayKey();
  const [workerName, setWorkerName] = useState("");
  const [subtradeId, setSubtradeId] = useState<Id<"projectSubtrades"> | "">("");
  const [action, setAction] = useState<"in" | "out">("in");
  const [actionTouched, setActionTouched] = useState(false);
  const [timeValue, setTimeValue] = useState(() => {
    const nowParts = getTimeZoneDateTimeParts(Date.now());
    return `${pad2(nowParts.hour)}:${pad2(nowParts.minute)}`; // "HH:MM"
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const attendanceResolution = useQuery(
    api.safety.resolveJobAttendanceAction,
    projectId && subtradeId && workerName.trim()
      ? withProjectId(projectId, {
          subtradeId,
          workerName: workerName.trim(),
          dayKey: todayDayKey,
        })
      : "skip",
  );

  useEffect(() => {
    if (!subtrades || subtrades.length === 0) return;
    if (subtradeId) return;
    setSubtradeId(subtrades[0]._id);
  }, [subtrades, subtradeId]);

  useEffect(() => {
    setActionTouched(false);
    setAction("in");
  }, [workerName, subtradeId]);

  useEffect(() => {
    if (actionTouched || !attendanceResolution?.isOnSite) return;
    setAction("out");
  }, [attendanceResolution, actionTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setErrorMessage("");

    if (!projectId) return;
    if (!subtradeId) return;
    if (!workerName.trim()) return;

    const [hhStr, mmStr] = timeValue.split(":");
    const hh = Number(hhStr);
    const mm = Number(mmStr);

    const baseParts = getTimeZoneDateParts(Date.now());
    const signedAt =
      Number.isFinite(hh) && Number.isFinite(mm)
        ? zonedTimeToEpochMillis({
            year: baseParts.year,
            month: baseParts.month,
            day: baseParts.day,
            hour: hh,
            minute: mm,
          })
        : Date.now();

    setStatus("submitting");
    try {
      if (isOffline) {
        await queueJob({
          type: "safetyAttendance",
          payload: {
            projectId,
            subtradeId: String(subtradeId),
            workerName: workerName.trim(),
            action,
            signedAt,
          },
        });
        setWorkerName("");
        setAction("in");
        setActionTouched(false);
        setStatus("success");
        setTimeout(() => setStatus("idle"), 1500);
        return;
      }
      await recordAttendance({
        projectId: asProjectId(projectId)!,
        subtradeId,
        workerName: workerName.trim(),
        action,
        signedAt,
      });
      setWorkerName("");
      setAction("in");
      setActionTouched(false);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Submission failed. Please try again.");
    }
  }

  if (projectId == null) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "Montserrat, sans-serif", padding: "2rem" }}>
        <p>Missing project.</p>
        <Link to="/safety">Back to Safety</Link>
      </div>
    );
  }

  if (project === undefined || subtrades === undefined) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "Montserrat, sans-serif", padding: "2rem" }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "Montserrat, sans-serif", padding: "2rem" }}>
        <p>Project not found.</p>
        <Link to="/safety">Back to Safety</Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "Montserrat, sans-serif",
        backgroundColor: "#065f46",
        padding: "2rem",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: "52rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            to={`/safety/project/${projectId}`}
            style={{
              color: "#bbf7d0",
              textDecoration: "none",
              fontSize: "0.875rem",
              display: "inline-block",
              marginBottom: "0.5rem",
            }}
          >
            {"<-"} Safety hub
          </Link>
          <div style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 700 }}>
            Trade & site super sign-in/out
          </div>
          <div style={{ color: "#d1fae5", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Project: {project.name}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
          <div style={cardStyle}>
            <form onSubmit={handleSubmit} style={{ maxWidth: "30rem" }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 600 }}>
                  Project number
                </label>
                <input
                  type="text"
                  value={project.name}
                  disabled
                  style={{
                    width: "100%",
                    marginBottom: "0.75rem",
                    padding: "0.625rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid rgba(0,0,0,0.1)",
                    backgroundColor: "#f3f4f6",
                  }}
                />
              </div>

              <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 600 }}>
                Name
              </label>
              <input
                type="text"
                value={workerName}
                onChange={(e) => {
                  setWorkerName(e.target.value);
                  setActionTouched(false);
                }}
                placeholder="e.g. John Smith"
                required
                style={{
                  width: "100%",
                  marginBottom: "0.75rem",
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(0,0,0,0.1)",
                }}
              />

              <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 600 }}>
                Trade
              </label>
              <select
                value={subtradeId}
                onChange={(e) => {
                  setSubtradeId(e.target.value as Id<"projectSubtrades">);
                  setActionTouched(false);
                }}
                required
                disabled={subtrades.length === 0}
                style={{
                  width: "100%",
                  marginBottom: "0.75rem",
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(0,0,0,0.1)",
                  backgroundColor: "var(--surface-panel)",
                }}
              >
                {subtrades.length === 0 ? <option value="">No trades on this project</option> : null}
                {subtrades.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 600 }}>
                Action
              </label>
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value as "in" | "out");
                  setActionTouched(true);
                }}
                style={{
                  width: "100%",
                  marginBottom: "0.35rem",
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(0,0,0,0.1)",
                  backgroundColor: "var(--surface-panel)",
                }}
              >
                <option value="in">Sign in</option>
                <option value="out">Sign out</option>
              </select>
              {workerName.trim() && attendanceResolution?.isOnSite && attendanceResolution.openSignedInAt ? (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Signed in at {formatSignedAtCT(attendanceResolution.openSignedInAt)} — will sign out
                </p>
              ) : null}

              <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 600 }}>
                Time (CT)
              </label>
              <input
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                step={60}
                style={{
                  width: "100%",
                  marginBottom: "0.75rem",
                  padding: "0.625rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(0,0,0,0.1)",
                  backgroundColor: "var(--surface-panel)",
                }}
              />

              {status === "success" && (
                <p
                  style={{
                    padding: "0.75rem",
                    marginBottom: "1rem",
                    borderRadius: "0.5rem",
                    backgroundColor: "#d1fae5",
                    color: "#065f46",
                    fontSize: "0.875rem",
                  }}
                >
                  {isOffline ? "Saved offline — will sync when you’re back online." : "Submitted. Thank you."}
                </p>
              )}
              {status === "error" && errorMessage && (
                <p
                  style={{
                    padding: "0.75rem",
                    marginBottom: "1rem",
                    borderRadius: "0.5rem",
                    backgroundColor: "#fee2e2",
                    color: "#991b1b",
                    fontSize: "0.875rem",
                  }}
                >
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "submitting" || subtrades.length === 0}
                style={{
                  width: "100%",
                  padding: "0.625rem 1rem",
                  borderRadius: "0.5rem",
                  fontWeight: 700,
                  backgroundColor: status === "submitting" ? "#9ca3af" : "#059669",
                  color: "#fff",
                  border: "none",
                  cursor: status === "submitting" ? "not-allowed" : "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.9rem",
                }}
              >
                {status === "submitting" ? "Submitting..." : "Submit"}
              </button>

              <div style={{ marginTop: "0.75rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                Logs are shown inside the app.
                {" "}
                {projectId ? (
                  <Link
                    to={`/safety/project/${projectId}/job-sign-in-out`}
                    style={{ color: "#bbf7d0", textDecoration: "none", fontWeight: 700 }}
                  >
                    Go to logs {"->"}
                  </Link>
                ) : null}
              </div>
            </form>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#d1fae5" }}>
            Pretium Projects · Job sign-in/out form
          </p>
        </div>
      </div>
    </div>
  );
}

