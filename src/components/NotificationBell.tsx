import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router-dom";
import { notificationHref } from "../utils/notificationHref";

type NotificationDoc = {
  _id: Id<"notifications">;
  type: string;
  title: string;
  body?: string;
  link?: string;
  projectId?: Id<"projects">;
  bookingId?: Id<"boardroomBookings">;
  incidentId?: Id<"incidentReports">;
  createdAt: number;
  readAt?: number;
};

function formatTimeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

type NotificationBellProps = {
  /** Smaller trigger for compact shell header */
  compact?: boolean;
};

export function NotificationBell({ compact = false }: NotificationBellProps) {
  const navigate = useNavigate();
  const unreadCount = useQuery(api.notifications.unreadCount);
  const notifications = useQuery(api.notifications.listRecentNotifications, { limit: 20 }) as
    | NotificationDoc[]
    | undefined;
  const markOne = useMutation(api.notifications.markNotificationAsRead);
  const markAll = useMutation(api.notifications.markAllNotificationsAsRead);

  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<Id<"notifications"> | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const count = typeof unreadCount === "number" ? unreadCount : 0;
  const badgeLabel = count > 9 ? "9+" : count.toString();

  const hasUnread = count > 0;

  async function dismissNotification(n: NotificationDoc) {
    if (n.readAt || busyId) return;
    setBusyId(n._id);
    try {
      await markOne({ notificationId: n._id });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to dismiss notification.");
    } finally {
      setBusyId(null);
    }
  }

  async function openNotification(n: NotificationDoc) {
    const href = notificationHref({
      link: n.link,
      projectId: n.projectId,
      bookingId: n.bookingId,
      incidentId: n.incidentId,
    });
    if (!n.readAt) {
      setBusyId(n._id);
      try {
        await markOne({ notificationId: n._id });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to dismiss notification.");
        setBusyId(null);
        return;
      }
      setBusyId(null);
    }
    if (href) {
      setOpen(false);
      navigate(href);
    }
  }

  async function dismissAllNotifications() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAll({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  const items = notifications ?? [];

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", zIndex: 2, overflow: "visible" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        style={{
          position: "relative",
          width: compact ? "1.5rem" : "2.25rem",
          height: compact ? "1.5rem" : "2.25rem",
          borderRadius: "999px",
          border: compact ? "1px solid rgba(255,255,255,0.45)" : "1px solid rgba(5, 150, 105, 0.3)",
          backgroundColor: compact ? "rgba(255,255,255,0.12)" : "var(--surface-panel)",
          boxShadow: compact ? "none" : "0 2px 8px rgba(5, 150, 105, 0.15), 0 0 0 1px rgba(5, 150, 105, 0.08)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <svg
          width={compact ? 14 : 20}
          height={compact ? 14 : 20}
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ color: compact ? "#ffffff" : "#059669" }}
        >
          <path
            fill="currentColor"
            d="M12 2a4 4 0 0 0-4 4v1.086C6.26 8.55 5 10.388 5 12.5V16l-1.447 1.724A1 1 0 0 0 4.382 19h15.236a1 1 0 0 0 .829-1.576L19 16v-3.5c0-2.112-1.26-3.95-3-5.414V6a4 4 0 0 0-4-4Zm0 2a2 2 0 0 1 2 2v1a1 1 0 0 0 .445.832C15.63 8.91 17 10.27 17 12.5V16a1 1 0 0 0 .171.555L18.118 17H5.882l.947-0.445A1 1 0 0 0 7 16v-3.5c0-2.23 1.37-3.59 2.555-4.668A1 1 0 0 0 10 7V6a2 2 0 0 1 2-2Zm0 16a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 20Z"
          />
        </svg>
        {hasUnread && (
          <span
            style={{
              position: "absolute",
              top: compact ? "-0.15rem" : "-0.25rem",
              right: compact ? "-0.15rem" : "-0.25rem",
              minWidth: compact ? "0.85rem" : "1.25rem",
              height: compact ? "0.85rem" : "1.25rem",
              padding: compact ? "0 0.12rem" : "0 0.25rem",
              borderRadius: "999px",
              backgroundColor: "#059669",
              color: "#ffffff",
              fontSize: compact ? "0.55rem" : "0.7rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 1px var(--surface-panel)",
            }}
          >
            {badgeLabel}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          aria-modal="false"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "0.5rem",
            width: "min(20rem, calc(100vw - 1.5rem))",
            maxHeight: "min(22rem, calc(100dvh - 5rem))",
            backgroundColor: "var(--surface-panel)",
            borderRadius: "0.75rem",
            boxShadow:
              "0 20px 40px -10px rgba(0, 0, 0, 0.18), 0 12px 24px -8px rgba(5, 150, 105, 0.15), 0 0 0 1px rgba(5, 150, 105, 0.12)",
            border: "1px solid rgba(5, 150, 105, 0.15)",
            padding: "0.75rem",
            zIndex: 2000,
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            flexShrink: 0,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.25rem",
            }}
          >
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Notifications
            </span>
            {hasUnread && (
              <button
                type="button"
                disabled={markingAll}
                onClick={() => void dismissAllNotifications()}
                style={{
                  border: "none",
                  background: "none",
                  fontSize: "0.75rem",
                  color: "#059669",
                  cursor: markingAll ? "wait" : "pointer",
                  padding: 0,
                  opacity: markingAll ? 0.7 : 1,
                }}
              >
                {markingAll ? "Marking…" : "Mark all as read"}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                margin: 0,
              }}
            >
              You&apos;re all caught up.
            </p>
          ) : (
            <div
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                maxHeight: "min(18rem, calc(100dvh - 9rem))",
                paddingRight: "0.25rem",
                flex: 1,
                minHeight: 0,
              }}
            >
              <ul
                role="list"
                aria-label="Unread notifications"
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
              >
                {items.map((n) => {
                  const isUnread = !n.readAt;
                  const href = notificationHref({
                    link: n.link,
                    projectId: n.projectId,
                    bookingId: n.bookingId,
                    incidentId: n.incidentId,
                  });
                  const isBusy = busyId === n._id;
                  const cardStyle = {
                    padding: "0.5rem 0.5rem",
                    borderRadius: "0.5rem",
                    backgroundColor: "var(--color-emerald-50)",
                    border: isUnread
                      ? "1px solid rgba(5,150,105,0.5)"
                      : "1px solid rgba(16,185,129,0.25)",
                    display: "flex" as const,
                    flexDirection: "column" as const,
                    gap: "0.35rem",
                  };
                  return (
                    <li key={n._id}>
                      <div style={cardStyle}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {href && isUnread ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void openNotification(n)}
                                style={{
                                  border: "none",
                                  background: "none",
                                  padding: 0,
                                  margin: 0,
                                  textAlign: "left",
                                  fontSize: "0.8125rem",
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  cursor: isBusy ? "wait" : "pointer",
                                  textDecoration: "underline",
                                  textUnderlineOffset: "2px",
                                }}
                              >
                                {n.title}
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.8125rem",
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                }}
                              >
                                {n.title}
                              </span>
                            )}
                            {n.body && (
                              <span
                                style={{
                                  display: "block",
                                  fontSize: "0.8rem",
                                  color: "var(--text-secondary)",
                                  marginTop: "0.1rem",
                                }}
                              >
                                {n.body}
                              </span>
                            )}
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                marginTop: "0.1rem",
                              }}
                            >
                              {formatTimeAgo(n.createdAt)}
                            </span>
                          </div>
                          {isUnread && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void dismissNotification(n)}
                              aria-label="Dismiss notification"
                              title="Dismiss"
                              style={{
                                flexShrink: 0,
                                border: "1px solid rgba(5,150,105,0.35)",
                                background: "rgba(5, 150, 105, 0.08)",
                                color: "#059669",
                                borderRadius: "0.35rem",
                                padding: "0.15rem 0.45rem",
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                cursor: isBusy ? "wait" : "pointer",
                              }}
                            >
                              {isBusy ? "…" : "Dismiss"}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

