export type CalendarEventType = "personal" | "boardroom" | "milestone";

type CalendarEventBase = {
  _id: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
};

type CalendarEventMapArgs<
  TPersonal extends CalendarEventBase,
  TBoardroom extends CalendarEventBase,
  TMilestone extends CalendarEventBase,
> = {
  personalEvents?: TPersonal[];
  boardroomEvents?: TBoardroom[];
  milestoneByDate?: Map<number, TMilestone[]>;
};

export type CalendarEventMapItem<
  TPersonal extends CalendarEventBase,
  TBoardroom extends CalendarEventBase,
  TMilestone extends CalendarEventBase,
> =
  | (TPersonal & { calendarEventType: "personal" })
  | (TBoardroom & { calendarEventType: "boardroom" })
  | (TMilestone & { calendarEventType: "milestone" });

export function buildCalendarEventsByDate<
  TPersonal extends CalendarEventBase,
  TBoardroom extends CalendarEventBase,
  TMilestone extends CalendarEventBase,
>({
  personalEvents,
  boardroomEvents,
  milestoneByDate,
}: CalendarEventMapArgs<TPersonal, TBoardroom, TMilestone>): Map<number, CalendarEventMapItem<TPersonal, TBoardroom, TMilestone>[]> {
  const map = new Map<number, CalendarEventMapItem<TPersonal, TBoardroom, TMilestone>[]>();

  for (const event of personalEvents ?? []) {
    const list = map.get(event.date) ?? [];
    list.push({ ...event, calendarEventType: "personal" });
    map.set(event.date, list);
  }

  for (const event of boardroomEvents ?? []) {
    const list = map.get(event.date) ?? [];
    list.push({ ...event, calendarEventType: "boardroom" });
    map.set(event.date, list);
  }

  for (const [dateTs, entries] of milestoneByDate ?? []) {
    const list = map.get(dateTs) ?? [];
    for (const entry of entries) {
      list.push({ ...entry, calendarEventType: "milestone" });
    }
    map.set(dateTs, list);
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);
  }

  return map;
}
