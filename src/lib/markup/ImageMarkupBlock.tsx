import { useEffect, useRef, useState } from "react";
import { drawPathsOnCanvas, normalizePointer } from "./canvas";
import type { InkPath } from "./types";

type ImageMarkupBlockProps = {
  fileUrl: string;
  name: string;
  paths: InkPath[];
  color: string;
  strokeWidth: number;
  onStrokeComplete: (path: InkPath) => void;
  onPageInteract: () => void;
  /** Use natural image dimensions for fit-to-viewport scaling (drawings viewer). */
  fitToViewport?: boolean;
};

export function ImageMarkupBlock({
  fileUrl,
  name,
  paths,
  color,
  strokeWidth,
  onStrokeComplete,
  onPageInteract,
  fitToViewport = false,
}: ImageMarkupBlockProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);
  const currentStroke = useRef<{ x: number; y: number }[] | null>(null);

  function syncLayout() {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (w < 2 || h < 2) return;
    setLayout({ w, h });
  }

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => syncLayout());
    ro.observe(img);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !layout) return;
    overlay.width = layout.w;
    overlay.height = layout.h;
    drawPathsOnCanvas(overlay, paths);
  }, [layout, paths]);

  function redrawOverlayWithCurrent() {
    const overlay = overlayRef.current;
    if (!overlay || !layout) return;
    const draft = currentStroke.current;
    const combined =
      draft && draft.length >= 2
        ? [...paths, { tool: "ink" as const, color, strokeWidth, points: [...draft] }]
        : paths;
    drawPathsOnCanvas(overlay, combined);
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: "inline-block",
        maxWidth: fitToViewport ? undefined : "100%",
      }}
    >
      <img
        ref={imgRef}
        src={fileUrl}
        alt={name}
        onLoad={syncLayout}
        style={{
          display: "block",
          maxWidth: fitToViewport ? undefined : "100%",
          height: "auto",
          width: fitToViewport ? "auto" : undefined,
        }}
      />
      {layout ? (
        <canvas
          ref={overlayRef}
          width={layout.w}
          height={layout.h}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            cursor: "crosshair",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            onPageInteract();
            const pt = normalizePointer(e, e.currentTarget);
            currentStroke.current = [pt];
            redrawOverlayWithCurrent();
          }}
          onPointerMove={(e) => {
            if (!currentStroke.current || !(e.buttons & 1)) return;
            const pt = normalizePointer(e, e.currentTarget);
            const last = currentStroke.current[currentStroke.current.length - 1];
            const dx = pt.x - last.x;
            const dy = pt.y - last.y;
            if (dx * dx + dy * dy < 0.00001) return;
            currentStroke.current.push(pt);
            redrawOverlayWithCurrent();
          }}
          onPointerUp={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.currentTarget.releasePointerCapture(e.pointerId);
            const stroke = currentStroke.current;
            currentStroke.current = null;
            if (stroke && stroke.length >= 2) {
              onStrokeComplete({ tool: "ink", color, strokeWidth, points: stroke });
            } else {
              const overlay = overlayRef.current;
              if (overlay) drawPathsOnCanvas(overlay, paths);
            }
          }}
          onPointerCancel={() => {
            currentStroke.current = null;
            const overlay = overlayRef.current;
            if (overlay) drawPathsOnCanvas(overlay, paths);
          }}
        />
      ) : null}
    </div>
  );
}
