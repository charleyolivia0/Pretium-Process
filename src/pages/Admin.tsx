import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LogoMark } from "../components/LogoMark";
import {
  cardStyle,
  innerWhiteCardStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  shellCardStyle,
  widgetTitleStyle,
} from "../theme";
import { notificationHref } from "../utils/notificationHref";
import { useIsMobile } from "../hooks/useIsMobile";

type NotificationDoc = {
  _id: Id<"notifications">;
  title: string;
  body?: string;
  link?: string;
  projectId?: Id<"projects">;
  bookingId?: Id<"boardroomBookings">;
  incidentId?: Id<"incidentReports">;
  createdAt: number;
};

type PersonalCalendarEvent = {
  _id: Id<"personalCalendarEvents">;
  title: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
};

type BoardroomCalendarEvent = {
  _id: Id<"boardroomBookings">;
  title?: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  requestedByName?: string;
};

type TodoItem = {
  _id: Id<"pmTodoList">;
  text: string;
  completed?: boolean;
  priority?: "low" | "medium" | "high";
};

type DashboardProjectRow = {
  project: {
    _id: Id<"projects">;
    name: string;
    healthStatus?: "green" | "amber" | "red";
  };
  currentTask?: {
    title: string;
  } | null;
};

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

export function Admin() {
  const user = useQuery(api.users.current);
  const isAdmin = user?.role === "admin";
  const isMobile = useIsMobile(768);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [showAddTodoForm, setShowAddTodoForm] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);
  const todoFormRef = useRef<HTMLDivElement>(null);
  const addTodo = useMutation(api.todoList.add);
  const updateTodo = useMutation(api.todoList.update);

  const now = Date.now();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = useMemo(() => {
    const d = new Date(todayStart);
    const day = d.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diffToMonday + calendarWeekOffset * 7);
    return startOfDay(d.getTime());
  }, [todayStart, calendarWeekOffset]);
  const weekEnd = endOfDay(weekStart + 4 * 24 * 60 * 60 * 1000);
  const workWeekDays = useMemo(
    () =>
      Array.from({ length: 5 }, (_, idx) => {
        const dateTs = startOfDay(weekStart + idx * 24 * 60 * 60 * 1000);
        const d = new Date(dateTs);
        return {
          key: dateTs,
          ts: dateTs,
          label: d.toLocaleDateString(undefined, { weekday: "short" }),
          day: d.getDate(),
        };
      }),
    [weekStart]
  );
  const workWeekRangeLabel = useMemo(() => {
    const first = new Date(weekStart);
    const last = new Date(weekStart + 4 * 24 * 60 * 60 * 1000);
    const firstText = first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const lastText = last.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${firstText} - ${lastText}`;
  }, [weekStart]);

  const personalEvents = useQuery(
    api.personalCalendar.listMyEvents,
    user !== undefined
      ? {
          startDate: weekStart,
          endDate: weekEnd,
        }
      : "skip"
  ) as PersonalCalendarEvent[] | undefined;
  const boardroomEvents = useQuery(
    api.boardroom.listApprovedForCalendar,
    user !== undefined
      ? {
          startDate: weekStart,
          endDate: weekEnd,
        }
      : "skip"
  ) as BoardroomCalendarEvent[] | undefined;

  const notifications = useQuery(
    api.notifications.listNotificationsInRange,
    user !== undefined
      ? {
          startDate: todayStart,
          endDate: todayEnd,
        }
      : "skip"
  ) as NotificationDoc[] | undefined;

  const todoItems = useQuery(api.todoList.list, user !== undefined ? {} : "skip") as TodoItem[] | undefined;
  const dashboardProjects = useQuery(
    api.projects.getDashboardProjects,
    user !== undefined ? {} : "skip"
  ) as DashboardProjectRow[] | undefined;

  const todaysNotifications = useMemo(() => {
    return (notifications ?? []).sort((a, b) => b.createdAt - a.createdAt);
  }, [notifications]);

  const calendarByDate = useMemo(() => {
    const map = new Map<number, Array<(PersonalCalendarEvent | BoardroomCalendarEvent) & { source: "personal" | "boardroom" }>>();
    for (const event of personalEvents ?? []) {
      const list = map.get(event.date) ?? [];
      list.push({ ...event, source: "personal" });
      map.set(event.date, list);
    }
    for (const event of boardroomEvents ?? []) {
      const list = map.get(event.date) ?? [];
      list.push({ ...event, source: "boardroom" });
      map.set(event.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);
    }
    return map;
  }, [personalEvents, boardroomEvents]);

  const pendingTodos = useMemo(() => {
    return (todoItems ?? []).filter((item) => item.completed !== true).slice(0, 8);
  }, [todoItems]);

  const projectRows = useMemo(() => {
    return (dashboardProjects ?? []).slice(0, 6);
  }, [dashboardProjects]);

  function closeAddTodoForm() {
    setShowAddTodoForm(false);
    setNewTodoText("");
  }

  useEffect(() => {
    if (!showAddTodoForm) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = todoFormRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) closeAddTodoForm();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeAddTodoForm();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAddTodoForm]);

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) return;
    setAddingTodo(true);
    try {
      await addTodo({ text, priority: "medium" });
      closeAddTodoForm();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add to-do item.");
    } finally {
      setAddingTodo(false);
    }
  }

  async function toggleTodoCompleted(id: Id<"pmTodoList">, completed: boolean) {
    try {
      await updateTodo({ id, completed: !completed });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update to-do item.");
    }
  }

  if (user === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <h1 className="page-title">Admin</h1>
        <div style={cardStyle}>
          <p style={{ color: "#6b7280", margin: 0 }}>
            You need admin access to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <h1 className="page-title">Admin <LogoMark /></h1>
      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
        Admin dashboard with live calendar, notifications, to-dos, and projects.
      </p>

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: isMobile
            ? "minmax(0, 1fr)"
            : "minmax(14rem, 1.05fr) minmax(14rem, 1.2fr) minmax(12rem, 0.9fr)",
          gridTemplateRows: isMobile ? undefined : "auto auto",
          gridTemplateAreas: isMobile
            ? undefined
            : `"calendar notifications todo" "projects projects todo"`,
          alignItems: "stretch",
          minWidth: 0,
        }}
      >
        <section style={{ ...shellCardStyle, minHeight: "15rem", gridArea: isMobile ? undefined : "calendar" }}>
          <h2 style={{ ...widgetTitleStyle, marginBottom: "0.8rem" }}>
            <Link to="/personal-calendar" style={{ color: "#a7f3d0", textDecoration: "none" }}>
              Calendar
            </Link>
          </h2>
          <div style={{ ...innerWhiteCardStyle, height: "calc(100% - 2rem)" }}>
            {personalEvents === undefined || boardroomEvents === undefined ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Loading...</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.55rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 600 }}>{workWeekRangeLabel}</div>
                  <div style={{ display: "inline-flex", gap: "0.35rem" }}>
                    <button
                      type="button"
                      onClick={() => setCalendarWeekOffset((w) => w - 1)}
                      style={{ border: "1px solid var(--border-strong)", borderRadius: "0.35rem", backgroundColor: "var(--surface-muted)", cursor: "pointer" }}
                      aria-label="Previous week"
                    >
                      {"<"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarWeekOffset((w) => w + 1)}
                      style={{ border: "1px solid var(--border-strong)", borderRadius: "0.35rem", backgroundColor: "var(--surface-muted)", cursor: "pointer" }}
                      aria-label="Next week"
                    >
                      {">"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "0.45rem" }}>
                  {workWeekDays.map((day) => {
                    const dayEvents = (calendarByDate.get(day.ts) ?? []).slice(0, 4);
                    return (
                      <div
                        key={day.key}
                        style={{
                          border: "1px solid var(--border-strong)",
                          borderRadius: "0.5rem",
                          padding: "0.45rem",
                          backgroundColor: "var(--surface-muted)",
                          minHeight: "8rem",
                        }}
                      >
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                          {day.label} {day.day}
                        </div>
                        {dayEvents.length === 0 ? (
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>No events</div>
                        ) : (
                          dayEvents.map((event) => (
                            <div key={`${event.source}-${event._id}`} style={{ marginBottom: "0.3rem" }}>
                              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                {formatTime(event.startTimeMinutes)} · {event.source === "boardroom" ? "Boardroom" : "Personal"}
                              </div>
                              <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{event.title?.trim() || "Event"}</div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        <section style={{ ...shellCardStyle, minHeight: "10.5rem", gridArea: isMobile ? undefined : "notifications" }}>
          <h2 style={{ ...widgetTitleStyle, marginBottom: "0.8rem" }}>Recent Notifications</h2>
          <div style={innerWhiteCardStyle}>
            {notifications === undefined ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Loading...</p>
            ) : todaysNotifications.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>No notifications received today.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {todaysNotifications.slice(0, 5).map((notification) => {
                  const content = (
                    <>
                      <div style={{ fontSize: "0.86rem", fontWeight: 600 }}>{notification.title}</div>
                      {notification.body ? (
                        <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.15rem" }}>{notification.body}</div>
                      ) : null}
                    </>
                  );
                  const containerStyle = {
                    border: "1px solid var(--border-strong)",
                    borderRadius: "0.5rem",
                    padding: "0.45rem 0.55rem",
                    backgroundColor: "var(--surface-muted)",
                  } as const;
                  const href = notificationHref({
                    link: notification.link,
                    projectId: notification.projectId,
                    bookingId: notification.bookingId,
                    incidentId: notification.incidentId,
                  });
                  if (!href) {
                    return (
                      <div key={notification._id} style={containerStyle}>
                        {content}
                      </div>
                    );
                  }
                  return (
                    <Link
                      key={notification._id}
                      to={href}
                      style={{
                        ...containerStyle,
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                      }}
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section style={{ ...shellCardStyle, minHeight: "20rem", gridArea: isMobile ? undefined : "todo" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem" }}>
            <h2 style={widgetTitleStyle}>Personal Todo List</h2>
            {!showAddTodoForm && (
              <button
                type="button"
                onClick={() => setShowAddTodoForm(true)}
                aria-label="Add new to-do item"
                title="Add new to-do item"
                style={{
                  border: "1px solid var(--border-strong)",
                  backgroundColor: "var(--surface-muted)",
                  width: "1.65rem",
                  height: "1.65rem",
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  lineHeight: 1,
                  color: "#059669",
                }}
              >
                +
              </button>
            )}
          </div>
          <div style={innerWhiteCardStyle}>
            {showAddTodoForm && (
              <div ref={todoFormRef} style={{ marginBottom: "0.65rem" }}>
                <form
                  onSubmit={(e) => void handleAddTodo(e)}
                  style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
                >
                  <input
                    type="text"
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    placeholder="Add a new task..."
                    autoFocus
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="submit"
                      disabled={addingTodo || !newTodoText.trim()}
                      style={{
                        ...primaryButtonStyle,
                        fontSize: "0.8125rem",
                        opacity: addingTodo || !newTodoText.trim() ? 0.6 : 1,
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={closeAddTodoForm}
                      style={{ ...secondaryButtonStyle, fontSize: "0.8125rem" }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
            {todoItems === undefined ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Loading...</p>
            ) : pendingTodos.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>No pending personal to-dos.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {pendingTodos.map((item) => (
                  <div
                    key={item._id}
                    style={{
                      border: "1px solid var(--border-strong)",
                      borderRadius: "0.5rem",
                      padding: "0.4rem 0.5rem",
                      backgroundColor: "var(--surface-muted)",
                      fontSize: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => void toggleTodoCompleted(item._id, item.completed === true)}
                      aria-label={`Mark ${item.text} as done`}
                      style={{
                        width: "1rem",
                        height: "1rem",
                        accentColor: "#059669",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={{ ...shellCardStyle, minHeight: "12rem", gridArea: isMobile ? undefined : "projects" }}>
          <h2 style={{ ...widgetTitleStyle, marginBottom: "0.8rem" }}>Project Cards</h2>
          <div style={innerWhiteCardStyle}>
            {dashboardProjects === undefined ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>Loading...</p>
            ) : projectRows.length === 0 ? (
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>No projects to show.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))" }}>
                {projectRows.map((row) => (
                  <Link
                    key={row.project._id}
                    to={`/projects/${row.project._id}`}
                    className="card-hover"
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "0.55rem",
                      padding: "0.5rem",
                      backgroundColor: "var(--surface-muted)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>{row.project.name}</div>
                    <div style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: "0.2rem" }}>
                      {row.currentTask?.title ?? "No active task"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
