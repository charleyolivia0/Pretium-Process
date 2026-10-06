import type { CSSProperties } from "react";

/**
 * Shared theme tokens for consistent dimension and elevation across the app.
 */

export const cardStyle: CSSProperties = {
  padding: "1.25rem",
  borderRadius: "0.75rem",
  backgroundColor: "var(--surface-card)",
  color: "var(--text-primary)",
  boxShadow: "var(--shadow-surface)",
  border: "1px solid var(--border-subtle)",
};

/** Primary action button: solid + shadow */
export const primaryButtonStyle: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.75rem",
  fontWeight: 600,
  fontFamily: "Montserrat, sans-serif",
  backgroundColor: "var(--color-emerald-500)",
  color: "#fff",
  border: "1px solid rgba(2, 44, 34, 0.5)",
  boxShadow: "0 4px 14px rgba(2, 44, 34, 0.35)",
  cursor: "pointer",
};

/** Secondary/outline button */
export const secondaryButtonStyle: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.75rem",
  fontWeight: 500,
  fontFamily: "Montserrat, sans-serif",
  backgroundColor: "var(--surface-panel)",
  color: "var(--text-primary)",
  border: "1px solid rgba(5, 150, 105, 0.3)",
  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.06)",
  cursor: "pointer",
};

/** Card with top accent strip (emerald) */
export const cardWithAccentStyle: CSSProperties = {
  ...cardStyle,
  borderTop: "4px solid var(--color-emerald-500)",
};

/** Green section/shell card (emerald bg, white text) - use for page section headers */
export const shellCardStyle: CSSProperties = {
  ...cardStyle,
  backgroundColor: "var(--color-emerald-600)",
  border: "1px solid var(--color-emerald-800)",
  color: "#ffffff",
};

/** White inner card (use inside shell or on light background) */
export const innerWhiteCardStyle: CSSProperties = {
  ...cardStyle,
  backgroundColor: "var(--surface-card)",
  border: "1px solid var(--border-strong)",
};

/** Section title on emerald shell cards (Admin dashboard, Social Media, etc.) */
export const widgetTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "#a7f3d0",
  textTransform: "uppercase",
};
