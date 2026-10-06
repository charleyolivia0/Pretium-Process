/** Team birthdays & work anniversaries expanded to local calendar days (same logic as Boardroom). */

export type MilestoneUserRow = {
  _id: string;
  name: string;
  birthdayAt?: number;
  employmentStartAt?: number;
};

export type MilestoneExpandedEntry = {
  _id: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  title?: string;
  requestedByName?: string;
};

function yearsBetween(fromTs: number, toTs: number): number {
  const from = new Date(fromTs);
  const to = new Date(toTs);
  let years = to.getFullYear() - from.getFullYear();
  const fromMonth = from.getMonth();
  const toMonth = to.getMonth();
  if (toMonth < fromMonth || (toMonth === fromMonth && to.getDate() < from.getDate())) {
    years -= 1;
  }
  return years;
}

export type MilestoneEntriesOptions = {
  /** When true, include work anniversaries from `employmentStartAt` (admin viewers only in the app). */
  includeEmploymentAnniversaries?: boolean;
};

/**
 * For each local midnight timestamp in `dayTimestamps`, add synthetic entries when month/day
 * matches a user's birthday. Optionally adds employment anniversaries (1+ full years).
 */
export function milestoneEntriesByDate(
  milestoneUsers: MilestoneUserRow[] | undefined,
  dayTimestamps: number[],
  options?: MilestoneEntriesOptions
): Map<number, MilestoneExpandedEntry[]> {
  const includeEmploymentAnniversaries = options?.includeEmploymentAnniversaries === true;
  const map = new Map<number, MilestoneExpandedEntry[]>();
  if (!milestoneUsers?.length || !dayTimestamps.length) return map;

  for (const dateTs of dayTimestamps) {
    const cal = new Date(dateTs);
    const monthIdx = cal.getMonth();
    const dayNum = cal.getDate();

    for (const u of milestoneUsers) {
      if (u.birthdayAt) {
        const bd = new Date(u.birthdayAt);
        if (bd.getMonth() === monthIdx && bd.getDate() === dayNum) {
          const list = map.get(dateTs) ?? [];
          list.push({
            _id: `milestone-birthday-${u._id}-${dateTs}`,
            date: dateTs,
            startTimeMinutes: 9 * 60,
            durationMinutes: 30,
            title: `${u.name} birthday`,
            requestedByName: u.name,
          });
          map.set(dateTs, list);
        }
      }
      if (includeEmploymentAnniversaries && u.employmentStartAt) {
        const em = new Date(u.employmentStartAt);
        if (em.getMonth() === monthIdx && em.getDate() === dayNum) {
          const fullYears = yearsBetween(u.employmentStartAt, dateTs);
          if (fullYears >= 1) {
            const list = map.get(dateTs) ?? [];
            list.push({
              _id: `milestone-anniversary-${u._id}-${dateTs}`,
              date: dateTs,
              startTimeMinutes: 9 * 60 + 15,
              durationMinutes: 30,
              title: `${u.name} ${fullYears} years anniversary`,
              requestedByName: u.name,
            });
            map.set(dateTs, list);
          }
        }
      }
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);
  }
  return map;
}
