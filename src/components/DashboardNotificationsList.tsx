import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Id } from "../../convex/_generated/dataModel";
import { notificationHref } from "../utils/notificationHref";

export type DashboardNotificationItem = {
  id: string;
  text: string;
  body?: string;
  createdAt: number;
  readAt?: number;
  notificationId?: Id<"notifications">;
  link?: string;
  projectId?: Id<"projects">;
  bookingId?: Id<"boardroomBookings">;
  incidentId?: Id<"incidentReports">;
};

type DashboardNotificationsListProps = {
  items: DashboardNotificationItem[];
  emptyText: string;
  variant: "principal" | "admin";
  onMarkRead: (notificationId: Id<"notifications">) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  unreadNotificationCount: number;
};

export function DashboardNotificationsList({
  items,
  emptyText,
  variant,
  onMarkRead,
  onMarkAllRead,
  unreadNotificationCount,
}: DashboardNotificationsListProps) {
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const isPrincipal = variant === "principal";
  const textColor = isPrincipal ? "#ecfdf5" : "var(--text-primary)";
  const mutedColor = isPrincipal ? "#d1fae5" : "#6b7280";
  const separator = isPrincipal ? "rgba(209, 250, 229, 0.45)" : "var(--border-subtle, rgba(0,0,0,0.12))";
  const markReadColor = isPrincipal ? "#a7f3d0" : "#059669";
  const buttonBorder = isPrincipal ? "rgba(209, 250, 229, 0.55)" : "rgba(5, 150, 105, 0.35)";
  const buttonBg = isPrincipal ? "rgba(255,255,255,0.08)" : "rgba(5, 150, 105, 0.08)";

  async function dismissItem(item: DashboardNotificationItem) {
    if (!item.notificationId || item.readAt || busyId) return;
    setBusyId(item.id);
    try {
      await onMarkRead(item.notificationId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to dismiss notification.");
    } finally {
      setBusyId(null);
    }
  }

  async function openItem(item: DashboardNotificationItem) {
    if (!item.notificationId) return;
    const href = notificationHref({
      link: item.link,
      projectId: item.projectId,
      bookingId: item.bookingId,
      incidentId: item.incidentId,
    });
    if (!item.readAt) {
      setBusyId(item.id);
      try {
        await onMarkRead(item.notificationId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to dismiss notification.");
        setBusyId(null);
        return;
      }
      setBusyId(null);
    }
    if (href) navigate(href);
  }

  async function dismissAll() {
    if (markingAll || unreadNotificationCount === 0) return;
    setMarkingAll(true);
    try {
      await onMarkAllRead();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to mark all notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      {unreadNotificationCount > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
          <button
            type="button"
            disabled={markingAll}
            onClick={() => void dismissAll()}
            style={{
              border: "none",
              background: "none",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: markReadColor,
              cursor: markingAll ? "wait" : "pointer",
              padding: 0,
              fontFamily: "Montserrat, sans-serif",
              opacity: markingAll ? 0.7 : 1,
            }}
          >
            {markingAll ? "Marking…" : "Mark all as read"}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.82rem", color: mutedColor }}>{emptyText}</p>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {items.map((item) => {
            const href = item.notificationId
              ? notificationHref({
                  link: item.link,
                  projectId: item.projectId,
                  bookingId: item.bookingId,
                  incidentId: item.incidentId,
                })
              : undefined;
            const isUnread = Boolean(item.notificationId && !item.readAt);
            const isBusy = busyId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  fontSize: "0.84rem",
                  borderBottom: `1px dashed ${separator}`,
                  paddingBottom: "0.45rem",
                  color: textColor,
                  opacity: isUnread ? 1 : 0.75,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {href && isUnread ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void openItem(item)}
                        style={{
                          border: "none",
                          background: "none",
                          padding: 0,
                          margin: 0,
                          textAlign: "left",
                          color: "inherit",
                          font: "inherit",
                          cursor: isBusy ? "wait" : "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: "2px",
                        }}
                      >
                        {item.text}
                      </button>
                    ) : (
                      <span>{item.text}</span>
                    )}
                    {item.body && item.body !== item.text && (
                      <div style={{ fontSize: "0.76rem", color: mutedColor, marginTop: "0.15rem" }}>{item.body}</div>
                    )}
                  </div>
                  {isUnread && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void dismissItem(item)}
                      aria-label="Dismiss notification"
                      title="Dismiss"
                      style={{
                        flexShrink: 0,
                        border: `1px solid ${buttonBorder}`,
                        background: buttonBg,
                        color: markReadColor,
                        borderRadius: "0.35rem",
                        padding: "0.15rem 0.45rem",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        cursor: isBusy ? "wait" : "pointer",
                        fontFamily: "Montserrat, sans-serif",
                      }}
                    >
                      {isBusy ? "…" : "Dismiss"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
