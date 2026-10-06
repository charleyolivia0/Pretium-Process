import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useEffectiveRole } from "../contexts/EffectiveRoleContext";
import { LogoMark } from "../components/LogoMark";
import { PrincipalWeeklyUpdateCard } from "../components/PrincipalWeeklyUpdateCard";
import {
  DashboardNotificationsList,
  type DashboardNotificationItem,
} from "../components/DashboardNotificationsList";
import { cardStyle, primaryButtonStyle, secondaryButtonStyle, shellCardStyle, innerWhiteCardStyle } from "../theme";
import { getProjectStatusStyle } from "../utils/projectStatusStyle";
import { milestoneEntriesByDate } from "../utils/calendarMilestones";

type DashboardProjectRow = FunctionReturnType<typeof api.projects.getDashboardProjects>[number];
import { DAY_MS, getDayKeyCentral } from "../lib/centralTime";
import { buildCalendarEventsByDate } from "../utils/calendarEventsByDate";
import {
  getBoardroomCalendarChipColors,
  getMilestoneCalendarChipColors,
  getPersonalEventChipColors,
  type PersonalCalendarColorPreset,
} from "../utils/personalCalendarColorPresets";

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

type DashboardCalendarEntry = {
  _id: string;
  date: number;
  startTimeMinutes: number;
  durationMinutes: number;
  title?: string;
  requestedByName?: string;
  calendarEventType?: "personal" | "boardroom" | "milestone";
  colorPreset?: PersonalCalendarColorPreset;
};

type NotificationDoc = Doc<"notifications">;

function dashboardBookingChipColors(b: DashboardCalendarEntry, isPastDay: boolean) {
  if (b.calendarEventType === "personal") {
    return getPersonalEventChipColors(b.colorPreset, isPastDay);
  }
  if (b.calendarEventType === "milestone") {
    return getMilestoneCalendarChipColors(isPastDay);
  }
  return getBoardroomCalendarChipColors(isPastDay);
}

function healthDot(health?: string) {
  if (!health) return null;
  const colors: Record<string, string> = {
    green: "#059669",
    amber: "#d97706",
    red: "#dc2626",
  };
  return (
    <span
      style={{
        width: "0.5rem",
        height: "0.5rem",
        borderRadius: "999px",
        backgroundColor: colors[health] ?? "#9ca3af",
        display: "inline-block",
      }}
    />
  );
}

function formatDate(ts?: number) {
  if (ts == null) return "-";
  return new Date(ts).toLocaleDateString();
}

function budgetHealthLabel(health?: string) {
  if (health === "green") return "On track";
  if (health === "amber") return "Watch";
  if (health === "red") return "At risk";
  return "N/A";
}

function dateInputToTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  const d = new Date(value + "T12:00:00");
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

const PM_COORDINATOR_ROLES = ["project_manager", "coordinator"];
const WORK_WEEK_DAYS = 5;

type AccountingFavouriteDashboardRow = {
  project: Doc<"projects">;
  isFavourite: true;
  budgetHealth: "green" | "amber" | "red" | undefined;
  overdueAmount: number;
  pendingAmount: number;
  changeOrderCountRecent: number;
  changeOrderLatestRecent: number | undefined;
  poUpdateCountRecent: number;
  poUpdateLatestRecent: number | undefined;
};

