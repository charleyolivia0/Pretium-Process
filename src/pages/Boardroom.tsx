import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LogoMark } from "../components/LogoMark";
import { cardStyle, shellCardStyle, innerWhiteCardStyle, primaryButtonStyle } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";
import { milestoneEntriesByDate } from "../utils/calendarMilestones";

function startOfDayLocal(year: number, month: number, day: number): number {
  return new Date(year, month, day).setHours(0, 0, 0, 0);
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function bookingSymbol(title?: string): string {
  if (!title) return "*";
  const t = title.toLowerCase();
  if (t.includes("birthday")) return "B";
  if (t.includes("anniversary")) return "A";
  if (t.includes("lunch")) return "L";
  if (t.includes("meeting") || t.includes("meet")) return "M";
  if (t.includes("call")) return "C";
  return "*";
}

function formatDateKey(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type BoardroomCalendarEntry = {
  _id: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  title?: string;
  requestedByName?: string;
  calendarEventType?: "booking" | "milestone";
};

const DURATION_OPTIONS = [15, 30, 60, 90, 120, 180, 240];
const REQUEST_TYPE_OPTIONS = ["Meeting", "Call", "Lunch", "Birthday", "Anniversary"];

export function Boardroom() {
  const user = useQuery(api.users.current);
  const usersForMeetings = useQuery(api.users.listUsersForMeetings, {});
  const [monthOffset, setMonthOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [reqDate, setReqDate] = useState("");
  const [reqTime, setReqTime] = useState("09:00");
  const [reqDuration, setReqDuration] = useState(60);
  const [reqType, setReqType] = useState("");
  const [reqTitle, setReqTitle] = useState("");
  const [reqAttendeeIds, setReqAttendeeIds] = useState<Id<"users">[]>([]);
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<Id<"users"> | "">("");
  const [showRequestModal, setShowRequestModal] = useState(false);

  const now = new Date();
  const todayStart = startOfDayLocal(now.getFullYear(), now.getMonth(), now.getDate());

  // Desktop/month view base
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthStart = startOfDayLocal(year, month, 1);
  const monthEnd = startOfDayLocal(year, month + 1, 0);

  // Mobile/week view base (5-day, Mon-Fri)
  const baseWeekDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + weekOffset * 7
  );
  const baseYear = baseWeekDate.getFullYear();
  const baseMonth = baseWeekDate.getMonth();
  const baseDay = baseWeekDate.getDate();
  const baseWeekday = baseWeekDate.getDay(); // 0 = Sun, 1 = Mon, ...
  const mondayOffset = ((baseWeekday + 6) % 7); // days since Monday
  const weekStartDay = baseDay - mondayOffset;
  const weekStart = startOfDayLocal(baseYear, baseMonth, weekStartDay);
  const weekEnd = startOfDayLocal(baseYear, baseMonth, weekStartDay + 4); // Mon-Fri

  const approved = useQuery(api.boardroom.listApprovedForCalendar, {
    startDate: monthStart,
    endDate: monthEnd,
  });
  const milestoneUsers = useQuery(api.boardroom.listMilestoneUsers, {});
  const myRequests = useQuery(api.boardroom.listMyRequests);
  const myPendingRequests = useMemo(() => (myRequests ?? []).filter((r) => r.status === "pending"), [myRequests]);
  const pendingForAdmin = useQuery(
    api.boardroom.listPendingForAdmin,
    user?.role === "admin" ? {} : "skip"
  );

  const createRequest = useMutation(api.boardroom.createRequest);
  const approveRequest = useMutation(api.boardroom.approveRequest);
  const rejectRequest = useMutation(api.boardroom.rejectRequest);
  const removeApprovedBooking = useMutation(api.boardroom.removeApprovedBooking);
  const updateApprovedBooking = useMutation(api.boardroom.updateApprovedBooking);

  const [editingBooking, setEditingBooking] = useState<{
    _id: Id<"boardroomBookings">;
    date: number;
    startTimeMinutes: number;
    durationMinutes: number;
    title?: string;
  } | null>(null);
  const [confirmRemoveBooking, setConfirmRemoveBooking] = useState<{
    bookingId: Id<"boardroomBookings">;
    dateLabel: string;
    timeLabel: string;
    title?: string;
  } | null>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const isAdmin = user?.role === "admin";
  const isMobile = useIsMobile(768);

  const bookingsByDate = useMemo(() => {
    const map = new Map<number, BoardroomCalendarEntry[]>();
    if (!approved) return map;
    for (const b of approved) {
      const list = map.get(b.date) ?? [];
      list.push(b as BoardroomCalendarEntry);
      map.set(b.date, list);
    }

    const dayTimestamps = isMobile
      ? [0, 1, 2, 3, 4].map((i) => startOfDayLocal(baseYear, baseMonth, weekStartDay + i))
      : Array.from({ length: daysInMonth }, (_, i) => startOfDayLocal(year, month, i + 1));
    const milestoneByDate = milestoneEntriesByDate(milestoneUsers, dayTimestamps, {
      includeEmploymentAnniversaries: user?.role === "admin",
    });
    for (const [dateTs, entries] of milestoneByDate) {
      const list = map.get(dateTs) ?? [];
      for (const e of entries) {
        list.push({ ...e, calendarEventType: "milestone" as const });
      }
      map.set(dateTs, list);
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);
    }
    return map;
  }, [
    approved,
    milestoneUsers,
    isMobile,
    baseYear,
    baseMonth,
    weekStartDay,
    year,
    month,
    daysInMonth,
    user?.role,
  ]);

  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);

  function openInfoModal(booking: any) {
    setSelectedBooking(booking);
    setShowInfoModal(true);
  }

  function closeInfoModal() {
    setShowInfoModal(false);
    setSelectedBooking(null);
  }

  async function handleRemoveBooking(
    bookingId: Id<"boardroomBookings">,
    date: number,
    startTimeMinutes: number,
    title?: string
  ) {
    const dateLabel = formatDateKey(date);
    const timeLabel = formatTime(startTimeMinutes);
    setConfirmRemoveBooking({ bookingId, dateLabel, timeLabel, title });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBooking) return;
    const form = e.target as HTMLFormElement;
    const dateStr = (form.elements.namedItem("editDate") as HTMLInputElement)?.value;
    const timeStr = (form.elements.namedItem("editTime") as HTMLInputElement)?.value;
    const duration = Number((form.elements.namedItem("editDuration") as HTMLSelectElement)?.value);
    const title = (form.elements.namedItem("editTitle") as HTMLInputElement)?.value?.trim() || undefined;
    if (!dateStr || !timeStr) return;
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = startOfDayLocal(y, m - 1, d);
    const [hour, min] = timeStr.split(":").map(Number);
    const startTimeMinutes = hour * 60 + min;
    await updateApprovedBooking({
      bookingId: editingBooking._id,
      date,
      startTimeMinutes,
      durationMinutes: duration,
      title,
    });
    setEditingBooking(null);
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqDate) return;
    const [y, m, d] = reqDate.split("-").map(Number);
    const date = startOfDayLocal(y, m - 1, d);
    const [hour, min] = reqTime.split(":").map(Number);
    const startTimeMinutes = hour * 60 + min;
    const trimmedTitle = reqTitle.trim();
    const combinedTitle = [reqType, trimmedTitle].filter(Boolean).join(" - ") || undefined;
    await createRequest({
      date,
      startTimeMinutes,
      durationMinutes: reqDuration,
      title: combinedTitle,
      attendeeUserIds: reqAttendeeIds.length > 0 ? reqAttendeeIds : undefined,
    });
    setReqType("");
    setReqTitle("");
    setReqAttendeeIds([]);
    setSelectedAttendeeId("");
    setShowRequestModal(false);
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: "100%", minWidth: 0 }}>
      <h1 className="page-title">Boardroom <LogoMark /></h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Office schedule and boardroom bookings. Request a slot; once approved by admin it appears on the calendar.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 19rem",
          gap: "1rem",
          alignItems: "start",
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* Office schedule calendar (left panel) */}
        <div style={shellCardStyle}>
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", margin: 0 }}>Office schedule</h2>
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                aria-label="Request boardroom time"
                title="Request boardroom time"
                style={{
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "1.5rem",
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                width: "100%",
              }}
            >
              <button
                type="button"
                onClick={() => setWeekOffset((o) => o - 1)}
                aria-label="Previous week"
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
              <span
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  textAlign: "center",
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                {new Date(weekStart).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                -{" "}
                {new Date(weekEnd).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <button
                type="button"
                onClick={() => setWeekOffset((o) => o + 1)}
                aria-label="Next week"
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
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", margin: 0 }}>Office schedule</h2>
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                aria-label="Request boardroom time"
                title="Request boardroom time"
                style={{
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(255,255,255,0.55)",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "1.5rem",
                  lineHeight: 1,
                }}
              >
                +
              </button>
            </div>
            <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setMonthOffset((o) => o - 1)}
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
              <span style={{ minWidth: "10rem", textAlign: "center", fontWeight: 600, color: "#ffffff" }}>
                {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setMonthOffset((o) => o + 1)}
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
            </span>
          </div>
        )}
        {approved === undefined ? (
          <p style={{ color: "#d1fae5", fontSize: "0.875rem" }}>Loading...</p>
        ) : (
          <div
            style={{
              ...innerWhiteCardStyle,
              marginTop: "0.5rem",
            }}
          >
            {isMobile ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: "0.35rem",
                  fontSize: "0.875rem",
                  minWidth: 0,
                }}
              >
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((label, index) => {
                  const dateTs = startOfDayLocal(
                    baseYear,
                    baseMonth,
                    weekStartDay + index
                  );
                  const isPastDay = dateTs < todayStart;
                  const dateObj = new Date(dateTs);
                  const dayNumber = dateObj.getDate();
                  const dayBookings = bookingsByDate.get(dateTs) ?? [];
                  return (
                    <div
                      key={label}
                      style={{
                        minHeight: "6rem",
                        minWidth: 0,
                        padding: "0.45rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border-strong)",
                        backgroundColor: isPastDay ? "var(--surface-muted)" : "var(--surface-card)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: isPastDay ? "#94a3b8" : "var(--text-primary)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {label} {dayNumber}
                      </div>
                      {(() => {
                        const maxVisible = 4;
                        const visible = dayBookings.slice(0, maxVisible);
                        const remaining = dayBookings.length - visible.length;
                        return (
                          <>
                            {visible.map((b) => (
                              <button
                                key={b._id}
                                type="button"
                                onClick={() => openInfoModal(b)}
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
                                  backgroundColor: isPastDay ? "#cbd5e1" : "#ecfdf5",
                                  cursor: "pointer",
                                  fontSize: "0.7rem",
                                  color: isPastDay ? "#334155" : "#065f46",
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
                                  {formatTime(b.startTimeMinutes)}
                                </span>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "1.1rem",
                                    height: "1.1rem",
                                    borderRadius: "999px",
                                    backgroundColor: isPastDay ? "#64748b" : "#059669",
                                    color: "#ecfdf5",
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {bookingSymbol(b.title)}
                                </span>
                              </button>
                            ))}
                            {remaining > 0 && (
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "#6b7280",
                                  marginTop: "0.1rem",
                                }}
                              >
                                +{remaining} more...
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                }}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} style={{ fontWeight: 600, color: "#6b7280", padding: "0.25rem" }}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const date = startOfDayLocal(year, month, day);
                  const isPastDay = date < todayStart;
                  const dayBookings = bookingsByDate.get(date) ?? [];
                  return (
                    <div
                      key={day}
                      style={{
                        minHeight: "6.5rem",
                        padding: "0.45rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border-strong)",
                        backgroundColor: isPastDay ? "var(--surface-muted)" : "var(--surface-card)",
                        overflowY: "auto",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: isPastDay ? "#94a3b8" : "var(--text-primary)", marginBottom: "0.25rem" }}>
                        {day}
                      </div>
                      {(() => {
                        const maxVisible = 4;
                        const visible = dayBookings.slice(0, maxVisible);
                        const remaining = dayBookings.length - visible.length;
                        return (
                          <>
                            {visible.map((b) => (
                              <button
                                key={b._id}
                                type="button"
                                onClick={() => openInfoModal(b)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  width: "100%",
                                  padding: "0.15rem 0.35rem",
                                  marginBottom: "0.2rem",
                                  borderRadius: "999px",
                                  border: "none",
                                  backgroundColor: isPastDay ? "#cbd5e1" : "#ecfdf5",
                                  cursor: "pointer",
                                  fontSize: "0.7rem",
                                  color: isPastDay ? "#334155" : "#065f46",
                                  fontFamily: "Montserrat, sans-serif",
                                }}
                              >
                                <span style={{ fontWeight: 600 }}>
                                  {formatTime(b.startTimeMinutes)}
                                </span>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "1.1rem",
                                    height: "1.1rem",
                                    borderRadius: "999px",
                                    backgroundColor: isPastDay ? "#64748b" : "#059669",
                                    color: "#ecfdf5",
                                    fontSize: "0.7rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {bookingSymbol(b.title)}
                                </span>
                              </button>
                            ))}
                            {remaining > 0 && (
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "#6b7280",
                                  marginTop: "0.1rem",
                                }}
                              >
                                +{remaining} more...
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Right column */}
        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={shellCardStyle}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
              Boardroom key
            </h2>
            <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem", fontSize: "0.85rem" }}>
              <div style={{ display: "grid", gap: "0.35rem", color: "#374151" }}>
                <div><strong>M</strong> Meeting</div>
                <div><strong>C</strong> Call</div>
                <div><strong>L</strong> Lunch</div>
                <div><strong>B</strong> Birthday</div>
                <div><strong>A</strong> Anniversary</div>
              </div>
            </div>
          </div>

          <div style={shellCardStyle}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
              {isAdmin ? "Pending approval" : "My pending requests"}
            </h2>
            <div style={{ ...innerWhiteCardStyle, marginTop: "0.5rem" }}>
              {isAdmin ? (
                pendingForAdmin && pendingForAdmin.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {pendingForAdmin.map((r) => (
                      <li
                        key={r._id}
                        style={{
                          padding: "0.5rem 0",
                          borderBottom: "1px solid #f3f4f6",
                          fontSize: "0.8rem",
                        }}
                      >
                        <div style={{ color: "#1f2937", marginBottom: "0.45rem" }}>
                          {formatDateKey(r.date)} · {formatTime(r.startTimeMinutes)} · {r.durationMinutes} min
                          {r.title && ` · ${r.title}`}
                        </div>
                        <div style={{ color: "#6b7280", marginBottom: "0.45rem" }}>{r.requestedByName}</div>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button
                            type="button"
                            onClick={() => approveRequest({ bookingId: r._id })}
                            style={{
                              padding: "0.3rem 0.55rem",
                              borderRadius: "0.375rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: "#ecfdf5",
                              color: "#059669",
                              border: "1px solid #a7f3d0",
                              cursor: "pointer",
                              fontFamily: "Montserrat, sans-serif",
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectRequest({ bookingId: r._id })}
                            style={{
                              padding: "0.3rem 0.55rem",
                              borderRadius: "0.375rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: "#fef2f2",
                              color: "#dc2626",
                              border: "1px solid #fecaca",
                              cursor: "pointer",
                              fontFamily: "Montserrat, sans-serif",
                            }}
                          >
                            Deny
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>No requests awaiting approval.</p>
                )
              ) : myPendingRequests.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "0.8rem", color: "#374151" }}>
                  {myPendingRequests.map((r) => (
                    <li key={r._id} style={{ marginBottom: "0.4rem" }}>
                      {formatDateKey(r.date)} · {formatTime(r.startTimeMinutes)}
                      {r.title && ` · ${r.title}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>You have no pending requests.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Request modal */}
      {showRequestModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 55,
            padding: "1rem",
          }}
          onClick={() => setShowRequestModal(false)}
        >
          <div
            style={{
              ...shellCardStyle,
              maxWidth: "26rem",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#ffffff", marginBottom: "1rem" }}>
              Request boardroom time
            </h2>
            <div
              style={{
                ...innerWhiteCardStyle,
                marginTop: "0.5rem",
              }}
            >
              <form
                onSubmit={handleSubmitRequest}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={reqDate}
                    onChange={(e) => setReqDate(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      maxWidth: "12rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Start time
                  </label>
                  <input
                    type="time"
                    value={reqTime}
                    onChange={(e) => setReqTime(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      maxWidth: "10rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Duration
                  </label>
                  <select
                    value={reqDuration}
                    onChange={(e) => setReqDuration(Number(e.target.value))}
                    style={{
                      width: "100%",
                      maxWidth: "10rem",
                      boxSizing: "border-box",
                    }}
                  >
                    {DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Type
                  </label>
                  <select
                    value={reqType}
                    onChange={(e) => setReqType(e.target.value)}
                    style={{
                      width: "100%",
                      maxWidth: "12rem",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Select type...</option>
                    {REQUEST_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    value={reqTitle}
                    onChange={(e) => setReqTitle(e.target.value)}
                    placeholder="e.g. Client meeting"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    Invite attendees (optional)
                  </label>
                  <select
                    value={selectedAttendeeId || ""}
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      if (!rawValue) {
                        return;
                      }

                      if (rawValue === "__everyone__") {
                        const allUserIds =
                          (usersForMeetings ?? [])
                            .map((u) => u._id as Id<"users">)
                            .filter(
                              (id) =>
                                id !== (user?._id as Id<"users"> | undefined),
                            );
                        setReqAttendeeIds(allUserIds);
                        setSelectedAttendeeId("");
                        e.target.value = "";
                        return;
                      }

                      const value = rawValue as Id<"users">;
                      setSelectedAttendeeId(value);
                      if (value && !reqAttendeeIds.includes(value)) {
                        setReqAttendeeIds([...reqAttendeeIds, value]);
                      }
                      e.target.value = "";
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Select a person...</option>
                    {usersForMeetings && usersForMeetings.length > 0 && (
                      <option value="__everyone__">Everyone</option>
                    )}
                    {(usersForMeetings ?? [])
                      .filter((u) => !reqAttendeeIds.includes(u._id))
                      .map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                  {reqAttendeeIds.length > 0 && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.35rem",
                        fontSize: "0.75rem",
                      }}
                    >
                      {reqAttendeeIds.map((id) => {
                        const u = (usersForMeetings ?? []).find((x) => x._id === id);
                        if (!u) return null;
                        return (
                          <span
                            key={id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "0.2rem 0.4rem",
                              borderRadius: "999px",
                              backgroundColor: "#ecfdf5",
                              color: "#065f46",
                              border: "1px solid #a7f3d0",
                              gap: "0.25rem",
                            }}
                          >
                            <span>{u.name}</span>
                            <button
                              type="button"
                              onClick={() => setReqAttendeeIds(reqAttendeeIds.filter((x) => x !== id))}
                              style={{
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "#047857",
                                fontSize: "0.75rem",
                                padding: 0,
                                lineHeight: 1,
                              }}
                              aria-label={`Remove ${u.name}`}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    ...primaryButtonStyle,
                  }}
                >
                  Submit request
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Admin: edit booking modal */}
      {isAdmin && editingBooking && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setEditingBooking(null)}
        >
          <div
            style={{
              ...cardStyle,
              maxWidth: "22rem",
              margin: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
              Edit calendar booking
            </h3>
            <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>Date</label>
                <input
                  name="editDate"
                  type="date"
                  required
                  defaultValue={(() => {
                    const d = new Date(editingBooking.date);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  })()}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>Start time</label>
                <input
                  name="editTime"
                  type="time"
                  required
                  defaultValue={`${String(Math.floor(editingBooking.startTimeMinutes / 60)).padStart(2, "0")}:${String(editingBooking.startTimeMinutes % 60).padStart(2, "0")}`}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>Duration</label>
                <select
                  name="editDuration"
                  defaultValue={editingBooking.durationMinutes}
                  style={{ width: "100%" }}
                >
                  {DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>Title (optional)</label>
                <input
                  name="editTitle"
                  type="text"
                  defaultValue={editingBooking.title ?? ""}
                  placeholder="e.g. Client meeting"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="submit"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBooking(null)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    backgroundColor: "#f3f4f6",
                    color: "#374151",
                    border: "1px solid #e5e7eb",
                    cursor: "pointer",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemoveBooking !== null}
        confirmLabel="Yes, remove"
        message={
          confirmRemoveBooking ? (
            <>
              This will remove the booking on{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>{confirmRemoveBooking.dateLabel}</span> at{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>{confirmRemoveBooking.timeLabel}</span>
              {confirmRemoveBooking.title && (
                <>
                  {" "}
                  for <span style={{ fontWeight: 600, color: "#111827" }}>{confirmRemoveBooking.title}</span>
                </>
              )}{" "}
              from the calendar.
            </>
          ) : null
        }
        onCancel={() => setConfirmRemoveBooking(null)}
        onConfirm={async () => {
          const toRemove = confirmRemoveBooking;
          setConfirmRemoveBooking(null);
          if (!toRemove) return;
          await removeApprovedBooking({ bookingId: toRemove.bookingId });
        }}
      />


      {showInfoModal && selectedBooking && (
        <div
          onClick={closeInfoModal}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...cardStyle,
              maxWidth: "22rem",
              width: "90%",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#111827", marginBottom: "0.75rem" }}>
              {selectedBooking.title?.trim() || "Boardroom booking"}
            </h3>
            <div style={{ fontSize: "0.875rem", color: "#374151", marginBottom: "0.5rem" }}>
              <div style={{ marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 500 }}>When: </span>
                <span>
                  {formatDateKey(selectedBooking.date)} ·{" "}
                  {formatTime(selectedBooking.startTimeMinutes)}-
                  {formatTime(selectedBooking.startTimeMinutes + selectedBooking.durationMinutes)}
                  {selectedBooking.durationMinutes ? ` (${selectedBooking.durationMinutes} min)` : ""}
                </span>
              </div>
              <div style={{ marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 500 }}>Location: </span>
                <span>{selectedBooking.calendarEventType === "milestone" ? "Office calendar" : "Boardroom"}</span>
              </div>
              {selectedBooking.requestedByName && (
                <div style={{ marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: 500 }}>Requested by: </span>
                  <span>{selectedBooking.requestedByName}</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="button"
                onClick={closeInfoModal}
                style={{
                  padding: "0.4rem 0.9rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "var(--surface-panel)",
                  color: "var(--text-primary)",
                  fontSize: "0.85rem",
                  fontFamily: "Montserrat, sans-serif",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
