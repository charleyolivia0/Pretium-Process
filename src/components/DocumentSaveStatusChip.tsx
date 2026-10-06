import type { DocumentSaveStatus } from "../hooks/useDocumentAutosave";

type DocumentSaveStatusChipProps = {
  saveStatus: DocumentSaveStatus;
  lastSavedAt: number | null;
  error: string | null;
};

function formatSavedTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function DocumentSaveStatusChip({ saveStatus, lastSavedAt, error }: DocumentSaveStatusChipProps) {
  if (saveStatus === "idle" && !error) return null;

  let text = "";
  let color = "var(--text-muted)";

  if (saveStatus === "saving") {
    text = "Saving…";
    color = "#d97706";
  } else if (saveStatus === "saved" && lastSavedAt) {
    text = `Saved ${formatSavedTime(lastSavedAt)}`;
    color = "#059669";
  } else if (saveStatus === "error") {
    text = error ? `Save failed: ${error}` : "Save failed";
    color = "#dc2626";
  }

  if (!text) return null;

  return (
    <span
      style={{
        fontSize: "0.75rem",
        color,
        fontWeight: 500,
        marginLeft: "0.5rem",
      }}
      aria-live="polite"
    >
      {text}
    </span>
  );
}
