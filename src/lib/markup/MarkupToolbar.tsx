import { MARKUP_ZOOM_MAX, MARKUP_ZOOM_MIN } from "./MarkupFitViewport";

const zoomButtonStyle: import("react").CSSProperties = {
  padding: "0.4rem 0.55rem",
  borderRadius: "0.375rem",
  border: "1px solid #e5e7eb",
  backgroundColor: "#fff",
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.8125rem",
  minWidth: "2rem",
};

type MarkupToolbarProps = {
  penColor: string;
  onPenColorChange: (color: string) => void;
  penWidth: number;
  onPenWidthChange: (width: number) => void;
  focusPageIndex: number;
  onClearPage: () => void;
  onClearAll: () => void;
  onSaveNow: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomFit?: () => void;
};

export function MarkupToolbar({
  penColor,
  onPenColorChange,
  penWidth,
  onPenWidthChange,
  focusPageIndex,
  onClearPage,
  onClearAll,
  onSaveNow,
  saveState,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: MarkupToolbarProps) {
  const showZoom = zoom !== undefined && onZoomIn && onZoomOut && onZoomFit;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.65rem",
        marginBottom: "1rem",
        padding: "0.65rem 0.75rem",
        borderRadius: "0.5rem",
        backgroundColor: "var(--surface-panel)",
        border: "1px solid var(--border-strong, #e5e7eb)",
      }}
    >
      <label
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        Color
        <input type="color" value={penColor} onChange={(e) => onPenColorChange(e.target.value)} />
      </label>
      <label
        style={{
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        Width
        <input
          type="range"
          min={1}
          max={12}
          value={penWidth}
          onChange={(e) => onPenWidthChange(Number(e.target.value))}
        />
        <span style={{ minWidth: "1.25rem" }}>{penWidth}</span>
      </label>
      {showZoom ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            marginLeft: "0.15rem",
            paddingLeft: "0.65rem",
            borderLeft: "1px solid var(--border-strong, #e5e7eb)",
          }}
        >
          <button
            type="button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={onZoomOut}
            disabled={zoom <= MARKUP_ZOOM_MIN}
            style={{
              ...zoomButtonStyle,
              cursor: zoom <= MARKUP_ZOOM_MIN ? "not-allowed" : "pointer",
              opacity: zoom <= MARKUP_ZOOM_MIN ? 0.5 : 1,
            }}
          >
            −
          </button>
          <button type="button" title="Fit to view" aria-label="Fit to view" onClick={onZoomFit} style={zoomButtonStyle}>
            Fit
          </button>
          <button
            type="button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={onZoomIn}
            disabled={zoom >= MARKUP_ZOOM_MAX}
            style={{
              ...zoomButtonStyle,
              cursor: zoom >= MARKUP_ZOOM_MAX ? "not-allowed" : "pointer",
              opacity: zoom >= MARKUP_ZOOM_MAX ? 0.5 : 1,
            }}
          >
            +
          </button>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", minWidth: "2.75rem" }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClearPage}
        style={{
          padding: "0.4rem 0.65rem",
          borderRadius: "0.375rem",
          border: "1px solid #e5e7eb",
          backgroundColor: "#fff",
          cursor: "pointer",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "0.8125rem",
        }}
      >
        Clear page ({focusPageIndex + 1})
      </button>
      <button
        type="button"
        onClick={onClearAll}
        style={{
          padding: "0.4rem 0.65rem",
          borderRadius: "0.375rem",
          border: "1px solid #fecaca",
          backgroundColor: "#fff",
          color: "#b91c1c",
          cursor: "pointer",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "0.8125rem",
        }}
      >
        Clear all
      </button>
      <button
        type="button"
        onClick={onSaveNow}
        disabled={saveState === "saving"}
        style={{
          padding: "0.4rem 0.75rem",
          borderRadius: "0.375rem",
          border: "none",
          backgroundColor: "#059669",
          color: "#fff",
          fontWeight: 600,
          cursor: saveState === "saving" ? "not-allowed" : "pointer",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "0.8125rem",
        }}
      >
        Save now
      </button>
      {saveState === "saving" ? (
        <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Saving…</span>
      ) : null}
      {saveState === "saved" ? (
        <span style={{ fontSize: "0.8125rem", color: "#059669" }}>Saved</span>
      ) : null}
      {saveState === "error" ? (
        <span style={{ fontSize: "0.8125rem", color: "#dc2626" }}>Save failed</span>
      ) : null}
    </div>
  );
}
