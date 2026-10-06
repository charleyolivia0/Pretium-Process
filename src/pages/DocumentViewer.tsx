import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { shellCardStyle } from "../theme";
import { resolveDisplayImageUrl } from "../utils/heicImage";
import { DocumentViewersChip } from "../components/DocumentViewersChip";
import {
  LazyPdfPage,
  MarkupFitViewport,
  MARKUP_ZOOM_MAX,
  MARKUP_ZOOM_MIN,
  MARKUP_ZOOM_STEP,
  initPdfJs,
  isPdfFileName,
  isRasterFileName,
} from "../lib/markup";

function clampZoom(value: number) {
  return Math.min(MARKUP_ZOOM_MAX, Math.max(MARKUP_ZOOM_MIN, value));
}

export function DocumentViewer() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>();
  const currentUser = useQuery(api.users.current);
  const doc = useQuery(
    api.documents.getDocumentById,
    documentId ? { documentId: documentId as Id<"documents"> } : "skip",
  );

  const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayUrlError, setDisplayUrlError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  const fileName = doc?.name ?? "";
  const isPdf = isPdfFileName(fileName);
  const isRaster = isRasterFileName(fileName);

  useEffect(() => {
    setPdf(null);
    setPdfError(null);
    setDisplayUrl(null);
    setDisplayUrlError(null);
    setPageIndex(0);
    setZoom(1);
  }, [documentId]);

  useEffect(() => {
    if (!doc || !isPdf) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(doc.fileUrl);
        if (!res.ok) throw new Error(`Could not load file (${res.status})`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdfjs = await initPdfJs();
        const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
        const loaded = await task.promise;
        if (cancelled) return;
        setPdf(loaded);
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
  }, [doc?.fileUrl, doc?._id, isPdf]);

  useEffect(() => {
    if (!doc || !isRaster) return;
    let cancelled = false;
    setDisplayUrl(null);
    setDisplayUrlError(null);
    resolveDisplayImageUrl(doc.fileUrl, undefined, fileName)
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
  }, [doc?.fileUrl, doc?._id, fileName, isRaster]);

  if (!projectId || !documentId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Missing route parameters.</p>
      </div>
    );
  }

  if (doc === undefined) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      </div>
    );
  }

  if (doc === null) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>Document not found.</p>
        <Link to={`/projects/${projectId}`} style={{ color: "#059669", fontWeight: 600 }}>
          Back to project
        </Link>
      </div>
    );
  }

  if (doc.projectId !== projectId) {
    return (
      <div style={{ fontFamily: "Montserrat, sans-serif" }}>
        <p style={{ color: "#b91c1c" }}>This document does not belong to the project in the URL.</p>
        <Link to={`/projects/${doc.projectId}`} style={{ color: "#059669", fontWeight: 600 }}>
          Open correct project
        </Link>
      </div>
    );
  }

  const folderBackHref = doc.folderId
    ? `/projects/${projectId}/folders/${doc.folderId}`
    : `/projects/${projectId}`;

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
            {doc.name}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            {doc.type} · Read-only viewer
          </p>
          <div style={{ marginTop: "0.5rem" }}>
            <DocumentViewersChip
              resourceKind="document"
              resourceId={documentId}
              pageIndex={isPdf ? pageIndex : undefined}
              currentUserId={currentUser?._id}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to={folderBackHref} style={{ color: "#059669", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem" }}>
            Back
          </Link>
          <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ color: "#6b7280", fontWeight: 600, fontSize: "0.875rem" }}>
            Open in new tab
          </a>
        </div>
      </div>

      <section style={shellCardStyle}>
        {isPdf ? (
          pdfError ? (
            <p style={{ color: "#dc2626" }}>{pdfError}</p>
          ) : !pdf ? (
            <p style={{ color: "var(--text-secondary)" }}>Loading PDF…</p>
          ) : (
            <>
              <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  style={{ padding: "0.25rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #d1d5db", cursor: "pointer" }}
                >
                  Previous
                </button>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  Page {pageIndex + 1} of {pdf.numPages}
                </span>
                <button
                  type="button"
                  disabled={pageIndex >= pdf.numPages - 1}
                  onClick={() => setPageIndex((p) => Math.min(pdf.numPages - 1, p + 1))}
                  style={{ padding: "0.25rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #d1d5db", cursor: "pointer" }}
                >
                  Next
                </button>
                <span style={{ marginLeft: "0.5rem", color: "var(--text-secondary)" }}>|</span>
                <button type="button" onClick={() => setZoom((z) => clampZoom(z - MARKUP_ZOOM_STEP))} style={{ padding: "0.25rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #d1d5db", cursor: "pointer" }}>
                  −
                </button>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => clampZoom(z + MARKUP_ZOOM_STEP))} style={{ padding: "0.25rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #d1d5db", cursor: "pointer" }}>
                  +
                </button>
                <button type="button" onClick={() => setZoom(1)} style={{ padding: "0.25rem 0.6rem", borderRadius: "0.35rem", border: "1px solid #d1d5db", cursor: "pointer" }}>
                  Fit
                </button>
              </div>
              <MarkupFitViewport zoom={zoom} onZoomChange={(z) => setZoom(clampZoom(z))}>
                <LazyPdfPage
                  pdf={pdf}
                  pageIndex={pageIndex}
                  paths={[]}
                  color="#dc2626"
                  strokeWidth={3}
                  readOnly
                />
              </MarkupFitViewport>
            </>
          )
        ) : isRaster ? (
          displayUrlError ? (
            <p style={{ color: "#dc2626" }}>{displayUrlError}</p>
          ) : !displayUrl ? (
            <p style={{ color: "var(--text-secondary)" }}>Loading image…</p>
          ) : (
            <img
              src={displayUrl}
              alt={doc.name}
              style={{ maxWidth: "100%", height: "auto", display: "block" }}
            />
          )
        ) : (
          <iframe
            title={doc.name}
            src={doc.fileUrl}
            style={{
              width: "100%",
              height: "min(75vh, 720px)",
              border: "none",
              backgroundColor: "#fff",
            }}
          />
        )}
      </section>
    </div>
  );
}
