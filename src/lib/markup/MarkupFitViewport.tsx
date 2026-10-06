import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export const MARKUP_ZOOM_MIN = 1;
export const MARKUP_ZOOM_MAX = 4;
export const MARKUP_ZOOM_STEP = 0.25;

type MarkupFitViewportProps = {
  children: ReactNode;
  zoom: number;
  onZoomChange?: (zoom: number) => void;
};

function clampZoom(value: number) {
  return Math.min(MARKUP_ZOOM_MAX, Math.max(MARKUP_ZOOM_MIN, value));
}

export function MarkupFitViewport({ children, zoom, onZoomChange }: MarkupFitViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [contentSize, setContentSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const contentW = content.scrollWidth;
    const contentH = content.scrollHeight;
    if (contentW < 2 || contentH < 2) return;

    const viewportW = viewport.clientWidth;
    const viewportH = viewport.clientHeight;
    if (viewportW < 2 || viewportH < 2) return;

    const nextFit = Math.min(viewportW / contentW, viewportH / contentH, 1);
    setFitScale(nextFit);
    setContentSize({ w: contentW, h: contentH });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    measure();
    const roViewport = new ResizeObserver(() => measure());
    const roContent = new ResizeObserver(() => measure());
    roViewport.observe(viewport);
    roContent.observe(content);
    return () => {
      roViewport.disconnect();
      roContent.disconnect();
    };
  }, [measure, children]);

  const effectiveScale = fitScale * zoom;
  const hasSize = contentSize.w >= 2 && contentSize.h >= 2;
  const scaledW = hasSize ? contentSize.w * effectiveScale : undefined;
  const scaledH = hasSize ? contentSize.h * effectiveScale : undefined;

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!onZoomChange) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -MARKUP_ZOOM_STEP : MARKUP_ZOOM_STEP;
      onZoomChange(clampZoom(zoom + delta));
    },
    [onZoomChange, zoom],
  );

  const handleDoubleClick = useCallback(() => {
    if (!onZoomChange) return;
    onZoomChange(zoom <= 1 ? 2 : MARKUP_ZOOM_MIN);
  }, [onZoomChange, zoom]);

  return (
    <div
      ref={viewportRef}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      style={{
        height: "calc(100vh - 14rem)",
        overflow: zoom > 1 ? "auto" : "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          width: scaledW,
          height: scaledH,
          flexShrink: 0,
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: hasSize ? `scale(${effectiveScale})` : undefined,
            transformOrigin: "top left",
            width: hasSize ? contentSize.w : undefined,
            height: hasSize ? contentSize.h : undefined,
            display: "inline-block",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
