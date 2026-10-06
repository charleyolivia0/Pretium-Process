import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Above project modals (up to ~15000) and mascots (~1200). */
const CONFIRM_DIALOG_Z_INDEX = 20000;

type ConfirmDialogProps = {
  open: boolean;
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  message,
  title = "Are you sure?",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (loading) return;
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: CONFIRM_DIALOG_Z_INDEX,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--surface-panel)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
          maxWidth: "26rem",
          width: "100%",
          margin: "0 1rem",
        }}
      >
        <h2
          id="confirm-dialog-title"
          style={{
            fontSize: "1.125rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "0.5rem",
          }}
        >
          {title}
        </h2>
        <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              backgroundColor: "var(--surface-panel)",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              fontFamily: "Montserrat, sans-serif",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await onConfirm();
                } catch (err) {
                  console.error("Confirm action failed:", err);
                }
              })();
            }}
            disabled={loading}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "0.5rem",
              border: "1px solid #b91c1c",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              fontFamily: "Montserrat, sans-serif",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}