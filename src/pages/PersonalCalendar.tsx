import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LogoMark } from "../components/LogoMark";
import { CalendarPlusIcon } from "../components/CalendarPlusIcon";
import { cardStyle, innerWhiteCardStyle, primaryButtonStyle, secondaryButtonStyle, shellCardStyle } from "../theme";
import { milestoneEntriesByDate } from "../utils/calendarMilestones";
import {
  getBoardroomCalendarChipColors,
  getMilestoneCalendarChipColors,
  getPersonalEventChipColors,
  PERSONAL_CALENDAR_COLOR_PRESETS,
  type PersonalCalendarColorPreset,
} from "../utils/personalCalendarColorPresets";
import { buildCalendarEventsByDate, type CalendarEventMapItem } from "../utils/calendarEventsByDate";
import { useIsMobile } from "../hooks/useIsMobile";

function startOfDayLocal(year: number, month: number, day: number): number {
  return new Date(year, month, day).setHours(0, 0, 0, 0);
}

function toDateInputValue(dateTs: number): string {
  const d = new Date(dateTs);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateInput(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return startOfDayLocal(y, (m ?? 1) - 1, d ?? 1);
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDayHeading(dateTs: number): string {
  return new Date(dateTs).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(startMinutes: number, durationMinutes: number): string {
  return `${formatTime(startMinutes)} – ${formatTime(startMinutes + durationMinutes)}`;
}

function calendarEventTypeLabel(item: CalendarEventItem): string {
  if (item.calendarEventType === "personal") return "Personal";
  if (item.calendarEventType === "boardroom") return "Boardroom";
  return "Milestone";
}

function parseTimeInput(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

type PersonalCalendarEvent = {
  _id: Id<"personalCalendarEvents">;
  title: string;
  description?: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  colorPreset?: PersonalCalendarColorPreset;
};

type BoardroomCalendarEvent = {
  _id: Id<"boardroomBookings">;
  title?: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  requestedByName?: string;
};

type MilestoneCalendarEvent = {
  _id: string;
  title?: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  requestedByName?: string;
};

type CalendarEventItem = CalendarEventMapItem<PersonalCalendarEvent, BoardroomCalendarEvent, MilestoneCalendarEvent>;

function calendarItemChipColors(item: CalendarEventItem, isPastDay: boolean) {
  if (item.calendarEventType === "personal") {
    return getPersonalEventChipColors(item.colorPreset, isPastDay);
  }
  if (item.calendarEventType === "milestone") {
    return getMilestoneCalendarChipColors(isPastDay);
  }
  return getBoardroomCalendarChipColors(isPastDay);
}

export function PersonalCalendar() {
  const isMobile = useIsMobile(768);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDayScheduleModal, setShowDayScheduleModal] = useState(false);
  const [selectedDayTs, setSelectedDayTs] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PersonalCalendarEvent | null>(null);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);

  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newDuration, setNewDuration] = useState(60);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColorPreset, setNewColorPreset] = useState<PersonalCalendarColorPreset>("emerald");
  const [addError, setAddError] = useState("");

  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("09:00");
  const [editDuration, setEditDuration] = useState(60);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColorPreset, setEditColorPreset] = useState<PersonalCalendarColorPreset>("emerald");
  const [editError, setEditError] = useState("");

  const now = new Date();
  const todayStart = startOfDayLocal(now.getFullYear(), now.getMonth(), now.getDate());
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const monthStart = startOfDayLocal(year, month, 1);
  const monthEnd = startOfDayLocal(year, month + 1, 0);

  const personalEvents = useQuery(api.personalCalendar.listMyEvents, {
    startDate: monthStart,
    endDate: monthEnd,
  });
  const boardroomEvents = useQuery(api.boardroom.listApprovedForCalendar, {
    startDate: monthStart,
    endDate: monthEnd,
  });
  const milestoneUsers = useQuery(api.boardroom.listMilestoneUsers, {});
  const user = useQuery(api.users.current);
  const createEvent = useMutation(api.personalCalendar.createMyEvent);
  const updateEvent = useMutation(api.personalCalendar.updateMyEvent);
  const deleteEvent = useMutation(api.personalCalendar.deleteMyEvent);

  const eventsByDate = useMemo(() => {
    const dayTimestamps = Array.from({ length: daysInMonth }, (_, i) => startOfDayLocal(year, month, i + 1));
    const milestoneByDate = milestoneEntriesByDate(milestoneUsers, dayTimestamps, {
      includeEmploymentAnniversaries: user?.role === "admin",
    });
    return buildCalendarEventsByDate({
      personalEvents: personalEvents as PersonalCalendarEvent[] | undefined,
      boardroomEvents: boardroomEvents as BoardroomCalendarEvent[] | undefined,
      milestoneByDate,
    });
  }, [personalEvents, boardroomEvents, milestoneUsers, year, month, daysInMonth, user?.role]);

  function openDayScheduleModal(dateTs: number) {
    setSelectedDayTs(dateTs);
    setShowDayScheduleModal(true);
  }

  function closeDayScheduleModal() {
    setShowDayScheduleModal(false);
    setSelectedDayTs(null);
  }

  function openEventFromDaySchedule(item: CalendarEventItem) {
    closeDayScheduleModal();
    openEventModal(item);
  }

  function openAddModalForSelectedDay() {
    if (selectedDayTs === null) return;
    setNewDate(toDateInputValue(selectedDayTs));
    setNewTime("09:00");
    setNewDuration(60);
    setNewTitle("");
    setNewDescription("");
    setNewColorPreset("emerald");
    setAddError("");
    closeDayScheduleModal();
    setShowAddModal(true);
  }

  function openAddModal() {
    const today = startOfDayLocal(now.getFullYear(), now.getMonth(), now.getDate());
    setNewDate(toDateInputValue(today));
    setNewTime("09:00");
    setNewDuration(60);
    setNewTitle("");
    setNewDescription("");
    setNewColorPreset("emerald");
    setAddError("");
    setShowAddModal(true);
  }

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    setAddError("");
    try {
      await createEvent({
        title: newTitle,
        description: newDescription.trim() ? newDescription : undefined,
        date: parseDateInput(newDate),
        startTimeMinutes: parseTimeInput(newTime),
        durationMinutes: newDuration,
        colorPreset: newColorPreset,
      });
      setShowAddModal(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add event");
    }
  }

  function openEventModal(item: CalendarEventItem) {
    setShowEventModal(true);
    if (item.calendarEventType === "boardroom") {
      setSelectedEvent(null);
      setEditColorPreset("emerald");
      setEditTitle(item.title?.trim() || "Boardroom booking");
      setEditDescription(`Boardroom event${item.requestedByName ? ` · Requested by ${item.requestedByName}` : ""}`);
      setEditDate(toDateInputValue(item.date));
      setEditTime(formatTime(item.startTimeMinutes));
      setEditDuration(item.durationMinutes);
      setEditError("Boardroom events are view-only here. Edit them from Board Room.");
      return;
    }
    if (item.calendarEventType === "milestone") {
      setSelectedEvent(null);
      setEditColorPreset("emerald");
      setEditTitle(item.title?.trim() || "Team milestone");
      setEditDescription(item.requestedByName ? `Team member: ${item.requestedByName}` : "Birthday or work anniversary");
      setEditDate(toDateInputValue(item.date));
      setEditTime(formatTime(item.startTimeMinutes));
      setEditDuration(item.durationMinutes);
      setEditError("Birthdays and work anniversaries are set per user in Admin → Users.");
      return;
    }
    setSelectedEvent(item);
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
    setEditDate(toDateInputValue(item.date));
    setEditTime(formatTime(item.startTimeMinutes));
    setEditDuration(item.durationMinutes);
    setEditColorPreset(item.colorPreset ?? "emerald");
    setEditError("");
  }

  async function handleUpdateEvent(e: FormEvent) {
    e.preventDefault();
    if (!selectedEvent) return;
    setEditError("");
    try {
      await updateEvent({
        eventId: selectedEvent._id,
        title: editTitle,
        description: editDescription.trim() ? editDescription : "",
        date: parseDateInput(editDate),
        startTimeMinutes: parseTimeInput(editTime),
        durationMinutes: editDuration,
        colorPreset: editColorPreset,
      });
      setSelectedEvent(null);
      setShowEventModal(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update event");
    }
  }

  function requestDeleteEvent() {
    if (!selectedEvent) return;
    setConfirmDeleteEvent(true);
  }

  async function confirmDeleteEventAction() {
    if (!selectedEvent) return;
    setConfirmDeleteEvent(false);
    setEditError("");
    try {
      await deleteEvent({ eventId: selectedEvent._id });
      setSelectedEvent(null);
      setShowEventModal(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to delete event");
    }
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: "100%", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
          minWidth: 0,
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0, minWidth: 0 }}>
          Personal Calendar <LogoMark />
        </h1>
        <button
          type="button"
          onClick={openAddModal}
          style={{
            ...primaryButtonStyle,
            width: "2.5rem",
            height: "2.5rem",
            padding: 0,
            borderRadius: "0.6rem",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          title="Add new event"
          aria-label="Add new event"
        >
          <CalendarPlusIcon size={18} />
        </button>
      </div>

      <div style={{ ...shellCardStyle, width: "100%", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isMobile ? "center" : "space-between",
            gap: "0.5rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
            width: "100%",
          }}
        >
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v - 1)}
            aria-label="Previous month"
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
              fontSize: "0.875rem",
            }}
          >
            {"<-"} Prev
          </button>
          <div
            style={{
              ...(isMobile
                ? { flex: "1 1 auto", minWidth: 0 }
                : { minWidth: "10rem" }),
              textAlign: "center",
              fontWeight: 600,
              color: "#ffffff",
            }}
          >
            {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v + 1)}
            aria-label="Next month"
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "Montserrat, sans-serif",
              fontSize: "0.875rem",
            }}
          >
            Next {"->"}
          </button>
        </div>
        <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem", minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: isMobile ? "0.35rem" : "0.5rem",
              fontSize: isMobile ? "0.75rem" : "0.875rem",
              minWidth: 0,
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ fontWeight: 600, color: "#6b7280", padding: "0.25rem", minWidth: 0 }}>
                {isMobile ? d.charAt(0) : d}
              </div>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateTs = startOfDayLocal(year, month, day);
              const isPastDay = dateTs < todayStart;
              const dayEvents = eventsByDate.get(dateTs) ?? [];
              const maxVisible = 4;
              const visible = dayEvents.slice(0, maxVisible);
              const hiddenCount = Math.max(0, dayEvents.length - maxVisible);
              const cellStyle = {
                minHeight: isMobile ? "5rem" : "6.5rem",
                minWidth: 0,
                padding: isMobile ? "0.3rem" : "0.45rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border-strong)",
                backgroundColor: isPastDay ? "var(--surface-muted)" : "var(--surface-card)",
                overflowY: "auto" as const,
              };
              const cellContent = (
                <>
                  <div style={{ fontWeight: 600, color: isPastDay ? "#94a3b8" : "var(--text-primary)", marginBottom: "0.25rem" }}>
                    {day}
                  </div>
                  {visible.map((item) => {
                    const colors = calendarItemChipColors(item, isPastDay);
                    return (
                      <button
                        key={`${item.calendarEventType}-${item._id}`}
                        type="button"
                        onClick={(e) => {
                          if (isMobile) e.stopPropagation();
                          openEventModal(item);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          minWidth: 0,
                          padding: "0.15rem 0.35rem",
                          marginBottom: "0.2rem",
                          borderRadius: "999px",
                          border: "none",
                          backgroundColor: colors.backgroundColor,
                          cursor: "pointer",
                          fontSize: "0.7rem",
                          color: colors.color,
                          fontFamily: "Montserrat, sans-serif",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatTime(item.startTimeMinutes)}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1.1rem",
                            height: "1.1rem",
                            borderRadius: "999px",
                            backgroundColor: colors.iconBackgroundColor,
                            color: colors.iconColor,
                            fontSize: "0.7rem",
                            fontWeight: 700,
                          }}
                          title={item.title?.trim() || "Calendar event"}
                        >
                          {item.calendarEventType === "personal" ? "P" : item.calendarEventType === "boardroom" ? "R" : "M"}
                        </span>
                      </button>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: "0.1rem" }}>+{hiddenCount} more...</div>
                  )}
                </>
              );
              if (isMobile) {
                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => openDayScheduleModal(dateTs)}
                    aria-label={`${formatDayHeading(dateTs)}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                    style={{
                      ...cellStyle,
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "Montserrat, sans-serif",
                      boxSizing: "border-box",
                    }}
                  >
                    {cellContent}
                  </button>
                );
              }
              return (
                <div key={`day-${day}`} style={cellStyle}>
                  {cellContent}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isMobile && showDayScheduleModal && selectedDayTs !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="day-schedule-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.58)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            zIndex: 9998,
          }}
          onClick={closeDayScheduleModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...shellCardStyle,
              width: "100%",
              maxHeight: "85vh",
              borderTopLeftRadius: "1rem",
              borderTopRightRadius: "1rem",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "0.75rem",
                flexShrink: 0,
              }}
            >
              <h2 id="day-schedule-title" style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "#ffffff" }}>
                {formatDayHeading(selectedDayTs)}
              </h2>
              <button
                type="button"
                onClick={closeDayScheduleModal}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(255,255,255,0.5)",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.875rem",
                  flexShrink: 0,
                }}
              >
                Close
              </button>
            </div>
            <div
              style={{
                ...innerWhiteCardStyle,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {(() => {
                const dayEvents = eventsByDate.get(selectedDayTs) ?? [];
                const isPastDay = selectedDayTs < todayStart;
                if (dayEvents.length === 0) {
                  return (
                    <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>No events on this day</p>
                  );
                }
                return dayEvents.map((item) => {
                  const colors = calendarItemChipColors(item, isPastDay);
                  const title = item.title?.trim() || calendarEventTypeLabel(item);
                  return (
                    <button
                      key={`${item.calendarEventType}-${item._id}`}
                      type="button"
                      onClick={() => openEventFromDaySchedule(item)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "0.2rem",
                        width: "100%",
                        minWidth: 0,
                        padding: "0.65rem 0.75rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border-strong)",
                        backgroundColor: colors.backgroundColor,
                        cursor: "pointer",
                        fontFamily: "Montserrat, sans-serif",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: colors.color }}>
                        {formatTimeRange(item.startTimeMinutes, item.durationMinutes)}
                      </div>
                      <div
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: 600,
                          color: colors.color,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          width: "100%",
                        }}
                      >
                        {title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: colors.color, opacity: 0.9 }}>
                        {calendarEventTypeLabel(item)}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
            <button
              type="button"
              onClick={openAddModalForSelectedDay}
              style={{
                ...primaryButtonStyle,
                marginTop: "0.75rem",
                width: "100%",
                flexShrink: 0,
              }}
            >
              Add personal event
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleCreateEvent}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle,
              width: "min(32rem, 100%)",
              backgroundColor: "var(--surface-panel)",
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
            }}
          >
            <h2 style={{ margin: 0 }}>Add Personal Event</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span>Title</span>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span>Date</span>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span>Time</span>
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span>Duration</span>
                <select value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value))}>
                  {DURATION_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span>Description</span>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={4}
                placeholder="Optional details"
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.9rem" }}>Colour</span>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                {PERSONAL_CALENDAR_COLOR_PRESETS.map(({ id, label }) => {
                  const c = getPersonalEventChipColors(id, false);
                  const selected = newColorPreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={selected}
                      onClick={() => setNewColorPreset(id)}
                      style={{
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "999px",
                        border: selected ? "3px solid var(--color-emerald-800)" : "2px solid var(--border-strong)",
                        backgroundColor: c.iconBackgroundColor,
                        cursor: "pointer",
                        boxSizing: "border-box",
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            {!!addError && <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>{addError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="submit" style={primaryButtonStyle}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {showEventModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(2, 6, 23, 0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={() => {
            setSelectedEvent(null);
            setShowEventModal(false);
          }}
        >
          <form
            onSubmit={handleUpdateEvent}
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle,
              width: "min(32rem, 100%)",
              backgroundColor: "var(--surface-panel)",
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
            }}
          >
            <h2 style={{ margin: 0 }}>Event Details</h2>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span>Title</span>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                disabled={!selectedEvent}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span>Date</span>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
                disabled={!selectedEvent}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span>Time</span>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  required
                  disabled={!selectedEvent}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span>Duration</span>
                <select
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  disabled={!selectedEvent}
                >
                  {DURATION_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} min
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span>Description</span>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                disabled={!selectedEvent}
              />
            </label>
            {selectedEvent ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <span style={{ fontSize: "0.9rem" }}>Colour</span>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  {PERSONAL_CALENDAR_COLOR_PRESETS.map(({ id, label }) => {
                    const c = getPersonalEventChipColors(id, false);
                    const selected = editColorPreset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-pressed={selected}
                        onClick={() => setEditColorPreset(id)}
                        style={{
                          width: "2rem",
                          height: "2rem",
                          borderRadius: "999px",
                          border: selected ? "3px solid var(--color-emerald-800)" : "2px solid var(--border-strong)",
                          backgroundColor: c.iconBackgroundColor,
                          cursor: "pointer",
                          boxSizing: "border-box",
                          padding: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
            {!!editError && <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>{editError}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              {selectedEvent ? (
                <button
                  type="button"
                  style={{ ...secondaryButtonStyle, borderColor: "rgba(220, 38, 38, 0.35)", color: "#b91c1c" }}
                  onClick={requestDeleteEvent}
                >
                  Delete
                </button>
              ) : (
                <div />
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => {
                    setSelectedEvent(null);
                    setShowEventModal(false);
                  }}
                >
                  Close
                </button>
                {selectedEvent && (
                  <button type="submit" style={primaryButtonStyle}>
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteEvent}
        message={
          selectedEvent ? (
            <>
              This will permanently delete event{" "}
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{selectedEvent.title}</span>.
            </>
          ) : null
        }
        onCancel={() => setConfirmDeleteEvent(false)}
        onConfirm={() => void confirmDeleteEventAction()}
      />
    </div>
  );
}
