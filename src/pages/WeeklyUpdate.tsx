import { useQuery, useAction, useMutation } from "convex/react";
import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { cardStyle } from "../theme";
import { lastCompletedWeekStart, formatWeekLabel, parseWeekStartParam, currentWeekStart } from "../lib/weekUtils";
import {
  copyWeeklyUpdateToClipboard,
  downloadWeeklyUpdatePdf,
  downloadWeeklyUpdateTxt,
} from "../lib/weeklyUpdateExport";

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

function healthBadgeColor(status?: string) {
  if (status === "red") return { bg: "#fee2e2", color: "#991b1b" };
  if (status === "amber") return { bg: "#fef3c7", color: "#92400e" };
  return null;
}

function ProjectPriorWeekSection({
  priorWeekReports,
  projectId,
}: {
  priorWeekReports: { _id: string; dueDate: number; title: string; description?: string }[];
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (priorWeekReports.length === 0) return null;

  return (
    <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.65rem" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--text-secondary)",
          cursor: "pointer",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        {expanded ? "Hide" : "Show"} prior week ({priorWeekReports.length} report{priorWeekReports.length !== 1 ? "s" : ""})
      </button>
      {expanded && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {priorWeekReports.map((report) => {
            const short =
              report.description && report.description.length > 100
                ? report.description.slice(0, 97).trimEnd() + "..."
                : report.description ?? "";
            return (
              <li key={report._id}>
                <Link
                  to={`/projects/${projectId}/daily-report/${report._id}`}
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    padding: "0.35rem 0.5rem",
                    borderRadius: "0.4rem",
                    backgroundColor: "var(--surface-muted)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)", marginRight: "0.5rem" }}>{formatDate(report.dueDate)}</span>
                  {report.title}
                  {short && <span style={{ color: "var(--text-secondary)" }}> — {short}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  padding: "0.35rem 0.65rem",
  borderRadius: "0.4rem",
  border: "1px solid var(--border-subtle)",
  backgroundColor: "var(--surface-panel)",
  color: "var(--text-primary)",
  fontSize: "0.8125rem",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
};

const primaryBtnStyle: React.CSSProperties = {
  ...toolbarBtnStyle,
  border: "1px solid #059669",
  backgroundColor: "#059669",
  color: "#fff",
};

export function WeeklyUpdate() {
  const [searchParams] = useSearchParams();

  const projectId = searchParams.get("projectId");

  const weekStartFromUrl = parseWeekStartParam(searchParams.get("weekStart"));
  const [selectedWeekStart, setSelectedWeekStart] = useState<number>(() => {
    return weekStartFromUrl ?? currentWeekStart();
  });

  const thisWeekStart = currentWeekStart();
  const lastWeekStart = lastCompletedWeekStart();
  const weekStart = selectedWeekStart;
  const weekLabel = formatWeekLabel(weekStart);

  const brief = useQuery(api.weeklyDigest.getPrincipalWeeklyBrief, { weekStart });
  const draft = useQuery(api.weeklyDigest.getWeeklySummaryDraft, { weekStart });
  const generateBrief = useAction(api.weeklyDigest.generatePrincipalWeeklyBrief);
  const saveDraft = useMutation(api.weeklyDigest.saveWeeklySummaryDraft);
  const saveAiSummary = useMutation(api.weeklyDigest.saveAiWeeklySummary);

  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedBaseline, setSavedBaseline] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const requestIdRef = useRef(0);
  const initWeekRef = useRef<number | null>(null);

  useEffect(() => {
    const parsed = parseWeekStartParam(searchParams.get("weekStart"));
    const targetWeek = parsed ?? currentWeekStart();
    setSelectedWeekStart((prev) => {
      if (prev === targetWeek) return prev;
      initWeekRef.current = null;
      return targetWeek;
    });
  }, [searchParams]);

  const hasActivity =
    brief?.projects.some(
      (p) =>
        p.dailyReports.length > 0 ||
        p.priorWeekReports.length > 0 ||
        p.healthStatus === "amber" ||
        p.healthStatus === "red" ||
        p.overdueTaskCount > 0
    ) ?? false;

  const showSummaryEditor = hasActivity || draft != null || summary.length > 0;

  const persistDraft = useCallback(
    async (text: string) => {
      setSaveStatus("saving");
      setSaveError(null);
      try {
        await saveDraft({ weekStart, summaryText: text });
        setSavedBaseline(text);
        setDirty(false);
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
        setSaveError(e instanceof Error ? e.message : "Failed to save");
      }
    },
    [saveDraft, weekStart]
  );

  useEffect(() => {
    if (brief === undefined || draft === undefined) return;

    const isNewWeek = initWeekRef.current !== weekStart;
    if (!isNewWeek) return;

    initWeekRef.current = weekStart;
    setDirty(false);
    setSaveStatus("idle");
    setSaveError(null);
    setSummaryError(null);

    if (draft) {
      setSummary(draft.summaryText);
      setSavedBaseline(draft.summaryText);
      setSummaryLoading(false);
      return;
    }

    if (!hasActivity) {
      setSummary("");
      setSavedBaseline("");
      setSummaryLoading(false);
      return;
    }

    const id = ++requestIdRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    generateBrief({ weekStart })
      .then(async (r) => {
        if (id !== requestIdRef.current) return;
        const text = r.summary ?? "";
        setSummary(text);
        setSavedBaseline(text);
        setSummaryError(r.error ?? null);
        if (text) {
          await saveAiSummary({ weekStart, summaryText: text });
        }
      })
      .catch((e) => {
        if (id !== requestIdRef.current) return;
        setSummaryError(e?.message ?? "Failed to generate summary");
      })
      .finally(() => {
        if (id === requestIdRef.current) setSummaryLoading(false);
      });
  }, [weekStart, hasActivity, generateBrief, brief, draft, saveAiSummary]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void persistDraft(summary);
    }, 1500);
    return () => clearTimeout(t);
  }, [summary, dirty, persistDraft]);

  const changeWeek = useCallback(
    (newWeekStart: number) => {
      if (dirty && !window.confirm("You have unsaved edits. Switch weeks anyway?")) return;
      initWeekRef.current = null;
      setSelectedWeekStart(newWeekStart);
    },
    [dirty]
  );

  const handleSummaryChange = (value: string) => {
    setSummary(value);
    setDirty(value !== savedBaseline);
    if (saveStatus === "saved") setSaveStatus("idle");
  };

  const handleSave = () => {
    void persistDraft(summary);
  };

  const handleRegenerate = async () => {
    const needsConfirm = dirty || (summary !== (draft?.aiGeneratedText ?? savedBaseline) && summary.length > 0);
    if (needsConfirm && !window.confirm("This replaces the saved summary for everyone. Continue?")) return;

    const id = ++requestIdRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const r = await generateBrief({ weekStart });
      if (id !== requestIdRef.current) return;
      const text = r.summary ?? "";
      setSummary(text);
      setSavedBaseline(text);
      setDirty(false);
      setSummaryError(r.error ?? null);
      if (text) {
        await saveAiSummary({ weekStart, summaryText: text });
        setSaveStatus("saved");
      }
    } catch (e) {
      if (id !== requestIdRef.current) return;
      setSummaryError(e instanceof Error ? e.message : "Failed to regenerate summary");
    } finally {
      if (id === requestIdRef.current) setSummaryLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await copyWeeklyUpdateToClipboard(summary);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      setSaveError("Could not copy to clipboard");
    }
  };

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", padding: "1.25rem", maxWidth: "56rem", margin: "0 auto" }}>
      {projectId ? (
        <Link
          to={`/projects/${projectId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            marginBottom: "0.85rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#059669",
            textDecoration: "none",
          }}
        >
          {"<-"} Back to project summary
        </Link>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "baseline",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 0 }}>
          Weekly update
        </h1>
      </div>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Daily reports from all projects for the selected week — behind schedule, outstanding items, and prior-week gaps.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => changeWeek(weekStart - 7 * 24 * 60 * 60 * 1000)}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--surface-panel)",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            cursor: "pointer",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          {"<-"} Previous week
        </button>
        <span style={{ fontWeight: 600, color: "var(--text-primary)", minWidth: "12rem" }}>
          {weekLabel}
        </span>
        <button
          type="button"
          onClick={() => changeWeek(weekStart + 7 * 24 * 60 * 60 * 1000)}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--surface-panel)",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            cursor: "pointer",
            fontFamily: "Montserrat, sans-serif",
          }}
        >
          Next week {"->"}
        </button>
        {selectedWeekStart !== thisWeekStart && (
          <button
            type="button"
            onClick={() => changeWeek(thisWeekStart)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #059669",
              backgroundColor: "transparent",
              color: "#059669",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            This week
          </button>
        )}
        {selectedWeekStart !== lastWeekStart && (
          <button
            type="button"
            onClick={() => changeWeek(lastWeekStart)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--surface-panel)",
              color: "var(--text-primary)",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            Last completed week
          </button>
        )}
      </div>

      {brief === undefined ? (
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading...</p>
      ) : brief.projects.length === 0 ? (
        <div style={{ ...cardStyle, padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
          No projects available.
        </div>
      ) : (
        <>
          <div
            style={{
              ...cardStyle,
              marginBottom: "1.25rem",
              borderLeft: "4px solid #059669",
              backgroundColor: "var(--surface-panel)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Summary</h2>
              <Link to="/weekly-updates" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#059669", textDecoration: "none" }}>
                All weekly updates {"->"}
              </Link>
            </div>
            {!hasActivity && !summaryLoading && !draft && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                No daily reports or flagged issues for this week.
              </p>
            )}
            {summaryLoading && (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Generating summary...</p>
            )}
            {summaryError && !summaryLoading && (
              <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>{summaryError}</p>
            )}
            {showSummaryEditor && !summaryLoading && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.65rem", alignItems: "center" }}>
                  <button type="button" onClick={handleSave} disabled={!dirty || saveStatus === "saving"} style={primaryBtnStyle}>
                    Save
                  </button>
                  <button type="button" onClick={() => void handleRegenerate()} disabled={summaryLoading} style={toolbarBtnStyle}>
                    Regenerate
                  </button>
                  <button type="button" onClick={() => void handleCopy()} disabled={!summary.trim()} style={toolbarBtnStyle}>
                    {copyFeedback ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadWeeklyUpdateTxt(weekLabel, summary)}
                    disabled={!summary.trim()}
                    style={toolbarBtnStyle}
                  >
                    Download .txt
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadWeeklyUpdatePdf(weekLabel, summary)}
                    disabled={!summary.trim()}
                    style={toolbarBtnStyle}
                  >
                    Download PDF
                  </button>
                  {saveStatus === "saving" && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Saving…</span>
                  )}
                  {saveStatus === "saved" && !dirty && (
                    <span style={{ fontSize: "0.75rem", color: "#059669" }}>Saved</span>
                  )}
                  {saveStatus === "error" && saveError && (
                    <span style={{ fontSize: "0.75rem", color: "#b91c1c" }}>{saveError}</span>
                  )}
                </div>
                {draft && !dirty && (
                  <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem 0" }}>
                    Last saved by {draft.lastEditorName}
                    {draft.updatedAt ? ` · ${new Date(draft.updatedAt).toLocaleString()}` : ""}
                  </p>
                )}
                <textarea
                  value={summary}
                  onChange={(e) => handleSummaryChange(e.target.value)}
                  rows={14}
                  style={{
                    width: "100%",
                    minHeight: "12rem",
                    resize: "vertical",
                    fontSize: "0.9375rem",
                    color: "var(--text-primary)",
                    lineHeight: 1.6,
                    fontFamily: "Montserrat, sans-serif",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--surface-muted)",
                    boxSizing: "border-box",
                  }}
                />
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {brief.projects.map((project) => {
              const healthStyle = healthBadgeColor(project.healthStatus);
              return (
                <div key={project.projectId} style={cardStyle}>
                  <div style={{ marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                    <Link
                      to={`/projects/${project.projectId}`}
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 600,
                        color: "#059669",
                        textDecoration: "none",
                      }}
                    >
                      {project.name}
                    </Link>
                    {project.clientName && (
                      <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>- {project.clientName}</span>
                    )}
                    {healthStyle && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.45rem",
                          borderRadius: "999px",
                          backgroundColor: healthStyle.bg,
                          color: healthStyle.color,
                          textTransform: "capitalize",
                        }}
                      >
                        {project.healthStatus}
                      </span>
                    )}
                    {project.overdueTaskCount > 0 && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.15rem 0.45rem",
                          borderRadius: "999px",
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                        }}
                      >
                        {project.overdueTaskCount} overdue
                      </span>
                    )}
                  </div>

                  {project.dailyReports.length === 0 ? (
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
                      No daily reports filed this week.
                    </p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {project.dailyReports.map((report) => {
                        const short =
                          report.description && report.description.length > 120
                            ? report.description.slice(0, 117).trimEnd() + "..."
                            : report.description ?? "";
                        return (
                          <li key={report._id}>
                            <Link
                              to={`/projects/${project.projectId}/daily-report/${report._id}`}
                              style={{
                                display: "block",
                                padding: "0.5rem 0.75rem",
                                borderRadius: "0.5rem",
                                border: "1px solid var(--border-subtle)",
                                backgroundColor: "var(--surface-panel)",
                                textDecoration: "none",
                                color: "inherit",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                  {formatDate(report.dueDate)}
                                </span>
                                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{report.title}</span>
                                <span style={{ fontSize: "0.75rem", color: "#059669" }}>View report {"->"}</span>
                              </div>
                              {short && (
                                <div
                                  style={{
                                    fontSize: "0.8125rem",
                                    color: "var(--text-secondary)",
                                    marginTop: "0.25rem",
                                    paddingLeft: "0.25rem",
                                  }}
                                >
                                  {short}
                                </div>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <ProjectPriorWeekSection
                    priorWeekReports={project.priorWeekReports}
                    projectId={project.projectId}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
