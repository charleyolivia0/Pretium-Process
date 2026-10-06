import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { cardStyle } from "../theme";
import { formatWeekLabel } from "../lib/weekUtils";

export function WeeklyUpdatesList() {
  const listData = useQuery(api.weeklyDigest.listWeeklyUpdateWeeks, { limit: 30 });
  /** Query returns `{ weekStarts }`, not a raw array. */
  const weekStarts = listData === undefined ? undefined : (listData.weekStarts ?? []);

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", padding: "1.25rem", maxWidth: "56rem", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 0 }}>Weekly updates</h1>
        <Link
          to="/weekly"
          style={{ fontSize: "0.875rem", fontWeight: 600, color: "#059669", textDecoration: "none" }}
        >
          Back to current week {"->"}
        </Link>
      </div>

      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Pick a week to view the weekly digest of daily reports.
      </p>

      <div style={{ ...cardStyle, padding: "1.25rem" }}>
        {weekStarts === undefined ? (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading...</p>
        ) : weekStarts.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            No weekly updates found yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {weekStarts.map((ws) => (
              <li key={ws}>
                <Link
                  to={`/weekly?weekStart=${ws}`}
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
                  <span style={{ fontWeight: 600, color: "#059669" }}>{formatWeekLabel(ws)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

