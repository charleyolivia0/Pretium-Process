/** America/Chicago — same as job attendance / safety grouping. */
export const CENTRAL_TIMEZONE = "America/Chicago";

export function getTimeZoneDateParts(ts: number) {
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

/**
 * Stable numeric key for the CT calendar date (UTC midnight of Y-M-D parts).
 */
export function getDayKeyCentral(ts: number) {
  const { year, month, day } = getTimeZoneDateParts(ts);
  return Date.UTC(year, month - 1, day);
}

export function getWeekdayCentral(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIMEZONE,
    weekday: "short",
  }).format(new Date(ts));
}

export function getTimeZoneDateTimeParts(ts: number) {
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

export function zonedTimeToEpochMillis(params: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
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

export function getMinuteOfDayCentral(ts: number) {
  const parts = getTimeZoneDateTimeParts(ts);
  return parts.hour * 60 + parts.minute;
}

export function expectedInFromDayKeyAndMinute(dayKey: number, minuteOfDay: number) {
  const d = new Date(dayKey);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return zonedTimeToEpochMillis({ year, month, day, hour, minute });
}

export const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Monday 00:00 America/Chicago for the week containing `ts`. */
export function startOfWeekCentral(ts: number): number {
  const dayIndex = WEEKDAY_INDEX[getWeekdayCentral(ts)] ?? 0;
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  const { year, month, day } = getTimeZoneDateParts(ts);
  const mondayDate = new Date(Date.UTC(year, month - 1, day + mondayOffset));
  return zonedTimeToEpochMillis({
    year: mondayDate.getUTCFullYear(),
    month: mondayDate.getUTCMonth() + 1,
    day: mondayDate.getUTCDate(),
    hour: 0,
    minute: 0,
  });
}

/** Exclusive end of the CT week containing `ts`. */
export function endOfWeekCentral(ts: number): number {
  return startOfWeekCentral(ts) + 7 * DAY_MS;
}

/** Monday 00:00 CT for the current week. */
export function currentWeekStartCentral(): number {
  return startOfWeekCentral(Date.now());
}

/** Monday 00:00 CT for the last fully completed week. */
export function lastCompletedWeekStartCentral(): number {
  return startOfWeekCentral(Date.now()) - 7 * DAY_MS;
}

/** Today 00:00 America/Chicago. */
export function startOfTodayCentral(ts: number = Date.now()): number {
  const { year, month, day } = getTimeZoneDateParts(ts);
  return zonedTimeToEpochMillis({ year, month, day, hour: 0, minute: 0 });
}

/** Tomorrow 00:00 America/Chicago (exclusive end of today). */
export function endOfTodayCentral(ts: number = Date.now()): number {
  return startOfTodayCentral(ts) + DAY_MS;
}

/** Calendar day key for an arbitrary epoch ms in CT (for due dates stored as local-ish midnights). */
export function dueTimestampToDayKeyCentral(dueMs: number) {
  return getDayKeyCentral(dueMs);
}

/** Whole calendar days from `fromDayKey` to `toDayKey` (can be negative). */
export function wholeDaysBetweenDayKeys(fromDayKey: number, toDayKey: number) {
  return Math.round((toDayKey - fromDayKey) / DAY_MS);
}
