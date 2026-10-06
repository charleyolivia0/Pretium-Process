import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { shellCardStyle } from "../theme";
import { resolveDisplayImageUrl } from "../utils/heicImage";
import { DocumentViewersChip } from "../components/DocumentViewersChip";
import {
  ImageMarkupBlock,
  LazyPdfPage,
  MarkupFitViewport,
  MarkupToolbar,
  MARKUP_ZOOM_MAX,
  MARKUP_ZOOM_MIN,
  MARKUP_ZOOM_STEP,
  initPdfJs,
  isPdfFileName,
  isRasterFileName,
  payloadFromRecord,
  useLiveMarkupSync,
  type InkPath,
} from "../lib/markup";

function clampZoom(value: number) {
  return Math.min(MARKUP_ZOOM_MAX, Math.max(MARKUP_ZOOM_MIN, value));
}

export type { InkPath };

export function DrawingViewer() {
  const { projectId, drawingId } = useParams<{ projectId: string; drawingId: string }>();
  const currentUser = useQuery(api.users.current);
  const drawing = useQuery(
    api.drawingMarkups.getDrawingForViewer,
    drawingId ? { drawingId: drawingId as Id<"drawings"> } : "skip",
  );
  const markup = useQuery(
    api.drawingMarkups.getMarkupByDrawingId,
    drawingId ? { drawingId: drawingId as Id<"drawings"> } : "skip",
  );
  const saveDrawingMarkup = useMutation(api.drawingMarkups.saveDrawingMarkup);

  const {
    pagePaths,
    setPagePaths,
    markLocalEdit,
    onPersistSuccess,
    pendingRemote,
    applyPendingRemote,
    dismissPendingRemote,
  } = useLiveMarkupSync(markup, drawingId);

  const [penColor, setPenColor] = useState("#dc2626");
  const [penWidth, setPenWidth] = useState(3);
  const [focusPageIndex, setFocusPageIndex] = useState(0);
  const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayUrlError, setDisplayUrlError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const pagePathsRef = useRef(pagePaths);
  pagePathsRef.current = pagePaths;

  useEffect(() => {
    setPdf(null);
    setPdfError(null);
    setDisplayUrl(null);
    setDisplayUrlError(null);
    setZoom(1);
  }, [drawingId]);

  const persist = useCallback(async () => {
    if (!drawingId || !projectId || !drawing) return;
    if (drawing.projectId !== projectId) return;
    setSaveState("saving");
    try {
      await saveDrawingMarkup({
        drawingId: drawingId as Id<"drawings">,
        projectId: projectId as Id<"projects">,
        payload: payloadFromRecord(pagePathsRef.current),
      });
      onPersistSuccess(Date.now());
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
    }
  }, [drawingId, projectId, drawing, saveDrawingMarkup, onPersistSuccess]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void persist();
    }, 500);
  }, [persist]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleStroke = useCallback(
    (pageIndex: number, path: InkPath) => {
      markLocalEdit();
      setPagePaths((prev) => ({
        ...prev,
        [pageIndex]: [...(prev[pageIndex] ?? []), path],
      }));
      schedulePersist();
    },
    [markLocalEdit, schedulePersist, setPagePaths],
  );

  const handleImageStroke = useCallback(
    (path: InkPath) => {
      handleStroke(0, path);
    },
    [handleStroke],
  );

  const isRaster = drawing ? isRasterFileName(drawing.name) : false;

  useEffect(() => {
    if (!drawing || !isRaster) return;
    let cancelled = false;
    setDisplayUrl(null);
    setDisplayUrlError(null);
    resolveDisplayImageUrl(drawing.fileUrl, undefined, drawing.name)
      .then((url) => {
        if (!cancelled) setDisplayUrl(url);
      })
      .catch((e) => {
        if (!cancelled) {
          setDisplayUrlError(e instanceof Error ? e.message : "Could not load image");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [drawing?.fileUrl, drawing?.name, drawing?._id, isRaster]);

  useEffect(() => {
    if (!drawing || !isPdfFileName(drawing.name)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(drawing.fileUrl);
        if (!res.ok) throw new Error(`Could not load file (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdfjs = await initPdfJs();
        const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
        const doc = await task.promise;
        if (cancelled) return;
        setPdf(doc);
        setPdfError(null);
      } catch (e) {
        if (!cancelled) {
          setPdfError(e instanceof Error ? e.message : "Could not load PDF");
          setPdf(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawing?.fileUrl, drawing?.name, drawing?._id]);

  if (!projectId || !drawingId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Missing route parameters.</p>
      </div>
    );
  }

  if (drawing === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      </div>
    );
  }

  if (drawing === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Drawing not found.</p>
        <Link to={`/drawings/project/${projectId}`} style={{ color: "#059669", fontWeight: 600 }}>
          Back to folder
        </Link>
      </div>
    );
  }

  if (drawing.projectId !== projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>This drawing does not belong to the project in the URL.</p>
        <Link to={`/drawings/project/${drawing.projectId}`} style={{ color: "#059669", fontWeight: 600 }}>
          Open correct project
        </Link>
      </div>
    );
  }

  const unsupported = !isPdfFileName(drawing.name) && !isRasterFileName(drawing.name);

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h1 className="page-title" style={{ marginBottom: "0.25rem" }}>
            {drawing.name}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Markup is saved automatically after each stroke (debounced). Uploaded by {drawing.uploaderName}.
          </p>
          <div style={{ marginTop: "0.5rem" }}>
            <DocumentViewersChip
              resourceKind="drawing"
              resourceId={drawingId}
              pageIndex={focusPageIndex}
              currentUserId={currentUser?._id}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link
            to={`/drawings/project/${projectId}`}
            style={{ color: "#059669", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}
          >
            Back to drawings
          </Link>
          <a href={drawing.fileUrl} target="_blank" rel="noreferrer" style={{ color: "#6b7280", fontWeight: 600, fontSize: "0.875rem" }}>
            Open file
          </a>
        </div>
      </div>

      {pendingRemote && (
        <div
          style={{
            marginBottom: "0.75rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            backgroundColor: "#fef3c7",
            border: "1px solid #fcd34d",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            fontSize: "0.8125rem",
          }}
        >
          <span>
            New markup from {pendingRemote.authorName}. Apply to see their changes (your unsaved strokes may be replaced).
          </span>
          <span style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={applyPendingRemote}
              style={{
                padding: "0.25rem 0.6rem",
                borderRadius: "0.35rem",
                border: "1px solid #047857",
                backgroundColor: "#059669",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={dismissPendingRemote}
              style={{
                padding: "0.25rem 0.6rem",
                borderRadius: "0.35rem",
                border: "1px solid #d1d5db",
                backgroundColor: "#fff",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </span>
        </div>
      )}

      <section style={shellCardStyle}>
        {unsupported ? (
          <div style={{ color: "var(--text-secondary)", padding: "0.5rem 0" }}>
            <p>In-app markup supports PDF and images (JPG, PNG, WebP, HEIC) only.</p>
            <a href={drawing.fileUrl} target="_blank" rel="noreferrer" style={{ color: "#059669", fontWeight: 600 }}>
              Download / open file
            </a>
          </div>
        ) : (
          <>
            <MarkupToolbar
              penColor={penColor}
              onPenColorChange={setPenColor}
              penWidth={penWidth}
              onPenWidthChange={setPenWidth}
              focusPageIndex={focusPageIndex}
              onClearPage={() => {
                markLocalEdit();
                setPagePaths((prev) => {
                  const next = { ...prev };
                  delete next[focusPageIndex];
                  return next;
                });
                schedulePersist();
              }}
              onClearAll={() => {
                markLocalEdit();
                setPagePaths({});
                schedulePersist();
              }}
              onSaveNow={() => void persist()}
              saveState={saveState}
              zoom={zoom}
              onZoomIn={() => setZoom((z) => clampZoom(z + MARKUP_ZOOM_STEP))}
              onZoomOut={() => setZoom((z) => clampZoom(z - MARKUP_ZOOM_STEP))}
              onZoomFit={() => setZoom(1)}
            />
            {isPdfFileName(drawing.name) ? (
              pdfError ? (
                <p style={{ color: "#dc2626" }}>{pdfError}</p>
              ) : !pdf ? (
                <p style={{ color: "var(--text-secondary)" }}>Loading PDF…</p>
              ) : (
                <MarkupFitViewport zoom={zoom} onZoomChange={(z) => setZoom(clampZoom(z))}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    {Array.from({ length: pdf.numPages }, (_, i) => (
                      <LazyPdfPage
                        key={i}
                        pdf={pdf}
                        pageIndex={i}
                        paths={pagePaths[i] ?? []}
                        color={penColor}
                        strokeWidth={penWidth}
                        onPageInteract={setFocusPageIndex}
                        onStrokeComplete={handleStroke}
                      />
                    ))}
                  </div>
                </MarkupFitViewport>
              )
            ) : displayUrlError ? (
              <p style={{ color: "#dc2626" }}>{displayUrlError}</p>
            ) : !displayUrl ? (
              <p style={{ color: "var(--text-secondary)" }}>Loading image…</p>
            ) : (
              <MarkupFitViewport zoom={zoom} onZoomChange={(z) => setZoom(clampZoom(z))}>
                <ImageMarkupBlock
                  fileUrl={displayUrl}
                  name={drawing.name}
                  paths={pagePaths[0] ?? []}
                  color={penColor}
                  strokeWidth={penWidth}
                  fitToViewport
                  onPageInteract={() => setFocusPageIndex(0)}
                  onStrokeComplete={handleImageStroke}
                />
              </MarkupFitViewport>
            )}
          </>
        )}
      </section>
    </div>
  );
}
