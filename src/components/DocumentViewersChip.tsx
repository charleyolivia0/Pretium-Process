import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { DocumentResourceKind } from "../hooks/useDocumentPresence";
import { useDocumentPresence } from "../hooks/useDocumentPresence";

type DocumentViewersChipProps = {
  resourceKind: DocumentResourceKind;
  resourceId: string | null | undefined;
  enabled?: boolean;
  pageIndex?: number;
  currentUserId?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatViewerLabel(
  viewers: { userId: string; name: string; pageIndex?: number }[],
  currentUserId?: string,
): string {
  const others = currentUserId
    ? viewers.filter((v) => v.userId !== currentUserId)
    : viewers;
  if (others.length === 0) return "Only you";
  if (others.length === 1) return `Viewing with ${others[0].name}`;
  if (others.length === 2) return `Viewing with ${others[0].name} and ${others[1].name}`;
  return `Viewing with ${others[0].name} + ${others.length - 1} others`;
}

export function DocumentViewersChip({
  resourceKind,
  resourceId,
  enabled = true,
  pageIndex,
  currentUserId,
}: DocumentViewersChipProps) {
  useDocumentPresence({
    resourceKind,
    resourceId,
    enabled: enabled && !!resourceId,
    pageIndex,
  });

  const viewers = useQuery(
    api.documentPresence.listActiveViewers,
    enabled && resourceId ? { resourceKind, resourceId } : "skip",
  );

  type ViewerRow = { userId: string; name: string; pageIndex?: number; lastSeenAt: number };

  if (!enabled || !resourceId) {
    return null;
  }

  if (viewers === undefined) {
    return (
      <div
        style={{
          display: "inline-flex",
          padding: "0.25rem 0.5rem",
          borderRadius: "999px",
          border: "1px solid var(--border-strong, #e5e7eb)",
          backgroundColor: "var(--surface-panel)",
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          fontFamily: "Montserrat, sans-serif",
        }}
      >
        Checking viewers…
      </div>
    );
  }

  if (viewers.length === 0) {
    return null;
  }

  const viewerList = viewers as ViewerRow[];
  const displayViewers = viewerList.slice(0, 5);
  const label = formatViewerLabel(viewerList, currentUserId);
  const pageHints = viewerList
    .filter((v: ViewerRow) => v.userId !== currentUserId && v.pageIndex != null)
    .map((v: ViewerRow) => `${v.name} on page ${(v.pageIndex ?? 0) + 1}`);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.25rem 0.5rem",
        borderRadius: "999px",
        border: "1px solid var(--border-strong, #e5e7eb)",
        backgroundColor: "var(--surface-panel)",
        fontSize: "0.75rem",
        color: "var(--text-secondary)",
        fontFamily: "Montserrat, sans-serif",
        flexWrap: "wrap",
      }}
      title={pageHints.length > 0 ? pageHints.join("; ") : label}
    >
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {displayViewers.map((v: ViewerRow, i: number) => (
          <span
            key={v.userId}
            style={{
              width: "1.35rem",
              height: "1.35rem",
              borderRadius: "50%",
              backgroundColor: v.userId === currentUserId ? "#059669" : "#6366f1",
              color: "#fff",
              fontSize: "0.55rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: i === 0 ? 0 : "-0.35rem",
              border: "1.5px solid var(--surface-panel)",
            }}
          >
            {initials(v.name)}
          </span>
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
