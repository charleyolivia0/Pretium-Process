import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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

function formatHelperCount(count: number) {
  if (count === 1) return "1 new notification";
  return `${count} new notifications`;
}

type NotificationShimejiProps = {
  overrideFrame?: string;
  secondaryOverrideFrame?: string;
  /** Slightly larger mascot (Accounting page only). */
  variant?: "default" | "accounting" | "safety";
};

function frameToSrc(frame: string) {
  if (frame.startsWith("/")) return frame;
  return `/shimeji_pack/${encodeURIComponent(frame)}`;
}

export function NotificationShimeji({
  overrideFrame,
  secondaryOverrideFrame,
  variant = "default",
}: NotificationShimejiProps) {
  const navigate = useNavigate();
  const QUIET_MODE_MS = 60 * 60 * 1000;
  const unreadCount = useQuery(api.notifications.unreadCount);
  const latest = useQuery(api.notifications.listRecentNotifications, { limit: 1 }) as
    | NotificationDoc[]
    | undefined;

  const count = typeof unreadCount === "number" ? unreadCount : 0;
  const [isPopped, setIsPopped] = useState(false);
  const [showNoNotificationsTip, setShowNoNotificationsTip] = useState(false);
  const [preferCalmPoseDespiteUnread, setPreferCalmPoseDespiteUnread] = useState(false);

  const prevCountRef = useRef<number>(count);
  const popTimerRef = useRef<number | undefined>(undefined);

  const sittingFrame = "ChatGPT_Image_Mar_23_1_37_50.png";
  const sleepingFrame = "ChatGPT_Image_Mar_23_1_43_sleep.png";
  const standingFrame = "Gemini_Generated_Image_umf49uumf49uumf4-removebg-preview.png";

  const latestCreatedAt = latest?.[0]?.createdAt ?? 0;
  const hasUnreadNotification = count > 0;
  const hasAnyNotification = latestCreatedAt > 0;
  const isPeeking = count === 0;
  const isExcited = hasUnreadNotification && isPopped;
  const isQuietForHour = hasAnyNotification && Date.now() - latestCreatedAt >= QUIET_MODE_MS;
  const currentFrame =
    overrideFrame ??
    (hasUnreadNotification
      ? preferCalmPoseDespiteUnread
        ? sittingFrame
        : standingFrame
      : isQuietForHour
        ? sleepingFrame
        : sittingFrame);
  const [imgSrc, setImgSrc] = useState(() => frameToSrc(currentFrame));
  const [secondaryImgSrc, setSecondaryImgSrc] = useState(() =>
    secondaryOverrideFrame ? frameToSrc(secondaryOverrideFrame) : ""
  );

  const markAllAsRead = useMutation(api.notifications.markAllNotificationsAsRead);
  const markOneAsRead = useMutation(api.notifications.markNotificationAsRead);

  useEffect(() => {
    if (count === 0) {
      setIsPopped(false);
      setPreferCalmPoseDespiteUnread(false);
      prevCountRef.current = count;
      return;
    }

    if (count > prevCountRef.current) {
      setPreferCalmPoseDespiteUnread(false);
      setIsPopped(true);
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
      popTimerRef.current = window.setTimeout(() => setIsPopped(false), 950);
    }

    prevCountRef.current = count;
  }, [count]);

  useEffect(() => {
    if (!showNoNotificationsTip) return;
    const id = window.setTimeout(() => setShowNoNotificationsTip(false), 2200);
    return () => window.clearTimeout(id);
  }, [showNoNotificationsTip]);

  useEffect(() => {
    setImgSrc(frameToSrc(currentFrame));
  }, [currentFrame]);

  useEffect(() => {
    setSecondaryImgSrc(secondaryOverrideFrame ? frameToSrc(secondaryOverrideFrame) : "");
  }, [secondaryOverrideFrame]);

  const latestNotif = latest?.[0];
  const latestTitle = latestNotif?.title ?? "";
  /** Unread dismissed to calm pose: no mascot bubble — use bell list only. */
  const hideMascotNotificationHelper =
    preferCalmPoseDespiteUnread && !overrideFrame && count > 0;

  const helperText =
    count === 0 && showNoNotificationsTip
      ? "No notifications"
      : latestTitle
        ? latestTitle
        : formatHelperCount(count);

  const latestHref =
    count > 0 && latestNotif
      ? notificationHref({
          link: latestNotif.link,
          projectId: latestNotif.projectId,
          bookingId: latestNotif.bookingId,
          incidentId: latestNotif.incidentId,
        })
      : undefined;

  async function markLatestReadIfUnread() {
    if (!latestNotif || latestNotif.readAt) return;
    await markOneAsRead({ notificationId: latestNotif._id });
  }

  const rootClass = [
    "notification-avatar-root",
    isPeeking ? "is-peeking" : "",
    variant === "accounting" ? "is-accounting-size" : "",
    variant === "safety" ? "is-safety-size" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const buttonClass = [
    "notification-avatar-button",
    isExcited ? "is-excited" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const helperClass = [
    "notification-avatar-helper",
    count > 0 ? "is-unread" : "",
    isPeeking && showNoNotificationsTip ? "force-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      {!hideMascotNotificationHelper && (
        <div className={helperClass}>
          {count > 0 && latestHref ? (
            <Link
              to={latestHref}
              className="notification-avatar-helper-link"
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  try {
                    await markLatestReadIfUnread();
                    navigate(latestHref);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Failed to dismiss notification.");
                  }
                })();
              }}
            >
              {helperText}
            </Link>
          ) : (
            <span className="notification-avatar-helper-text">{helperText}</span>
          )}
          {count > 0 && (
          <button
            type="button"
            className="notification-avatar-mark-read"
            tabIndex={0}
            aria-label="Mark all notifications as read"
            onClick={() => {
              void (async () => {
                try {
                  await markAllAsRead({});
                  setPreferCalmPoseDespiteUnread(false);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to mark notifications as read.");
                }
              })();
            }}
          >
            Mark read
          </button>
          )}
        </div>
      )}

      <button
        type="button"
        className={buttonClass}
        aria-label={
          count > 0 && !overrideFrame
            ? hideMascotNotificationHelper
              ? "Notification mascot; open notifications bell to view unread"
              : "Calm mascot; notifications stay in the bell list"
            : "Notification mascot"
        }
        style={
          secondaryImgSrc
            ? {
                width: "16.8rem",
                height: "9rem",
              }
            : undefined
        }
        onClick={() => {
          if (count === 0) {
            setShowNoNotificationsTip(true);
            return;
          }
          if (!overrideFrame && hasUnreadNotification) {
            setPreferCalmPoseDespiteUnread(true);
          }
        }}
      >
        <img
          className="notification-avatar-image notification-avatar-sprite"
          src={imgSrc}
          alt=""
          draggable={false}
          style={
            secondaryImgSrc
              ? {
                  width: "8.5rem",
                  height: "8.5rem",
                }
              : undefined
          }
          onError={() => {
            const fallbackSrc = frameToSrc(standingFrame);
            if (imgSrc !== fallbackSrc) setImgSrc(fallbackSrc);
          }}
        />
        {secondaryImgSrc && (
          <img
            className="notification-avatar-image notification-avatar-sprite"
            src={secondaryImgSrc}
            alt=""
            draggable={false}
            style={{
              width: "8.5rem",
              height: "8.5rem",
              marginRight: "-1rem",
              order: -1,
              transform: "scaleX(-1)",
            }}
            onError={() => {
              setSecondaryImgSrc("");
            }}
          />
        )}
      </button>
    </div>
  );
}

