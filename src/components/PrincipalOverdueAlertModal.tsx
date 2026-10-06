import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { notificationHref } from "../utils/notificationHref";

const MODAL_Z_INDEX = 20000;

type PrincipalAlert = {
  _id: Id<"notifications">;
  title: string;
  body?: string;
  link?: string;
  projectId?: Id<"projects">;
};

function parseAlertBody(body?: string): { detail: string; contact: string } {
  if (!body?.trim()) return { detail: "", contact: "" };
  const marker = " Contact: ";
  const idx = body.lastIndexOf(marker);
  if (idx === -1) return { detail: body.trim(), contact: "" };
  const detail = body.slice(0, idx).trim();
  const contact = body.slice(idx + marker.length).replace(/\.\s*$/, "").trim();
  return { detail, contact };
}

type PrincipalOverdueAlertModalProps = {
  enabled: boolean;
};

export function PrincipalOverdueAlertModal({ enabled }: PrincipalOverdueAlertModalProps) {
  const navigate = useNavigate();
  const alerts = useQuery(
    api.notifications.listPrincipalOverdueAlerts,
    enabled ? {} : "skip",
  ) as PrincipalAlert[] | undefined;
  const markOne = useMutation(api.notifications.markNotificationAsRead);
  const [busy, setBusy] = useState(false);

  const current = enabled && alerts && alerts.length > 0 ? alerts[0] : null;
  const queueTotal = alerts?.length ?? 0;
  const currentId = current?._id;

  const dismissCurrent = useCallback(async () => {
    if (!currentId || busy) return;
    setBusy(true);
    try {
      await markOne({ notificationId: currentId });
    } catch (err) {
      console.error("Failed to dismiss principal overdue alert:", err);
    } finally {
      setBusy(false);
    }
  }, [busy, currentId, markOne]);

  const viewCurrent = useCallback(async () => {
    if (!current || busy) return;
    const href = notificationHref({
      link: current.link,
      projectId: current.projectId,
    });
    setBusy(true);
    try {
      await markOne({ notificationId: current._id });
      if (href) navigate(href);
    } catch (err) {
      console.error("Failed to open principal overdue alert:", err);
    } finally {
      setBusy(false);
    }
  }, [busy, current, markOne, navigate]);

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        void dismissCurrent();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, current, dismissCurrent]);

  if (!current || typeof document === "undefined") return null;

  const { detail, contact } = parseAlertBody(current.body);
  const isChangeAlert = current.title === "Changes need follow-up";
  const viewLabel = isChangeAlert ? "View changes" : "View schedule";

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) void dismissCurrent();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: MODAL_Z_INDEX,
        padding: "1rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="principal-overdue-alert-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-panel)",
          borderRadius: "1rem",
          padding: "2rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          maxWidth: "36rem",
          width: "100%",
          border: "3px solid #dc2626",
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#b91c1c",
            backgroundColor: "rgba(220, 38, 38, 0.12)",
            padding: "0.25rem 0.6rem",
            borderRadius: "999px",
            marginBottom: "0.75rem",
          }}
        >
          Overdue notice
        </div>

        {queueTotal > 1 && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              margin: "0 0 0.5rem",
            }}
          >
            Alert 1 of {queueTotal}
          </p>
        )}

        <h2
          id="principal-overdue-alert-title"
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 1rem",
            lineHeight: 1.3,
          }}
        >
          {current.title}
        </h2>

        {detail && (
          <p
            style={{
              fontSize: "1rem",
              color: "var(--text-primary)",
              margin: "0 0 1rem",
              lineHeight: 1.5,
            }}
          >
            {detail}
          </p>
        )}

        {contact && (
          <div
            style={{
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(5, 150, 105, 0.08)",
              borderRadius: "0.5rem",
              border: "1px solid rgba(5, 150, 105, 0.25)",
            }}
          >
            <strong style={{ color: "var(--text-primary)" }}>Who to contact: </strong>
            {contact}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => void dismissCurrent()}
            disabled={busy}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border-strong)",
              backgroundColor: "var(--surface-panel)",
              color: "var(--text-primary)",
              fontSize: "0.9rem",
              fontFamily: "Montserrat, sans-serif",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => void viewCurrent()}
            disabled={busy}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "0.5rem",
              border: "1px solid #b91c1c",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              fontSize: "0.9rem",
              fontWeight: 600,
              fontFamily: "Montserrat, sans-serif",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.75 : 1,
            }}
          >
            {busy ? "Opening…" : viewLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
