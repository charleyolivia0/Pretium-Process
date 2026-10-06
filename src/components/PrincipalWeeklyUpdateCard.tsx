import { useQuery, useAction, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { shellCardStyle, innerWhiteCardStyle } from "../theme";
import { formatWeekLabel, currentWeekStart } from "../lib/weekUtils";

const SUMMARY_PREVIEW_CHARS = 420;

export function PrincipalWeeklyUpdateCard() {
  const weekStart = currentWeekStart();
  const brief = useQuery(api.weeklyDigest.getPrincipalWeeklyBrief, { weekStart });
  const draft = useQuery(api.weeklyDigest.getWeeklySummaryDraft, { weekStart });
  const generateBrief = useAction(api.weeklyDigest.generatePrincipalWeeklyBrief);
  const saveAiSummary = useMutation(api.weeklyDigest.saveAiWeeklySummary);

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const requestIdRef = useRef(0);
  const initWeekRef = useRef<number | null>(null);

  const hasActivity =
    brief?.projects.some(
      (p) =>
        p.dailyReports.length > 0 ||
        p.priorWeekReports.length > 0 ||
        p.healthStatus === "amber" ||
        p.healthStatus === "red" ||
        p.overdueTaskCount > 0
    ) ?? false;

  useEffect(() => {
    if (brief === undefined || draft === undefined) return;

    const isNewWeek = initWeekRef.current !== weekStart;
    if (!isNewWeek) return;

    initWeekRef.current = weekStart;

    if (draft) {
      setSummary(draft.summaryText);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    if (!hasActivity) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    const id = ++requestIdRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    generateBrief({ weekStart })
      .then(async (r) => {
        if (id !== requestIdRef.current) return;
        const text = r.summary ?? null;
        setSummary(text);
        setSummaryError(r.error ?? null);
        if (text) {
          await saveAiSummary({ weekStart, summaryText: text });
        }
      })
      .catch((e) => {
        if (id !== requestIdRef.current) return;
        setSummaryError(e?.message ?? "Failed to generate summary");
        setSummary(null);
      })
      .finally(() => {
        if (id === requestIdRef.current) setSummaryLoading(false);
      });
  }, [brief, weekStart, draft, hasActivity, generateBrief, saveAiSummary]);

  const projectCount = brief?.projects.length ?? 0;
  const missingReports = brief?.projects.filter((p) => p.reportCount === 0).length ?? 0;
  const totalOverdue = brief?.projects.reduce((sum, p) => sum + p.overdueTaskCount, 0) ?? 0;

  const summaryPreview =
    summary && summary.length > SUMMARY_PREVIEW_CHARS
      ? summary.slice(0, SUMMARY_PREVIEW_CHARS).trimEnd() + "…"
      : summary;

  return (
    <div style={shellCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f9fafb", margin: 0 }}>Weekly Update</h2>
        {brief && (
          <span style={{ fontSize: "0.78rem", color: "#d1fae5" }}>{formatWeekLabel(brief.weekStart)}</span>
        )}
      </div>
      <p style={{ fontSize: "0.8rem", color: "#d1fae5", margin: "0 0 0.75rem 0" }}>
        All projects — behind schedule, outstanding items, and what did not get done last week.
      </p>

      <div style={{ ...innerWhiteCardStyle, padding: "0.75rem 0.85rem" }}>
        {brief === undefined ? (
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)" }}>Loading weekly update…</p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.78rem" }}>
              <span style={{ padding: "0.2rem 0.5rem", borderRadius: "999px", backgroundColor: "var(--surface-muted)", color: "var(--text-secondary)" }}>
                {projectCount} project{projectCount !== 1 ? "s" : ""}
              </span>
              {missingReports > 0 && (
                <span style={{ padding: "0.2rem 0.5rem", borderRadius: "999px", backgroundColor: "#fef3c7", color: "#92400e" }}>
                  {missingReports} missing report{missingReports !== 1 ? "s" : ""}
                </span>
              )}
              {totalOverdue > 0 && (
                <span style={{ padding: "0.2rem 0.5rem", borderRadius: "999px", backgroundColor: "#fee2e2", color: "#991b1b" }}>
                  {totalOverdue} overdue task{totalOverdue !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {summaryLoading && (
              <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>Generating summary…</p>
            )}
            {summaryError && !summaryLoading && (
              <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.84rem", color: "#b91c1c" }}>{summaryError}</p>
            )}
            {summaryPreview && !summaryLoading && (
              <div
                style={{
                  fontSize: "0.84rem",
                  color: "var(--text-primary)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  marginBottom: "0.75rem",
                  maxHeight: "7.5rem",
                  overflow: "hidden",
                }}
              >
                {summaryPreview}
              </div>
            )}
            {!hasActivity && !summaryLoading && !draft && (
              <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                No daily reports or flagged issues for this week.
              </p>
            )}

            <Link
              to="/weekly"
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "#059669",
                textDecoration: "none",
              }}
            >
              View full weekly update →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
