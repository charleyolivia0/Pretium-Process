import type { CSSProperties } from "react";

/** Neutral greens — same palette as project summary Task status pie chart. */
export const TASK_STATUS_SUMMARY_COLORS = {
  done: "#3f6f62",
  inProgress: "#6f9b8f",
  planning: "#c7d8d2",
  overdue: "#2f5148",
} as const;

export type TaskSpreadsheetStatusKey = "planning" | "in_progress" | "complete" | "overdue";

const TEXT_ON_LIGHT = "#0f172a";
const TEXT_ON_DARK = "#f8fafc";

export function taskSpreadsheetStatusSelectStyle(statusKey: TaskSpreadsheetStatusKey): CSSProperties {
  switch (statusKey) {
    case "planning":
      return {
        backgroundColor: TASK_STATUS_SUMMARY_COLORS.planning,
        color: TEXT_ON_LIGHT,
        border: `1px solid ${TASK_STATUS_SUMMARY_COLORS.planning}`,
        borderRadius: "0.35rem",
        padding: "0.28rem 0.4rem",
      };
    case "in_progress":
      return {
        backgroundColor: TASK_STATUS_SUMMARY_COLORS.inProgress,
        color: TEXT_ON_DARK,
        border: `1px solid ${TASK_STATUS_SUMMARY_COLORS.inProgress}`,
        borderRadius: "0.35rem",
        padding: "0.28rem 0.4rem",
      };
    case "complete":
      return {
        backgroundColor: TASK_STATUS_SUMMARY_COLORS.done,
        color: TEXT_ON_DARK,
        border: `1px solid ${TASK_STATUS_SUMMARY_COLORS.done}`,
        borderRadius: "0.35rem",
        padding: "0.28rem 0.4rem",
      };
    case "overdue":
      return {
        backgroundColor: TASK_STATUS_SUMMARY_COLORS.overdue,
        color: TEXT_ON_DARK,
        border: `1px solid ${TASK_STATUS_SUMMARY_COLORS.overdue}`,
        borderRadius: "0.35rem",
        padding: "0.28rem 0.4rem",
      };
    default:
      return { borderRadius: "0.35rem", padding: "0.28rem 0.4rem" };
  }
}
