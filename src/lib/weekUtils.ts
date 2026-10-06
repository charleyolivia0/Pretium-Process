import {
  CENTRAL_TIMEZONE,
  currentWeekStartCentral,
  endOfWeekCentral,
  lastCompletedWeekStartCentral,
  startOfWeekCentral,
} from "./centralTime";

/** Monday 00:00 America/Chicago for the week containing `ts`. */
export function startOfWeek(ts: number): number {
  return startOfWeekCentral(ts);
}

/** Week containing today (Central Time). */
export function currentWeekStart(): number {
  return currentWeekStartCentral();
}

/** Parse ?weekStart= from the URL; returns null when missing or invalid. Normalizes to CT Monday. */
export function parseWeekStartParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return startOfWeekCentral(n);
}

/** End of week = start of next week (exclusive), Central Time. */
export function endOfWeek(ts: number): number {
  return endOfWeekCentral(ts);
}

/** Monday 00:00 CT of the last fully completed week. */
export function lastCompletedWeekStart(): number {
  return lastCompletedWeekStartCentral();
}

const dateLabelOpts: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: CENTRAL_TIMEZONE,
};

export function formatWeekLabel(weekStart: number): string {
  const end = weekStart + 6 * 24 * 60 * 60 * 1000;
  return `${new Date(weekStart).toLocaleDateString(undefined, dateLabelOpts)} - ${new Date(end).toLocaleDateString(undefined, dateLabelOpts)}`;
}