const PRIORITY_OPTIONS: { value: "low" | "medium" | "high"; label: string; icon: string }[] = [
  { value: "high", label: "High", icon: "▲" },
  { value: "medium", label: "Medium", icon: "●" },
  { value: "low", label: "Low", icon: "▼" },
];
function PriorityIcon({ priority }: { priority?: "low" | "medium" | "high" | null }) {
  const p = priority ?? "medium";
  const opt = PRIORITY_OPTIONS.find((o) => o.value === p);
  return (
    <span style={{ color: "#ffffff", fontSize: "1rem", lineHeight: 1 }} title={opt?.label ?? p}>
      {opt?.icon ?? "●"}
    </span>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const user = useQuery(api.users.current);
  const { effectiveRole, isAdmin } = useEffectiveRole();
  const roleForView = isAdmin && effectiveRole ? effectiveRole : (user?.role ?? "");
  const useCardView = Boolean(roleForView && PM_COORDINATOR_ROLES.includes(roleForView));
  const useAccountingCardView = roleForView === "accounting";
  const useSafetyDashboardView = roleForView === "safety";
  const useAdminDashboardView = roleForView === "admin";
  const usePrincipalDashboardView = roleForView === "principal";
  const useSiteSuperDashboardView = roleForView === "site_superintendent";
  const dashboardProjects = useQuery(
    api.projects.getDashboardProjects,
    useCardView || useAdminDashboardView || usePrincipalDashboardView || useSiteSuperDashboardView || useSafetyDashboardView
      ? {}
      : "skip"
  );
  const principalUpcomingTasks = useQuery(
    api.tasks.listUpcomingDashboardTasks,
    usePrincipalDashboardView ? { limit: 40 } : "skip"
  );
  const accountingFavouriteDashboard = useQuery(
    api.accounting.getAccountingFavouriteDashboard,
    useAccountingCardView ? {} : "skip"
  );
  const upcomingDashboardTasksForCards = useQuery(
    api.tasks.listUpcomingDashboardTasks,
    useCardView || useAdminDashboardView ? { limit: 200 } : "skip"
  );
  // `getDashboardProjects` (card view) returns rows shaped like `{ project, ... }`.
  // The table below expects plain `projects` rows, so only use `listProjects` when we are not
  // in card/admin dashboard mode.
  const listProjects = useQuery(
    api.projects.listProjects,
    !useCardView &&
      !useAdminDashboardView &&
      !usePrincipalDashboardView &&
      !useSiteSuperDashboardView &&
      !useAccountingCardView
      ? {}
      : "skip"
  );
  const now = new Date();
  const todayStart = startOfDayLocal(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = todayStart + DAY_MS;
  const pmTodoItems = useQuery(api.todoList.list, user !== undefined ? {} : "skip");
  const todoListProjects = useQuery(api.projects.listProjects, user !== undefined ? {} : "skip");
  const notificationsToday = useQuery(
    api.notifications.listRecentNotifications,
    user !== undefined ? { limit: 30, includeRead: false } : "skip"
  ) as NotificationDoc[] | undefined;
  const addTodoItem = useMutation(api.todoList.add);
  const updateTodoItem = useMutation(api.todoList.update);
  const markNotificationAsRead = useMutation(api.notifications.markNotificationAsRead);
  const markAllNotificationsAsRead = useMutation(api.notifications.markAllNotificationsAsRead);
  const addFavourite = useMutation(api.users.addFavourite);
  const removeFavourite = useMutation(api.users.removeFavourite);

  const [isMobile, setIsMobile] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  function openBookingModal(booking: any) {
    setSelectedBooking(booking);
    setShowBookingModal(true);
  }

  function closeBookingModal() {
    setShowBookingModal(false);
    setSelectedBooking(null);
  }

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    handleChange(mq);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handleChange as (e: MediaQueryListEvent) => void);
      return () => mq.removeEventListener("change", handleChange as (e: MediaQueryListEvent) => void);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(handleChange as (e: MediaQueryListEvent) => void);
      return () => mq.removeListener(handleChange as (e: MediaQueryListEvent) => void);
    }
  }, []);

  const [showAddTodoForm, setShowAddTodoForm] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoDueDate, setNewTodoDueDate] = useState("");
  const [newTodoProjectId, setNewTodoProjectId] = useState<Id<"projects"> | "">("");
  const [newTodoPriority, setNewTodoPriority] = useState<"low" | "medium" | "high">("medium");
  const [dashboardQuickTodoText, setDashboardQuickTodoText] = useState("");
  const [showDashboardQuickAdd, setShowDashboardQuickAdd] = useState(false);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);

  const calendarYear = now.getFullYear();
  const calendarMonth = now.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarFirst = startOfDayLocal(calendarYear, calendarMonth - 2, 1);
  const calendarLast = startOfDayLocal(calendarYear, calendarMonth + 3, 0);
  const showOfficeSchedule =
    useCardView ||
    useAccountingCardView ||
    useAdminDashboardView ||
    usePrincipalDashboardView ||
    useSiteSuperDashboardView;
  const personalSchedule = useQuery(
    api.personalCalendar.listMyEvents,
    showOfficeSchedule ? { startDate: calendarFirst, endDate: calendarLast } : "skip"
  );
  const boardroomSchedule = useQuery(
    api.boardroom.listApprovedForCalendar,
    showOfficeSchedule ? { startDate: calendarFirst, endDate: calendarLast } : "skip"
  );
  const milestoneUsers = useQuery(api.boardroom.listMilestoneUsers, showOfficeSchedule ? {} : "skip");
  const milestoneDayTimestamps = useMemo(() => {
    const timestamps: number[] = [];
    for (let ts = calendarFirst; ts <= calendarLast; ts += DAY_MS) {
      timestamps.push(ts);
    }
    return timestamps;
  }, [calendarFirst, calendarLast]);
  const bookingsByDate = useMemo(() => {
    const milestoneByDate = milestoneEntriesByDate(milestoneUsers, milestoneDayTimestamps, {
      includeEmploymentAnniversaries: user?.role === "admin",
    });
    return buildCalendarEventsByDate({
      personalEvents: personalSchedule as DashboardCalendarEntry[] | undefined,
      boardroomEvents: boardroomSchedule as DashboardCalendarEntry[] | undefined,
      milestoneByDate: milestoneByDate as Map<number, DashboardCalendarEntry[]>,
    });
  }, [personalSchedule, boardroomSchedule, milestoneUsers, milestoneDayTimestamps, user?.role]);

  const projectTableRows = useMemo(() => {
    if (useCardView || useAdminDashboardView || usePrincipalDashboardView) {
      if (dashboardProjects === undefined) return undefined;
      return (dashboardProjects ?? []).map((r: any) => r.project).filter(Boolean);
    }
    if (useAccountingCardView) return [];
    return listProjects;
  }, [dashboardProjects, listProjects, useAdminDashboardView, useCardView, useAccountingCardView, usePrincipalDashboardView]);

  const showProjectCards = useCardView || useAdminDashboardView;
  const favouriteSiteSuperRow = useMemo(() => {
    if (!useSiteSuperDashboardView || !dashboardProjects) return null;
    return (dashboardProjects ?? []).find((row) => row.isFavourite) ?? null;
  }, [dashboardProjects, useSiteSuperDashboardView]);
  const favouriteSiteSuperProject = favouriteSiteSuperRow?.project ?? null;
  const siteSuperProjectTasks = useQuery(
    api.tasks.listTasksByProject,
    favouriteSiteSuperProject ? { projectId: favouriteSiteSuperProject._id } : "skip"
  );
  const siteSuperTodayTasks = useMemo(() => {
    if (!siteSuperProjectTasks) return [];
    const todayKey = getDayKeyCentral(Date.now());
    return (siteSuperProjectTasks ?? [])
      .filter((task) => task.status !== "done")
      .filter((task) => {
        if (!task.dueDate) return false;
        return getDayKeyCentral(task.dueDate) === todayKey;
      })
      .sort((a, b) => (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 8);
  }, [siteSuperProjectTasks]);
  const siteSuperPersonalTodos = useMemo(() => {
    return (pmTodoItems ?? [])
      .filter((item) => item.completed !== true)
      .sort((a, b) => {
        const aDue = a.dueDate ?? Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ?? Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      })
      .slice(0, 8);
  }, [pmTodoItems]);
  const siteSuperUpcomingTasks = useMemo(() => {
    if (!siteSuperProjectTasks) return [];
    return (siteSuperProjectTasks ?? [])
      .filter((task) => task.status !== "done")
      .filter((task) => (task.dueDate ?? 0) > todayStart)
      .sort((a, b) => {
        const aDue = a.dueDate ?? Number.MAX_SAFE_INTEGER;
        const bDue = b.dueDate ?? Number.MAX_SAFE_INTEGER;
        if (aDue !== bDue) return aDue - bDue;
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      })
      .slice(0, 8);
  }, [siteSuperProjectTasks, todayStart]);
  const siteSuperStatusSlices = useMemo(() => {
    const tasks = siteSuperProjectTasks ?? [];
    const counts = {
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      completed: tasks.filter((task) => task.status === "done").length,
      notStarted: tasks.filter((task) => task.status === "not_started").length,
    };
    const total = counts.inProgress + counts.completed + counts.notStarted;
    const palette = {
      inProgress: "#059669",
      completed: "#16a34a",
      notStarted: "#94a3b8",
    };
    let cursor = 0;
    const stops = ([
      ["In Progress", counts.inProgress, palette.inProgress],
      ["Completed", counts.completed, palette.completed],
      ["Not Started", counts.notStarted, palette.notStarted],
    ] as const).map(([label, count, color]) => {
      const start = total > 0 ? (cursor / total) * 360 : 0;
      cursor += count;
      const end = total > 0 ? (cursor / total) * 360 : 0;
      return { label, count, color, start, end };
    });
    const gradient =
      total > 0 ? `conic-gradient(${stops.map((s) => `${s.color} ${s.start}deg ${s.end}deg`).join(", ")})` : "#e5e7eb";
    return { total, stops, gradient };
  }, [siteSuperProjectTasks]);
  const siteSuperQuickLinks = useMemo(
    () => [
      {
        key: "sign-in-out",
        label: "Sign in / out form",
        description: "Open the external sign-in/out form for this project.",
        to: favouriteSiteSuperProject
          ? `/safety/project/${favouriteSiteSuperProject._id}/job-sign-in-out/external`
          : null,
        disabledReason: favouriteSiteSuperProject
          ? undefined
          : "Choose a favourite project in Project Tracker to enable this link.",
      },
      {
        key: "incidents",
        label: "Incident report",
        description: "Open the fillable incident report form.",
        to: favouriteSiteSuperProject ? `/safety/project/${favouriteSiteSuperProject._id}/incidents` : null,
        disabledReason: favouriteSiteSuperProject
          ? undefined
          : "Choose a favourite project in Project Tracker to enable this link.",
      },
      {
        key: "inventory-form",
        label: "Inventory form",
        description: "Open the fillable inventory form.",
        to: "/inventory-form",
      },
    ],
    [favouriteSiteSuperProject]
  );

  const safetyDashboardFavouriteRow = useMemo(() => {
    if (!useSafetyDashboardView || !dashboardProjects) return null;
    return (
      (dashboardProjects as { isFavourite: boolean; project: Doc<"projects"> }[]).find((r) => r.isFavourite) ?? null
    );
  }, [dashboardProjects, useSafetyDashboardView]);
  const safetyDashboardFavouriteProject = safetyDashboardFavouriteRow?.project ?? null;
  const safetyQuickLinks = useMemo(() => {
    const pid = safetyDashboardFavouriteProject?._id;
    const needFavourite =
      "Choose a favourite project in Project Tracker to enable this link.";
    return [
      {
        key: "sign-in-out",
        label: "Trade & site super sign-in/out",
        description: "Open the external sign-in/out form for your selected job.",
        to: pid ? `/safety/project/${pid}/job-sign-in-out/external` : null,
        disabledReason: pid ? undefined : needFavourite,
      },
      {
        key: "sign-in-logs",
        label: "Trade & site super sign-in/out logs",
        description: "View today and historical sign-in/out logs in the app.",
        to: pid ? `/safety/project/${pid}/job-sign-in-out` : null,
        disabledReason: pid ? undefined : needFavourite,
      },
      {
        key: "incidents",
        label: "Incident reports",
        description: "Record and track safety incidents for the selected job.",
        to: pid ? `/safety/project/${pid}/incidents` : null,
        disabledReason: pid ? undefined : needFavourite,
      },
      {
        key: "trades",
        label: "Trade employee forms",
        description: "Trades on the job and employee safety documents per trade.",
        to: pid ? `/safety/project/${pid}/trades` : null,
        disabledReason: pid ? undefined : needFavourite,
      },
      {
        key: "equipment-form",
        label: "Equipment checkout",
        description: "Open the equipment checkout form (choose project on the form).",
        to: "/inventory-form",
      },
      {
        key: "master-equipment",
        label: "Master equipment log",
        description: "Catalog and status of equipment in Inventory.",
        to: "/inventory#master-equipment-log",
      },
    ];
  }, [safetyDashboardFavouriteProject]);

  function toggleFavourite(projectId: Id<"projects">, isFavourite: boolean) {
    if (isFavourite) {
      removeFavourite({ projectId });
    } else {
      addFavourite({ projectId });
    }
  }

  const workWeekDays = useMemo(() => {
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    const day = monday.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    monday.setDate(monday.getDate() - diffToMonday + calendarWeekOffset * 7);
    return Array.from({ length: WORK_WEEK_DAYS }, (_, idx) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + idx);
      return {
        key: date.getTime(),
        ts: date.getTime(),
        label: date.toLocaleDateString(undefined, { weekday: "short" }),
        day: date.getDate(),
      };
    });
  }, [calendarWeekOffset, now]);
  const workWeekRangeLabel = useMemo(() => {
    if (workWeekDays.length === 0) return "";
    const first = new Date(workWeekDays[0].ts);
    const last = new Date(workWeekDays[workWeekDays.length - 1].ts);
    const firstText = first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const lastText = last.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${firstText} - ${lastText}`;
  }, [workWeekDays]);
  const todayOpenTodos = useMemo(
    () =>
      (pmTodoItems ?? [])
        .filter((item) => item.completed !== true)
        .filter((item) => {
          if (item.dueDate == null) return false;
          const d = new Date(item.dueDate);
          return (
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate()
          );
        }),
    [pmTodoItems, now]
  );
  const dashboardTodayItems = useMemo(() => {
    if (useCardView || useAdminDashboardView) {
      const projectIdSet = new Set(
        (dashboardProjects ?? [])
          .map((row: any) => row?.project?._id as string | undefined)
          .filter((id): id is string => Boolean(id))
      );
      const isDueToday = (dueDate?: number) => {
        if (dueDate == null) return false;
        const d = new Date(dueDate);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      };
      return (upcomingDashboardTasksForCards ?? [])
        .filter((task) => projectIdSet.has(task.projectId))
        .filter((task) => isDueToday(task.dueDate))
        .slice(0, 8)
        .map((task) => ({
          id: task.taskId,
          projectId: task.projectId,
          text: task.title || "Untitled task",
          projectName: task.projectName,
        }));
    }
    return todayOpenTodos.slice(0, 8).map((todo) => ({
      id: todo._id,
      projectId: undefined as string | undefined,
      text: todo.text,
      projectName: undefined as string | undefined,
    }));
  }, [dashboardProjects, now, todayOpenTodos, upcomingDashboardTasksForCards, useAdminDashboardView, useCardView]);
  const dashboardNotifications = useMemo(() => {
    const apiNotifications: DashboardNotificationItem[] = (notificationsToday ?? []).map((notification) => ({
      id: `notification-${notification._id}`,
      text: notification.title || notification.body || "Notification",
      body: notification.body,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      notificationId: notification._id,
      link: notification.link,
      projectId: notification.projectId,
      bookingId: notification.bookingId,
      incidentId: notification.incidentId,
    }));
    return apiNotifications.sort((a, b) => b.createdAt - a.createdAt);
  }, [notificationsToday]);

  const unreadDashboardNotificationCount = useMemo(
    () => dashboardNotifications.filter((n) => n.notificationId && !n.readAt).length,
    [dashboardNotifications]
  );

  async function handleDashboardMarkNotificationRead(notificationId: Id<"notifications">) {
    await markNotificationAsRead({ notificationId });
  }

  async function handleDashboardMarkAllNotificationsRead() {
    await markAllNotificationsAsRead({});
  }

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) return;
    try {
      await addTodoItem({
        text,
        dueDate: dateInputToTimestamp(newTodoDueDate),
        projectId: newTodoProjectId || undefined,
        priority: newTodoPriority,
      });
      setNewTodoText("");
      setNewTodoDueDate("");
      setNewTodoProjectId("");
      setNewTodoPriority("medium");
      setShowAddTodoForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add item.");
    }
  }

  async function toggleTodoCompleted(id: Id<"pmTodoList">, completed: boolean) {
    try {
      await updateTodoItem({ id, completed: !completed });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update item.");
    }
  }

  async function setTodoPriority(id: Id<"pmTodoList">, priority: "low" | "medium" | "high") {
    try {
      await updateTodoItem({ id, priority });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update priority.");
    }
  }

  async function handleDashboardQuickAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const text = dashboardQuickTodoText.trim();
    if (!text) return;
    try {
      await addTodoItem({ text });
      setDashboardQuickTodoText("");
      setShowDashboardQuickAdd(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add item.");
    }
  }

  const dashboardTodoCard =
    user !== undefined ? (
      <div style={{ ...shellCardStyle, marginTop: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f9fafb", margin: 0 }}>
            To-Do List
          </h2>
          {!showAddTodoForm && (
            <button
              type="button"
              onClick={() => setShowAddTodoForm(true)}
              aria-label="Add to-do"
              title="Add to-do"
              style={{
                width: "1.8rem",
                height: "1.8rem",
                borderRadius: "0.35rem",
                border: "1px solid #059669",
                backgroundColor: "#ecfdf5",
                color: "#059669",
                fontWeight: 700,
                fontSize: "1rem",
                lineHeight: 1,
                cursor: "pointer",
                fontFamily: "Montserrat, sans-serif",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          )}
        </div>
        {!showAddTodoForm ? (
          <div style={{ marginBottom: "0.25rem" }} />
        ) : (
          <form
            onSubmit={handleAddTodo}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "flex-end",
              marginBottom: "1rem",
            }}
          >
            <div style={{ flex: "1 1 12rem", minWidth: "10rem" }}>
              <input
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Add a task..."
                autoFocus
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: "0.9375rem",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginRight: "0.25rem" }}>Priority</span>
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewTodoPriority(opt.value)}
                  title={opt.label}
                  style={{
                    padding: "0.35rem 0.5rem",
                    border: newTodoPriority === opt.value ? "2px solid #059669" : "1px solid #e5e7eb",
                    borderRadius: "0.375rem",
                    background: newTodoPriority === opt.value ? "#ecfdf5" : "#fff",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                  }}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={newTodoDueDate}
              onChange={(e) => setNewTodoDueDate(e.target.value)}
            />
            <select
              value={newTodoProjectId}
              onChange={(e) => setNewTodoProjectId((e.target.value || "") as Id<"projects"> | "")}
              style={{ minWidth: "8rem" }}
            >
              <option value="">No project</option>
              {(todoListProjects ?? []).map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!newTodoText.trim()}
              style={{ ...primaryButtonStyle, fontSize: "0.875rem", opacity: !newTodoText.trim() ? 0.6 : 1 }}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddTodoForm(false);
                setNewTodoText("");
                setNewTodoDueDate("");
                setNewTodoProjectId("");
                setNewTodoPriority("medium");
              }}
              style={{ ...secondaryButtonStyle, fontSize: "0.875rem" }}
            >
              Cancel
            </button>
          </form>
        )}
        {pmTodoItems === undefined ? (
          <p style={{ color: "#ffffff", fontSize: "0.875rem" }}>Loading...</p>
        ) : (pmTodoItems ?? []).filter((item) => item.completed !== true).length === 0 ? (
          <p style={{ color: "#ffffff", fontSize: "0.875rem", margin: 0 }}>
            No items yet. Add one above.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.9375rem", color: "#ffffff", listStyle: "none" }}>
            {(pmTodoItems ?? []).filter((item) => item.completed !== true).map((item) => {
              const isCompleted = item.completed === true;
              return (
                <li key={item._id} style={{ marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => toggleTodoCompleted(item._id, isCompleted)}
                    aria-label={isCompleted ? "Mark as not done" : "Mark as done"}
                    style={{
                      width: "1.125rem",
                      height: "1.125rem",
                      marginTop: "0.2rem",
                      cursor: "pointer",
                      accentColor: "#059669",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setTodoPriority(
                        item._id,
                        PRIORITY_OPTIONS[
                          (PRIORITY_OPTIONS.findIndex((o) => o.value === (item.priority ?? "medium")) + 1) % 3
                        ].value
                      )
                    }
                    title="Cycle priority"
                    style={{
                      padding: "0.2rem",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      lineHeight: 1,
                    }}
                  >
                    <PriorityIcon priority={item.priority ?? "medium"} />
                  </button>
                  <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                    <div
                      style={{
                        color: isCompleted ? "#d1d5db" : "#ffffff",
                        textDecoration: isCompleted ? "line-through" : undefined,
                      }}
                    >
                      {item.text}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "#e5e7eb", marginTop: "0.2rem" }}>
                      {item.createdByRole != null && (
                        <span style={{ color: "#bbf7d0", fontWeight: 500 }}>
                          {item.createdByRole.replace(/_/g, " ")}
                        </span>
                      )}
                      {item.dueDate != null && (
                        <span style={{ marginLeft: "0.35rem" }}>· {formatDate(item.dueDate)}</span>
                      )}
                      {item.projectName != null && (
                        <span style={{ marginLeft: "0.35rem" }}>· {item.projectName}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    ) : null;

  const adminDashboardPalette = useAdminDashboardView || useCardView
    ? {
        panelBorder: "var(--color-emerald-800)",
        panelBackground: "var(--surface-panel)",
        panelHeading: "var(--text-primary)",
        tileBackground: "var(--surface-card)",
        tileBorder: "var(--border-strong)",
        mutedText: "var(--text-secondary)",
        separator: "#6ee7b7",
        panelShadow: "0 10px 22px rgba(6, 95, 70, 0.2)",
        headingAccent: "4px solid var(--color-emerald-600)",
      }
    : {
        panelBorder: "#2f7d68",
        panelBackground: "var(--surface-panel)",
        panelHeading: "var(--text-primary)",
        tileBackground: "var(--surface-muted)",
        tileBorder: "var(--border-strong)",
        mutedText: "var(--text-secondary)",
        separator: "var(--border-strong)",
        panelShadow: "none",
        headingAccent: "none",
      };

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", maxWidth: "100%", overflowX: "hidden", minWidth: 0 }}>
      <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>
        Dashboard <LogoMark />
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Welcome, {user?.name ?? user?.email ?? "User"}.
      </p>

      {useSiteSuperDashboardView ? (
        <div style={{ width: "100%", minWidth: 0 }}>
          {dashboardProjects === undefined ? (
            <div style={shellCardStyle}>
              <p style={{ color: "#ffffff", fontSize: "0.875rem", margin: 0 }}>Loading...</p>
            </div>
          ) : !favouriteSiteSuperRow ? (
            <div style={shellCardStyle}>
              <p style={{ color: "#ffffff", fontSize: "0.875rem", margin: 0 }}>
                Favourite a project from the{" "}
                <Link to="/projects" style={{ color: "#a7f3d0", fontWeight: 600, textDecoration: "none" }}>
                  Project Tracker
                </Link>{" "}
                to show this dashboard.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "minmax(0, 1fr)"
                  : "minmax(13rem, 0.8fr) minmax(16rem, 1fr) minmax(16rem, 1fr)",
                gridTemplateRows: isMobile ? "auto" : "auto auto auto",
                gridTemplateAreas: isMobile
                  ? undefined
                  : `"project forms calendarList" "today pie calendarList" "todo week week"`,
                gap: "1rem",
                alignItems: "stretch",
                width: "100%",
                minWidth: 0,
              }}
            >
              <div style={{ ...shellCardStyle, gridArea: "project", margin: 0 }}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 700, letterSpacing: "0.04em", color: "#a7f3d0", margin: "0 0 0.65rem 0", textTransform: "uppercase" }}>
                  Project
                </h2>
                <Link
                  to={`/projects/${favouriteSiteSuperRow.project._id}`}
                  style={{ color: "#ffffff", fontSize: "1.2rem", fontWeight: 700, textDecoration: "none", lineHeight: 1.3 }}
                >
                  {favouriteSiteSuperRow.project.name}
                </Link>
                <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "#d1fae5" }}>
                  {favouriteSiteSuperRow.project.clientName || "-"}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.65rem" }}>
                  {healthDot(favouriteSiteSuperRow.project.healthStatus)}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "0.375rem",
                      ...getProjectStatusStyle(favouriteSiteSuperRow.project.status),
                    }}
                  >
                    {favouriteSiteSuperRow.project.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div
                  style={{
                    ...cardStyle,
                    marginTop: "0.85rem",
                    border: "1px solid rgba(255,255,255,0.35)",
                    backgroundColor: "#059669",
                    color: "#ffffff",
                    padding: "0.85rem 0.95rem",
                  }}
                >
                  <h2 style={{ margin: "0 0 0.65rem 0", fontSize: "0.9rem", fontWeight: 700 }}>Project Dates</h2>
                  <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>Start:</span> {formatDate(favouriteSiteSuperRow.project.startDate)}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700 }}>End:</span> {formatDate(favouriteSiteSuperRow.project.endDate)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ ...shellCardStyle, gridArea: "forms", margin: 0 }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#f9fafb", marginBottom: "0.75rem" }}>
                  Forms
                </h2>
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  {siteSuperQuickLinks.map((item) =>
                    item.to ? (
                      <Link
                        key={item.key}
                        to={item.to}
                        style={{
                          display: "block",
                          textDecoration: "none",
                          border: "1px solid rgba(255,255,255,0.25)",
                          borderRadius: "0.5rem",
                          padding: "0.7rem 0.8rem",
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <div style={{ color: "#d1fae5", fontWeight: 600, fontSize: "0.875rem" }}>
                          {item.label} {"->"}
                        </div>
                      </Link>
                    ) : (
                      <div
                        key={item.key}
                        style={{
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "0.5rem",
                          padding: "0.7rem 0.8rem",
                          backgroundColor: "rgba(255,255,255,0.04)",
                        }}
                      >
                        <div style={{ color: "#a7f3d0", fontWeight: 600, fontSize: "0.875rem" }}>
                          {item.label}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div style={{ ...cardStyle, ...innerWhiteCardStyle, gridArea: "today", margin: 0 }}>
                <h2 style={{ margin: "0 0 0.65rem 0", fontSize: "1rem", color: "var(--text-primary)" }}>Today&apos;s Tasks</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "var(--surface-muted)" }}>
                        <th style={{ textAlign: "left", padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>Task</th>
                        <th style={{ textAlign: "left", padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>Status</th>
                        <th style={{ textAlign: "left", padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteSuperTodayTasks.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: "0.5rem", color: "var(--text-secondary)" }}>
                            No tasks due today.
                          </td>
                        </tr>
                      ) : (
                        siteSuperTodayTasks.map((task) => (
                          <tr key={task._id}>
                            <td style={{ padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>{task.title || "Untitled task"}</td>
                            <td style={{ padding: "0.45rem", borderBottom: "1px solid var(--border-soft)", textTransform: "capitalize" }}>
                              {task.status.replace(/_/g, " ")}
                            </td>
                            <td style={{ padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>{formatDate(task.dueDate)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ ...cardStyle, ...innerWhiteCardStyle, gridArea: "todo", margin: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.65rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)" }}>Personal To-Do</h2>
                  <button
                    type="button"
                    onClick={() => setShowDashboardQuickAdd((v) => !v)}
                    aria-label="Add to-do"
                    title="Add to-do"
                    style={{
                      width: "1.45rem",
                      height: "1.45rem",
                      borderRadius: "0.35rem",
                      border: "1px solid var(--border-strong)",
                      backgroundColor: "transparent",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                </div>
                {showDashboardQuickAdd && (
                  <form onSubmit={handleDashboardQuickAddTodo} style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.55rem" }}>
                    <input
                      type="text"
                      value={dashboardQuickTodoText}
                      onChange={(e) => setDashboardQuickTodoText(e.target.value)}
                      placeholder="Add a task..."
                      autoFocus
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "0.35rem 0.5rem",
                        borderRadius: "0.35rem",
                        border: "1px solid var(--border-strong)",
                        fontFamily: "Montserrat, sans-serif",
                        fontSize: "0.8125rem",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!dashboardQuickTodoText.trim()}
                      style={{
                        ...primaryButtonStyle,
                        padding: "0.35rem 0.55rem",
                        fontSize: "0.75rem",
                        opacity: !dashboardQuickTodoText.trim() ? 0.6 : 1,
                      }}
                    >
                      Add
                    </button>
                  </form>
                )}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "var(--surface-muted)" }}>
                        <th style={{ textAlign: "left", padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>Task</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteSuperPersonalTodos.length === 0 ? (
                        <tr>
                          <td style={{ padding: "0.5rem", color: "var(--text-secondary)" }}>
                            No personal to-dos yet.
                          </td>
                        </tr>
                      ) : (
                        siteSuperPersonalTodos.map((item) => (
                          <tr key={item._id}>
                            <td style={{ padding: "0.45rem", borderBottom: "1px solid var(--border-soft)" }}>
                              <label style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start", cursor: "pointer" }}>
                                <input
                                  type="checkbox"
                                  checked={false}
                                  onChange={() => toggleTodoCompleted(item._id, false)}
                                  aria-label={`Mark ${item.text} as complete`}
                                  style={{
                                    marginTop: "0.1rem",
                                    width: "0.9rem",
                                    height: "0.9rem",
                                    accentColor: "var(--color-emerald-700)",
                                    cursor: "pointer",
                                    flexShrink: 0,
                                  }}
                                />
                                <span>{item.text}</span>
                              </label>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ ...cardStyle, ...innerWhiteCardStyle, gridArea: "pie", margin: 0 }}>
                <h2 style={{ margin: "0 0 0.7rem 0", fontSize: "1rem", color: "var(--text-primary)" }}>In Progress Tasks</h2>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div
                    style={{
                      width: "7.5rem",
                      height: "7.5rem",
                      borderRadius: "999px",
                      background: siteSuperStatusSlices.gradient,
                      border: "1px solid var(--border-soft)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ display: "grid", gap: "0.35rem", minWidth: "11rem" }}>
                    {siteSuperStatusSlices.stops.map((slice) => (
                      <div key={slice.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", fontSize: "0.8125rem" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ width: "0.7rem", height: "0.7rem", borderRadius: "999px", backgroundColor: slice.color }} />
                          {slice.label}
                        </span>
                        <strong style={{ color: "var(--text-primary)" }}>{slice.count}</strong>
                      </div>
                    ))}
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                      Total tasks: {siteSuperStatusSlices.total}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, ...innerWhiteCardStyle, gridArea: "calendarList", margin: 0, height: "100%" }}>
                <h2 style={{ margin: "0 0 0.65rem 0", fontSize: "1rem", color: "var(--text-primary)" }}>Task Calendar</h2>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {siteSuperUpcomingTasks.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      No upcoming future tasks.
                    </p>
                  ) : (
                    siteSuperUpcomingTasks.map((task) => (
                      <div key={task._id} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: "0.4rem", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                        <div>{task.title || "Untitled task"}</div>
                        <div style={{ color: "var(--text-secondary)", marginTop: "0.15rem" }}>{formatDate(task.dueDate)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Link
                to="/personal-calendar"
                style={{ textDecoration: "none", color: "inherit", gridArea: "week", display: "block", margin: 0 }}
              >
                <div style={{ ...cardStyle, ...innerWhiteCardStyle, height: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.65rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1rem", color: "var(--text-primary)" }}>Work Week</h2>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Open calendar {"->"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "0.45rem" }}>
                    {workWeekDays.map((day) => {
                      const dayEntries = (bookingsByDate.get(day.ts) ?? []).slice(0, 4);
                      return (
                        <div
                          key={day.key}
                          style={{
                            border: "1px solid var(--border-soft)",
                            borderRadius: "0.4rem",
                            padding: "0.45rem",
                            minHeight: "7.25rem",
                            backgroundColor: "var(--surface-muted)",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--text-primary)" }}>
                            {day.label} {day.day}
                          </div>
                          {dayEntries.length === 0 ? (
                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>No events</div>
                          ) : (
                            dayEntries.map((entry) => (
                              <div key={entry._id} style={{ fontSize: "0.72rem", color: "var(--text-primary)", marginBottom: "0.25rem", lineHeight: 1.3 }}>
                                {formatTime(entry.startTimeMinutes)} {entry.title || "Event"}
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Link>
            </div>
          )}
        </div>
      ) : useSafetyDashboardView ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "stretch", minHeight: 0, width: "100%" }}>
          <div style={{ flex: "1 1 45%", minWidth: 0 }}>
            <div style={shellCardStyle}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f9fafb", marginBottom: "1rem" }}>
                Select a project
              </h2>
              <p style={{ color: "#d1fae5", fontSize: "0.875rem", marginTop: 0, marginBottom: "0.75rem" }}>
                Open a job for trade employee forms, incident reports, and sign-in/out.
              </p>
              {listProjects === undefined ? (
                <p style={{ color: "#ffffff", fontSize: "0.875rem" }}>Loading...</p>
              ) : listProjects.length === 0 ? (
                <p style={{ color: "#ffffff", fontSize: "0.875rem", margin: 0 }}>
                  No projects yet. Create a project from{" "}
                  <Link to="/projects" style={{ color: "#a7f3d0", fontWeight: 600 }}>
                    Project Tracker
                  </Link>
                  .
                </p>
              ) : (
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
                    gap: "1rem",
                  }}
                >
                  {listProjects.map((p: Doc<"projects">) => (
                    <Link
                      key={p._id}
                      to={`/safety/project/${p._id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div
                        className="card-hover"
                        style={{
                          ...innerWhiteCardStyle,
                          cursor: "pointer",
                          transition: "box-shadow 0.2s",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1rem",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            marginBottom: "0.25rem",
                          }}
                        >
                          {p.name}
                        </div>
                        <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                          {p.clientName}
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "0.375rem",
                              ...getProjectStatusStyle(p.status),
                            }}
                          >
                            {p.status.replace(/_/g, " ")}
                          </span>
                          {healthDot(p.healthStatus)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ flex: "1 1 45%", minWidth: 0 }}>
            <div style={{ ...shellCardStyle, marginTop: "1rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#f9fafb", marginBottom: "0.75rem" }}>
                Forms &amp; links
              </h2>
              {dashboardProjects === undefined ? (
                <p style={{ color: "#d1fae5", fontSize: "0.875rem", margin: 0 }}>Loading...</p>
              ) : (
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  {safetyQuickLinks.map((item) =>
                    item.to ? (
                      <Link
                        key={item.key}
                        to={item.to}
                        style={{
                          display: "block",
                          textDecoration: "none",
                          border: "1px solid rgba(255,255,255,0.25)",
                          borderRadius: "0.5rem",
                          padding: "0.7rem 0.8rem",
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <div style={{ color: "#d1fae5", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.2rem" }}>
                          {item.label} {"->"}
                        </div>
                        <div style={{ color: "#ecfdf5", fontSize: "0.8125rem" }}>{item.description}</div>
                      </Link>
                    ) : (
                      <div
                        key={item.key}
                        style={{
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "0.5rem",
                          padding: "0.7rem 0.8rem",
                          backgroundColor: "rgba(255,255,255,0.04)",
                        }}
                      >
                        <div style={{ color: "#a7f3d0", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.2rem" }}>
                          {item.label}
                        </div>
                        <div style={{ color: "#d1fae5", fontSize: "0.8125rem" }}>
                          {item.disabledReason ?? "Not available right now."}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
            {dashboardTodoCard}
          </div>
        </div>
      ) : usePrincipalDashboardView ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "minmax(0, 1fr)"
              : "minmax(22rem, 1fr) minmax(30rem, 1.6fr)",
            gap: "1rem",
            alignItems: "stretch",
            width: "100%",
            minWidth: 0,
          }}
        >
          <div style={shellCardStyle}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f9fafb", marginBottom: "0.85rem" }}>Projects</h2>
            {dashboardProjects === undefined ? (
              <p style={{ color: "#d1fae5", fontSize: "0.875rem", margin: 0 }}>Loading...</p>
            ) : dashboardProjects.length === 0 ? (
              <p style={{ color: "#d1fae5", fontSize: "0.875rem", margin: 0 }}>
                No projects available. Open{" "}
                <Link to="/projects" style={{ color: "#a7f3d0", fontWeight: 600, textDecoration: "none" }}>
                  Project Tracker
                </Link>{" "}
                to add or review projects.
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                {(dashboardProjects ?? []).map((row: DashboardProjectRow) => {
                  const project = row.project;
                  return (
                    <Link
                      key={project._id}
                      to={`/projects/${project._id}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div className="card-hover" style={{ ...innerWhiteCardStyle, padding: "0.8rem" }}>
                        <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
                          {project.name}
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                          {project.clientName || "-"}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={shellCardStyle}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f9fafb", marginBottom: "0.75rem" }}>
                Big Task Upcoming Priority
              </h2>
              <div style={{ ...innerWhiteCardStyle, padding: "0.65rem 0.75rem", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--surface-muted)" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                        Project Name
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                        Task
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                        Description
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                        Trade
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {principalUpcomingTasks === undefined ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "0.65rem", color: "var(--text-secondary)" }}>
                          Loading upcoming tasks...
                        </td>
                      </tr>
                    ) : principalUpcomingTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "0.65rem", color: "var(--text-secondary)" }}>
                          No upcoming tasks across projects.
                        </td>
                      </tr>
                    ) : (
                      principalUpcomingTasks.map((task) => (
                        <tr key={task.taskId}>
                          <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                            <Link
                              to={`/projects/${task.projectId}`}
                              style={{ color: "#059669", fontWeight: 600, textDecoration: "none" }}
                            >
                              {task.projectName}
                            </Link>
                          </td>
                          <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                            <Link
                              to={`/projects/${task.projectId}/daily-reports`}
                              style={{ color: "#059669", textDecoration: "none", fontWeight: 600 }}
                            >
                              {task.title || "Untitled task"}
                            </Link>
                          </td>
                          <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-soft)", color: "var(--text-secondary)" }}>
                            {task.description || "-"}
                          </td>
                          <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>{task.trade || "-"}</td>
                          <td style={{ padding: "0.5rem", borderBottom: "1px solid var(--border-soft)" }}>
                            {task.taskCost == null ? "-" : `$${task.taskCost.toLocaleString()}`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div style={{ ...shellCardStyle, margin: 0 }}>
                <h2 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", color: "#f9fafb" }}>Recent Notifications</h2>
                <DashboardNotificationsList
                  items={dashboardNotifications}
                  emptyText="No unread notifications."
                  variant="principal"
                  unreadNotificationCount={unreadDashboardNotificationCount}
                  onMarkRead={handleDashboardMarkNotificationRead}
                  onMarkAllRead={handleDashboardMarkAllNotificationsRead}
                />
              </div>

              <Link to="/personal-calendar" style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ ...shellCardStyle, margin: 0, height: "100%" }}>
                  <h2 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", color: "#f9fafb" }}>Calendar</h2>
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    {workWeekDays.map((day) => {
                      const entries = (bookingsByDate.get(day.ts) ?? []).slice(0, 2);
                      return (
                        <div
                          key={day.key}
                          style={{
                            border: "1px solid rgba(255,255,255,0.22)",
                            borderRadius: "0.4rem",
                            padding: "0.35rem 0.45rem",
                            backgroundColor: "rgba(255,255,255,0.05)",
                          }}
                        >
                          <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#d1fae5" }}>
                            {day.label} {day.day}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#ecfdf5", marginTop: "0.2rem" }}>
                            {entries.length === 0 ? "No events" : `${entries.length} event${entries.length > 1 ? "s" : ""}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Link>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
                <div style={{ margin: 0 }}>{dashboardTodoCard}</div>
                <PrincipalWeeklyUpdateCard />
              </div>
            </div>
          </div>
        </div>
      ) : useCardView || useAdminDashboardView ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "0.9fr 1.35fr 1.35fr",
            gridTemplateRows: isMobile ? "auto" : "minmax(18rem, 1fr) minmax(18rem, 1fr)",
            gridTemplateAreas: isMobile
              ? undefined
              : `"projects today personal" "recent calendar calendar"`,
            gap: "1rem",
            alignItems: "stretch",
            minHeight: isMobile ? undefined : "calc(100vh - 14rem)",
            width: "100%",
            minWidth: 0,
          }}
        >
          <div
            style={{
              gridArea: "projects",
              border: "4px solid var(--color-emerald-900)",
              borderRadius: "0.5rem",
              backgroundColor: "var(--color-emerald-800)",
              padding: "1rem",
              boxShadow: adminDashboardPalette.panelShadow,
              color: "#ffffff",
            }}
          >
            <h2 style={{ margin: "0 0 0.85rem 0", fontSize: "1.1rem", color: "#ffffff", borderLeft: "4px solid #a7f3d0", paddingLeft: useAdminDashboardView || useCardView ? "0.45rem" : 0 }}>Projects</h2>
            {dashboardProjects === undefined ? (
              <p style={{ margin: 0, color: "#ecfdf5" }}>Loading...</p>
            ) : (
              <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "minmax(0, 1fr)" }}>
                {(dashboardProjects ?? [])
                  .filter((row: DashboardProjectRow) => Boolean(row.isFavourite))
                  .map((row: DashboardProjectRow) => (
                    <Link key={row.project._id} to={`/projects/${row.project._id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div
                        style={{
                          border: "1px solid var(--border-strong)",
                          borderRadius: "0.35rem",
                          padding: "0.75rem",
                          backgroundColor: "var(--surface-panel)",
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>{row.project.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{row.project.clientName || "-"}</div>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </div>

          <div style={{ gridArea: "today", height: "100%" }}>
            <div style={{ border: `4px solid ${adminDashboardPalette.panelBorder}`, borderRadius: "0.5rem", backgroundColor: adminDashboardPalette.panelBackground, padding: "1rem", height: "100%", minHeight: "18rem", boxShadow: adminDashboardPalette.panelShadow }}>
              <h2 style={{ margin: "0 0 0.8rem 0", fontSize: "1.1rem", color: adminDashboardPalette.panelHeading, borderLeft: adminDashboardPalette.headingAccent, paddingLeft: useAdminDashboardView || useCardView ? "0.45rem" : 0 }}>Today&apos;s Tasks</h2>
              <div style={{ display: "grid", gap: "0.55rem" }}>
                {dashboardTodayItems.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.82rem", color: adminDashboardPalette.mutedText }}>No tasks due today.</p>
                ) : (
                  dashboardTodayItems.map((item) => {
                    const cardStyle = {
                      fontSize: "0.86rem",
                      border: `2px solid ${adminDashboardPalette.panelBorder}`,
                      borderRadius: "0.45rem",
                      padding: "0.55rem 0.6rem",
                      backgroundColor: "var(--surface-panel)",
                    };
                    return (
                      <div key={item.id} style={cardStyle}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const target = item.projectId
                              ? `/projects/${item.projectId}/schedule`
                              : "/tasks/new";
                            navigate(target);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            color: adminDashboardPalette.panelBorder,
                            textDecoration: "underline",
                            cursor: "pointer",
                            font: "inherit",
                            fontWeight: 600,
                            textAlign: "left",
                          }}
                        >
                          {item.text}
                        </button>
                        {item.projectName && (
                          <div style={{ marginTop: "0.22rem", fontSize: "0.72rem", color: adminDashboardPalette.mutedText }}>
                            {item.projectName}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div style={{ gridArea: "personal", border: `4px solid ${adminDashboardPalette.panelBorder}`, borderRadius: "0.5rem", backgroundColor: adminDashboardPalette.panelBackground, padding: "1rem", height: "100%", minHeight: "18rem", boxShadow: adminDashboardPalette.panelShadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", marginBottom: "0.8rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: adminDashboardPalette.panelHeading, borderLeft: adminDashboardPalette.headingAccent, paddingLeft: useAdminDashboardView || useCardView ? "0.45rem" : 0 }}>
                Personal To-Do List
              </h2>
              <button
                type="button"
                onClick={() => setShowDashboardQuickAdd((v) => !v)}
                aria-label="Add to-do item"
                title="Add to-do item"
                style={{
                  width: "1.8rem",
                  height: "1.8rem",
                  borderRadius: "0.4rem",
                  border: "1px solid var(--color-emerald-800)",
                  backgroundColor: "#ecfdf5",
                  color: "var(--color-emerald-800)",
                  fontWeight: 700,
                  fontSize: "1rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                +
              </button>
            </div>
            {showDashboardQuickAdd && (
              <form onSubmit={handleDashboardQuickAddTodo} style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.7rem" }}>
                <input
                  type="text"
                  value={dashboardQuickTodoText}
                  onChange={(e) => setDashboardQuickTodoText(e.target.value)}
                  placeholder="Add a task..."
                  autoFocus
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "0.38rem 0.55rem",
                    borderRadius: "0.4rem",
                    border: "1px solid #d1d5db",
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: "0.82rem",
                  }}
                />
                <button type="submit" disabled={!dashboardQuickTodoText.trim()} style={{ ...primaryButtonStyle, padding: "0.38rem 0.6rem", fontSize: "0.78rem", opacity: !dashboardQuickTodoText.trim() ? 0.6 : 1 }}>
                  Add
                </button>
              </form>
            )}
            <div style={{ display: "grid", gap: "0.4rem" }}>
              {(pmTodoItems ?? [])
                .filter((item) => item.completed !== true)
                .slice(0, 7)
                .map((item) => (
                  <label key={item._id} style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start", fontSize: "0.84rem", borderBottom: `1px dashed ${adminDashboardPalette.separator}`, paddingBottom: "0.3rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleTodoCompleted(item._id, false)}
                      aria-label={`Mark ${item.text} as complete`}
                      style={{ marginTop: "0.15rem", width: "0.95rem", height: "0.95rem", accentColor: "var(--color-emerald-700)", cursor: "pointer" }}
                    />
                    <span>{item.text}</span>
                  </label>
                ))}
              {(pmTodoItems ?? []).filter((item) => item.completed !== true).length === 0 && (
                <p style={{ margin: 0, fontSize: "0.82rem", color: adminDashboardPalette.mutedText }}>No personal to-dos yet.</p>
              )}
            </div>
          </div>

          <Link
            to="/personal-calendar"
            style={{ textDecoration: "none", color: "inherit", gridArea: "calendar", display: "block", height: "100%" }}
          >
            <div style={{ border: `4px solid ${adminDashboardPalette.panelBorder}`, borderRadius: "0.5rem", backgroundColor: "var(--surface-panel)", padding: "1rem", height: "100%", boxShadow: adminDashboardPalette.panelShadow, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.8rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.1rem", color: adminDashboardPalette.panelHeading, borderLeft: adminDashboardPalette.headingAccent, paddingLeft: useAdminDashboardView || useCardView ? "0.45rem" : 0 }}>{useCardView ? "Schedule" : "Calendar"}</h2>
                  <div style={{ fontSize: "0.72rem", color: adminDashboardPalette.mutedText, marginTop: "0.2rem" }}>{workWeekRangeLabel}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label="Previous week"
                    title="Previous week"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCalendarWeekOffset((w) => w - 1);
                    }}
                    style={{
                      width: "1.65rem",
                      height: "1.65rem",
                      borderRadius: "0.35rem",
                      border: "1px solid var(--color-emerald-800)",
                      backgroundColor: "#ecfdf5",
                      color: "var(--color-emerald-900)",
                      cursor: "pointer",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {"<"}
                  </button>
                  <button
                    type="button"
                    aria-label="Next week"
                    title="Next week"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCalendarWeekOffset((w) => w + 1);
                    }}
                    style={{
                      width: "1.65rem",
                      height: "1.65rem",
                      borderRadius: "0.35rem",
                      border: "1px solid var(--color-emerald-800)",
                      backgroundColor: "#ecfdf5",
                      color: "var(--color-emerald-900)",
                      cursor: "pointer",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {">"}
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gridAutoRows: "1fr", gap: "0.35rem", flex: 1 }}>
                {workWeekDays.map((day) => {
                  const dayEntries = bookingsByDate.get(day.ts) ?? [];
                  const isPastDay = day.ts < todayStart;
                  return (
                    <div
                      key={day.key}
                      style={{
                        border: "1px solid var(--color-emerald-900)",
                        borderRadius: "0.25rem",
                        minHeight: 0,
                        height: "100%",
                        padding: "0.35rem",
                        backgroundColor: useAdminDashboardView || useCardView ? "var(--color-emerald-800)" : undefined,
                        backgroundImage:
                          useAdminDashboardView || useCardView
                            ? "linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 28%, rgba(0,0,0,0.06) 100%)"
                            : undefined,
                        boxShadow:
                          useAdminDashboardView || useCardView
                            ? "inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 14px rgba(2, 44, 34, 0.22)"
                            : undefined,
                      }}
                    >
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.3rem", color: "#ffffff" }}>
                        {day.label} {day.day}
                      </div>
                      {dayEntries.slice(0, 4).map((entry) => {
                        const chipColors = dashboardBookingChipColors(entry, isPastDay);
                        return (
                          <div
                            key={entry._id}
                            style={{
                              fontSize: "0.72rem",
                              marginBottom: "0.24rem",
                              color: chipColors.color,
                              backgroundColor: chipColors.backgroundColor,
                              borderRadius: "0.25rem",
                              padding: "0.16rem 0.3rem",
                              border: "1px solid rgba(15, 23, 42, 0.15)",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{formatTime(entry.startTimeMinutes)}</span> - {entry.title || "Event"}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </Link>

          <div style={{ gridArea: "recent", border: `4px solid ${adminDashboardPalette.panelBorder}`, borderRadius: "0.5rem", backgroundColor: adminDashboardPalette.panelBackground, padding: "1rem", height: "100%", minHeight: "18rem", boxShadow: adminDashboardPalette.panelShadow }}>
            <h2 style={{ margin: "0 0 0.8rem 0", fontSize: "1.1rem", color: adminDashboardPalette.panelHeading, borderLeft: adminDashboardPalette.headingAccent, paddingLeft: useAdminDashboardView || useCardView ? "0.45rem" : 0 }}>Recent Notifications</h2>
            <DashboardNotificationsList
              items={dashboardNotifications}
              emptyText="No unread notifications."
              variant="admin"
              unreadNotificationCount={unreadDashboardNotificationCount}
              onMarkRead={handleDashboardMarkNotificationRead}
              onMarkAllRead={handleDashboardMarkAllNotificationsRead}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start", minHeight: 0 }}>
          <div style={{ flex: "1 1 55%", minWidth: 0 }}>
            <div style={shellCardStyle}>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#f9fafb", marginBottom: "1rem" }}>
                Projects
              </h2>
              {useAccountingCardView ? (
                accountingFavouriteDashboard === undefined ? (
                  <p style={{ color: "#d1fae5", fontSize: "0.875rem" }}>Loading...</p>
                ) : accountingFavouriteDashboard.length === 0 ? (
                  <p style={{ color: "#ffffff", fontSize: "0.875rem", margin: 0 }}>
                    Favourite a project from the{" "}
                    <Link to="/projects" style={{ color: "#059669", fontWeight: 600 }}>
                      Project Tracker
                    </Link>{" "}
                    to show it here.
                  </p>
                ) : (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    {(accountingFavouriteDashboard as AccountingFavouriteDashboardRow[]).map((row) => {
                      const project = row.project;
                      return (
                        <Link
                          key={project._id}
                          to={`/accounting?project=${project._id}`}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <div
                            className="card-hover"
                            style={{
                              ...innerWhiteCardStyle,
                              cursor: "pointer",
                              position: "relative",
                              border: "1px solid #059669",
                              boxShadow: "0 2px 12px rgba(16,185,129,0.35)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: "0.5rem",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "1rem",
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  marginBottom: "0.25rem",
                                  flex: 1,
                                }}
                              >
                                {project.name}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleFavourite(project._id, true);
                                }}
                                aria-label="Remove from My job"
                                title="Remove from My job (hide from Dashboard)"
                                style={{
                                  padding: "0.35rem 0.5rem",
                                  border: "none",
                                  background: "none",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  fontFamily: "inherit",
                                  fontSize: "1.25rem",
                                  lineHeight: 1,
                                  letterSpacing: "-0.05em",
                                  color: "#059669",
                                }}
                              >
                                ❯❯❯❯
                              </button>
                            </div>
                            <div
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--text-secondary)",
                                marginBottom: "0.25rem",
                              }}
                            >
                              {project.clientName || "-"}
                            </div>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                marginBottom: "0.35rem",
                              }}
                            >
                              {project.location || "Location not set"}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "center",
                                marginBottom: "0.45rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "0.375rem",
                                  ...getProjectStatusStyle(project.status),
                                }}
                              >
                                {project.status.replace(/_/g, " ")}
                              </span>
                              {healthDot(project.healthStatus)}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8125rem",
                                color: "var(--text-secondary)",
                                marginBottom: "0.35rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ color: "var(--text-secondary)" }}>Budget:</span>
                              {healthDot(row.budgetHealth)}
                              <span style={{ fontWeight: 500 }}>{budgetHealthLabel(row.budgetHealth)}</span>
                            </div>
                            <div
                              style={{
                                fontSize: "0.78rem",
                                color: "#4b5563",
                                lineHeight: 1.45,
                              }}
                            >
                              <div>
                                Change orders (90d):{" "}
                                {row.changeOrderCountRecent > 0
                                  ? `${row.changeOrderCountRecent} · latest ${formatDate(row.changeOrderLatestRecent)}`
                                  : "none"}
                              </div>
                              <div>
                                PO / cost codes (90d):{" "}
                                {row.poUpdateCountRecent > 0
                                  ? `${row.poUpdateCountRecent} · latest ${formatDate(row.poUpdateLatestRecent)}`
                                  : "none"}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )
              ) : showProjectCards ? (
                dashboardProjects === undefined ? (
                  <p style={{ color: "#d1fae5", fontSize: "0.875rem" }}>Loading...</p>
                ) : dashboardProjects.length === 0 ? (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                    No projects to display. If you&apos;re a PM/Coordinator, favourite a project from{" "}
                    <Link to="/projects" style={{ color: "#059669", fontWeight: 600, textDecoration: "none" }}>
                      Project Tracker
                    </Link>{" "}
                    to show it here.
                  </p>
                ) : (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    {(dashboardProjects ?? [])
                      .filter((row: DashboardProjectRow) => (useCardView ? Boolean(row.isFavourite) : true))
                      .map((row: DashboardProjectRow) => {
                        const project = row.project;
                        const isFavourite = Boolean(row.isFavourite);
                        return (
                        <Link
                          key={project._id}
                          to={`/projects/${project._id}`}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <div
                            className="card-hover"
                            style={{
                              ...innerWhiteCardStyle,
                              cursor: "pointer",
                              position: "relative",
                              border: isFavourite ? "1px solid #059669" : innerWhiteCardStyle.border,
                              boxShadow: isFavourite ? "0 2px 12px rgba(16,185,129,0.35)" : innerWhiteCardStyle.boxShadow,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem", flex: 1 }}>
                                {project.name}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleFavourite(project._id, isFavourite);
                                }}
                                aria-label={isFavourite ? "Remove from My job" : "Set as My job"}
                                title={isFavourite ? "Remove from My job" : "Set as My job (show on Dashboard)"}
                                style={{
                                  padding: "0.35rem 0.5rem",
                                  border: "none",
                                  background: "none",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  fontFamily: "inherit",
                                  fontSize: "1.25rem",
                                  lineHeight: 1,
                                  letterSpacing: "-0.05em",
                                  color: isFavourite ? "#059669" : "#9ca3af",
                                }}
                              >
                                ❯❯❯❯
                              </button>
                            </div>

                            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                              {project.clientName || "-"}
                            </div>

                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
                              {project.location || "Location not set"}
                            </div>

                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "0.375rem",
                                  ...getProjectStatusStyle(project.status),
                                }}
                              >
                                {project.status.replace(/_/g, " ")}
                              </span>
                              {healthDot(project.healthStatus)}
                              {project.endDate != null && (
                                <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginLeft: "auto" }}>
                                  {formatDate(project.endDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                      })}
                  </div>
                )
              ) : projectTableRows === undefined ? (
                <p style={{ color: "#d1fae5", fontSize: "0.875rem" }}>Loading...</p>
              ) : projectTableRows.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>No projects to display.</p>
              ) : (
                <div
                  style={{
                    overflowX: "auto",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-strong)",
                    backgroundColor: "var(--surface-panel)",
                    color: "var(--text-primary)",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ backgroundColor: "var(--surface-muted)", borderBottom: "1px solid var(--border-strong)" }}>
                        <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Project</th>
                        <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Client</th>
                        <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Status</th>
                        <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Health</th>
                        <th style={{ textAlign: "left", padding: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>End date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(projectTableRows as { _id: Id<"projects">; name: string; clientName: string; status: string; healthStatus?: string; endDate?: number }[]).map((p) => (
                        <tr key={p._id} style={{ borderBottom: "1px solid var(--border-strong)" }}>
                          <td style={{ padding: "0.75rem" }}>
                            <Link to={`/projects/${p._id}`} style={{ color: "#059669", fontWeight: 500, textDecoration: "none" }}>
                              {p.name}
                            </Link>
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>{p.clientName}</td>
                          <td style={{ padding: "0.75rem" }}>
                            <span style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "0.375rem", ...getProjectStatusStyle(p.status) }}>
                              {p.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem" }}>{healthDot(p.healthStatus)}</td>
                          <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>{formatDate(p.endDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {showOfficeSchedule && (
            <div style={{ flex: "1 1 38%", minWidth: "min(100%, 280px)" }}>
              <div style={{ marginBottom: "1rem" }}>{dashboardTodoCard}</div>
              <div style={shellCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div>
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#ffffff", margin: 0 }}>
                      Personal Calendar
                    </h2>
                    <div style={{ fontSize: "0.72rem", color: "#d1fae5", marginTop: "0.15rem" }}>{workWeekRangeLabel}</div>
                  </div>
                  <Link to="/personal-calendar" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#ffffff", textDecoration: "none" }}>
                    Full calendar {"->"}
                  </Link>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem", gap: "0.35rem" }}>
                  <button
                    type="button"
                    aria-label="Previous week"
                    onClick={() => setCalendarWeekOffset((w) => w - 1)}
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      borderRadius: "0.35rem",
                      border: "1px solid rgba(255,255,255,0.45)",
                      backgroundColor: "rgba(255,255,255,0.12)",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {"<"}
                  </button>
                  <button
                    type="button"
                    aria-label="Next week"
                    onClick={() => setCalendarWeekOffset((w) => w + 1)}
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      borderRadius: "0.35rem",
                      border: "1px solid rgba(255,255,255,0.45)",
                      backgroundColor: "rgba(255,255,255,0.12)",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {">"}
                  </button>
                </div>
                {personalSchedule === undefined ||
                boardroomSchedule === undefined ||
                milestoneUsers === undefined ? (
                  <p style={{ color: "#d1fae5", fontSize: "0.8125rem" }}>Loading...</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "0.35rem", fontSize: "0.8125rem", minWidth: 0 }}>
                    {workWeekDays.map((day) => {
                      const date = day.ts;
                      const isPastDay = date < todayStart;
                      const dayBookings = (bookingsByDate.get(date) ?? []).slice(0, 4);
                      return (
                        <div key={day.key} style={{ minHeight: "4.5rem", padding: "0.35rem", borderRadius: "0.35rem", border: "1px solid var(--border-strong)", backgroundColor: isPastDay ? "var(--surface-muted)" : "var(--surface-card)" }}>
                          <div style={{ fontWeight: 600, color: isPastDay ? "#94a3b8" : "#374151", marginBottom: "0.2rem" }}>
                            {day.label} {day.day}
                          </div>
                          {dayBookings.map((b) => {
                            const chip = dashboardBookingChipColors(b, isPastDay);
                            return isMobile ? (
                              <div
                                key={b._id}
                                style={{
                                  fontSize: "0.7rem",
                                  color: chip.color,
                                  marginTop: "0.25rem",
                                  lineHeight: 1.25,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => openBookingModal(b)}
                              >
                                <span style={{ fontWeight: 600 }}>{formatTime(b.startTimeMinutes)}</span>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "1rem",
                                    height: "1rem",
                                    borderRadius: "999px",
                                    backgroundColor: chip.iconBackgroundColor,
                                    color: chip.iconColor,
                                    fontSize: "0.65rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {bookingSymbol(b.title)}
                                </span>
                              </div>
                            ) : (
                              <div
                                key={b._id}
                                style={{
                                  fontSize: "0.7rem",
                                  color: chip.color,
                                  marginTop: "0.25rem",
                                  lineHeight: 1.25,
                                  cursor: "pointer",
                                }}
                                onClick={() => openBookingModal(b)}
                              >
                                <span style={{ fontWeight: 600 }}>{formatTime(b.startTimeMinutes)}</span>
                                {b.title && (
                                  <div style={{ color: chip.color, marginTop: "0.1rem", opacity: 0.92 }}>{b.title}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showBookingModal && selectedBooking && (
        <div
          onClick={closeBookingModal}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--surface-panel)",
              borderRadius: "0.75rem",
              padding: "1rem 1.25rem",
              maxWidth: "22rem",
              width: "90%",
              boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
              fontFamily: "Montserrat, sans-serif",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {selectedBooking.title?.trim() || "Personal event"}
              </h3>
              <button
                type="button"
                onClick={closeBookingModal}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  color: "var(--text-secondary)",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              <div style={{ marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 500 }}>When: </span>
                <span>
                  {new Date(selectedBooking.date).toLocaleDateString()} ·{" "}
                  {formatTime(selectedBooking.startTimeMinutes)}
                  {selectedBooking.durationMinutes
                    ? ` - ${formatTime(selectedBooking.startTimeMinutes + selectedBooking.durationMinutes)} (${selectedBooking.durationMinutes} min)`
                    : ""}
                </span>
              </div>
              <div style={{ marginBottom: "0.25rem" }}>
                <span style={{ fontWeight: 500 }}>Calendar: </span>
                <span>
                  {selectedBooking.calendarEventType === "boardroom"
                    ? "Boardroom"
                    : selectedBooking.calendarEventType === "milestone"
                      ? "Team milestone"
                      : "Personal Calendar"}
                </span>
              </div>
              {selectedBooking.requestedByName && (
                <div style={{ marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: 500 }}>Requested by: </span>
                  <span>{selectedBooking.requestedByName}</span>
                </div>
              )}
            </div>
            {selectedBooking.attendeeUserIds && Array.isArray(selectedBooking.attendeeUserIds) && selectedBooking.attendeeUserIds.length > 0 && (
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Invited attendees: {selectedBooking.attendeeUserIds.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
