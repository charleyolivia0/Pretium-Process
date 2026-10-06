import { useEffect, useRef, useState } from "react";
import { drawPathsOnCanvas, normalizePointer } from "./canvas";
import { PDF_RENDER_SCALE } from "./pdf";
import type { InkPath } from "./types";

type LazyPdfPageProps = {
  pdf: import("pdfjs-dist").PDFDocumentProxy;
  pageIndex: number;
  paths: InkPath[];
  color: string;
  strokeWidth: number;
  onStrokeComplete?: (pageIndex: number, path: InkPath) => void;
  onPageInteract?: (pageIndex: number) => void;
  readOnly?: boolean;
};

export function LazyPdfPage({
  pdf,
  pageIndex,
  paths,
  color,
  strokeWidth,
  onStrokeComplete,
  onPageInteract,
  readOnly = false,
}: LazyPdfPageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const currentStroke = useRef<{ x: number; y: number }[] | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) {
            setVisible(true);
            break;
          }
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
      const w = Math.floor(viewport.width);
      const h = Math.floor(viewport.height);
      setDims({ w, h });
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;
      const base = baseRef.current;
      if (!base) return;
      base.width = w;
      base.height = h;
      const ctx = base.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      await page.render({ canvas: base, viewport }).promise;
    })().catch(() => {
      /* surface in parent if needed */
    });
    return () => {
      cancelled = true;
    };
  }, [visible, pdf, pageIndex]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !dims) return;
    overlay.width = dims.w;
    overlay.height = dims.h;
    drawPathsOnCanvas(overlay, paths);
  }, [dims, paths]);

  function redrawOverlayWithCurrent() {
    const overlay = overlayRef.current;
    if (!overlay || !dims) return;
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
        marginBottom: "1rem",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      <canvas ref={baseRef} style={{ display: "block", verticalAlign: "top" }} />
      {dims && !readOnly ? (
        <canvas
          ref={overlayRef}
          width={dims.w}
          height={dims.h}
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
            onPageInteract?.(pageIndex);
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
              onStrokeComplete?.(pageIndex, { tool: "ink", color, strokeWidth, points: stroke });
            } else {
              const overlay = overlayRef.current;
              if (overlay) drawPathsOnCanvas(overlay, paths);
            }
          }}
          onPointerCancel={(e) => {
            currentStroke.current = null;
            const overlay = overlayRef.current;
            if (overlay) drawPathsOnCanvas(overlay, paths);
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
        />
      ) : dims && paths.length > 0 ? (
        <canvas
          ref={overlayRef}
          width={dims.w}
          height={dims.h}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
        />
      ) : null}
    </div>
  );
}
