export const PDF_RENDER_SCALE = 1.25;

export async function initPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  const version = (pdfjs as { version?: string }).version ?? "4.8.69";
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
  (pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } }).GlobalWorkerOptions = {
    workerSrc,
  };
  return pdfjs as typeof import("pdfjs-dist") & {
    getDocument: (src: { data: Uint8Array }) => { promise: Promise<import("pdfjs-dist").PDFDocumentProxy> };
  };
}
