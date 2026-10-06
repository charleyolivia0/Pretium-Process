/** Stored on each personal event; keys unchanged for existing Convex documents. */
export type PersonalCalendarColorPreset = "emerald" | "blue" | "amber";

export type PersonalEventChipColors = {
  backgroundColor: string;
  color: string;
  iconBackgroundColor: string;
  iconColor: string;
};

const PAST_DAY: PersonalEventChipColors = {
  backgroundColor: "#cbd5e1",
  color: "#334155",
  iconBackgroundColor: "#64748b",
  iconColor: "#ecfdf5",
};

/** Personal event option 1: sage */
const PRESET_SAGE: PersonalEventChipColors = {
  backgroundColor: "#e8f0e9",
  color: "#2f4a38",
  iconBackgroundColor: "#6b8f71",
  iconColor: "#f4faf5",
};

/** Personal event option 2: darker green */
const PRESET_DARK_GREEN: PersonalEventChipColors = {
  backgroundColor: "#d8ede0",
  color: "#0f3d24",
  iconBackgroundColor: "#166534",
  iconColor: "#ecfdf5",
};

/** Personal event option 3: red */
const PRESET_RED: PersonalEventChipColors = {
  backgroundColor: "#fef2f2",
  color: "#7f1d1d",
  iconBackgroundColor: "#dc2626",
  iconColor: "#fff7f7",
};

const PRESET_COLORS: Record<PersonalCalendarColorPreset, PersonalEventChipColors> = {
  emerald: PRESET_SAGE,
  blue: PRESET_DARK_GREEN,
  amber: PRESET_RED,
};

/** Boardroom rows on combined calendars (unchanged blue family). */
export const BOARDROOM_CALENDAR_CHIP_COLORS: PersonalEventChipColors = {
  backgroundColor: "#dbeafe",
  color: "#1e3a8a",
  iconBackgroundColor: "#2563eb",
  iconColor: "#eff6ff",
};

/** Milestone rows on combined calendars (unchanged amber family). */
export const MILESTONE_CALENDAR_CHIP_COLORS: PersonalEventChipColors = {
  backgroundColor: "#fef3c7",
  color: "#92400e",
  iconBackgroundColor: "#d97706",
  iconColor: "#fff7ed",
};

export const PERSONAL_CALENDAR_COLOR_PRESETS: readonly {
  id: PersonalCalendarColorPreset;
  label: string;
}[] = [
  { id: "emerald", label: "Sage green" },
  { id: "blue", label: "Dark green" },
  { id: "amber", label: "Red" },
] as const;

export function getPersonalEventChipColors(
  preset: PersonalCalendarColorPreset | undefined,
  isPastDay: boolean
): PersonalEventChipColors {
  if (isPastDay) return PAST_DAY;
  return PRESET_COLORS[preset ?? "emerald"];
}

export function getBoardroomCalendarChipColors(isPastDay: boolean): PersonalEventChipColors {
  if (isPastDay) return PAST_DAY;
  return BOARDROOM_CALENDAR_CHIP_COLORS;
}

export function getMilestoneCalendarChipColors(isPastDay: boolean): PersonalEventChipColors {
  if (isPastDay) return PAST_DAY;
  return MILESTONE_CALENDAR_CHIP_COLORS;
}
