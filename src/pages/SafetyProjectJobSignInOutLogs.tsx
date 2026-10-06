import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { projectQueryArgs, withProjectId } from "../lib/projectQueryArgs";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { cardStyle } from "../theme";
import { useTheme } from "../contexts/ThemeContext";
import { safetyJobSummaryHref } from "./projectDetail/projectSectionPaths";

const CENTRAL_TIMEZONE = "America/Chicago";

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

function formatDayKey(dayKey: number) {
  return new Date(dayKey).toLocaleDateString(undefined, { timeZone: "UTC" });
}

function formatSignedAtCT(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    timeZone: CENTRAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

type VisitStatus = "on_site" | "complete" | "in_only" | "out_only";

function visitStatusLabel(status: VisitStatus) {
  switch (status) {
    case "on_site":
      return "On site";
    case "complete":
      return "Complete";
    case "in_only":
      return "In only";
    case "out_only":
      return "Out only";
  }
}

function visitStatusStyle(status: VisitStatus): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    padding: "0.15rem 0.5rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
  switch (status) {
    case "on_site":
      return { ...base, backgroundColor: "rgba(16,185,129,0.15)", color: "#059669" };
    case "complete":
      return { ...base, backgroundColor: "rgba(107,114,128,0.12)", color: "var(--text-secondary)" };
    case "in_only":
      return { ...base, backgroundColor: "rgba(59,130,246,0.12)", color: "#2563eb" };
    case "out_only":
      return { ...base, backgroundColor: "rgba(245,158,11,0.15)", color: "#b45309" };
  }
}

export function SafetyProjectJobSignInOutLogs() {
  const { projectId } = useParams<{ projectId: string }>();
  const { theme } = useTheme();
  const textColor = theme === "dark" ? "#ffffff" : "#111827";
  const mutedColor = "var(--text-secondary)";

  const todayDayKey = useCentralDayKey();
  const prevTodayDayKeyRef = useRef(todayDayKey);
  const [selectedDayKey, setSelectedDayKey] = useState<number>(todayDayKey);

  useEffect(() => {
    const prev = prevTodayDayKeyRef.current;
    if (selectedDayKey === prev) setSelectedDayKey(todayDayKey);
    prevTodayDayKeyRef.current = todayDayKey;
  }, [todayDayKey, selectedDayKey]);

  const project = useQuery(api.projects.getProjectById, projectQueryArgs(projectId));
  const historyDays = useQuery(
    api.safety.listJobAttendanceHistoryDays,
    withProjectId(projectId, { limitDays: 60 }),
  );
  const visitRows = useQuery(
    api.safety.listJobAttendanceVisitsByProjectDay,
    withProjectId(projectId, { dayKey: selectedDayKey }),
  );
  const historyOptions = useMemo(() => {
    const rows = historyDays ?? [];
    const withoutToday = rows.filter((r: any) => r.dayKey !== todayDayKey);
    const todayRow = rows.find((r: any) => r.dayKey === todayDayKey);
    return [
      {
        dayKey: todayDayKey,
        label: `Today${todayRow ? ` (${todayRow.count})` : ""}`,
      },
      ...withoutToday.map((r: any) => ({
        dayKey: r.dayKey,
        label: `${formatDayKey(r.dayKey)} (${r.count})`,
      })),
    ];
  }, [historyDays, todayDayKey]);

  if (projectId == null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Missing project.</p>
      </div>
    );
  }

  if (project === undefined || historyDays === undefined || visitRows === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (project === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
        <p>Project not found.</p>
        <Link to={safetyJobSummaryHref(projectId)} style={{ color: textColor }}>
          Back to safety summary
        </Link>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", color: textColor }}>
      <Link
        to={safetyJobSummaryHref(projectId)}
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          fontSize: "0.875rem",
          color: textColor,
          textDecoration: "none",
        }}
      >
        {"<-"} Back to safety summary
      </Link>

      <h1 className="page-title" style={{ color: textColor }}>
        Trade & site super sign-in/out logs
      </h1>
      <p style={{ fontSize: "0.875rem", marginBottom: "1.5rem", color: mutedColor }}>Project: {project.name}</p>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: "0.25rem" }}>Daily log</div>
            <div style={{ color: mutedColor, fontSize: "0.875rem" }}>Review sign-in/sign-out for a day.</div>
          </div>
          <div style={{ minWidth: "16rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", fontWeight: 600 }}>
              Date
            </label>
            <select
              value={selectedDayKey}
              onChange={(e) => setSelectedDayKey(Number(e.target.value))}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border-subtle)",
                backgroundColor: "var(--surface-panel)",
                color: "var(--text-primary)",
              }}
            >
              {historyOptions.map((o) => (
                <option key={o.dayKey} value={o.dayKey}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          {visitRows.length === 0 ? (
            <p style={{ color: mutedColor, fontSize: "0.875rem" }}>
              No sign-in/out entries for {formatDayKey(selectedDayKey)} yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: mutedColor }}>Name</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: mutedColor }}>Trade</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: mutedColor }}>Signed in</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: mutedColor }}>Signed out</th>
                    <th style={{ textAlign: "left", padding: "0.5rem", color: mutedColor }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visitRows.map((row, index) => (
                    <tr
                      key={`${row.subtradeId}||${row.workerName}||${row.signedInAt ?? ""}||${row.signedOutAt ?? ""}||${index}`}
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <td style={{ padding: "0.5rem", fontWeight: 600 }}>{row.workerName}</td>
                      <td style={{ padding: "0.5rem" }}>{row.tradeName}</td>
                      <td style={{ padding: "0.5rem", color: mutedColor, whiteSpace: "nowrap" }}>
                        {row.signedInAt ? formatSignedAtCT(row.signedInAt) : "-"}
                      </td>
                      <td style={{ padding: "0.5rem", color: mutedColor, whiteSpace: "nowrap" }}>
                        {row.signedOutAt ? formatSignedAtCT(row.signedOutAt) : "-"}
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        <span style={visitStatusStyle(row.status)}>{visitStatusLabel(row.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
