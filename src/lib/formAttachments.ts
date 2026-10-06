import type { Id } from "../../convex/_generated/dataModel";
import type { jsPDF } from "jspdf";

export const FORM_ATTACHMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.ppt,.pptx,.txt,.xlsx,.xls,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type FormAttachment = {
  storageId: Id<"_storage">;
  fileName: string;
  mimeType: string;
};

export type PcnFormAttachments = {
  tableA: FormAttachment[];
  tableB: FormAttachment[];
  end: FormAttachment[];
};

export type CoFormAttachments = {
  workSection: FormAttachment[];
  end: FormAttachment[];
};

export type FetchAttachmentBytes = (id: Id<"_storage">) => Promise<ArrayBuffer>;

const LETTER_W = 612;
const LETTER_H = 792;
const MARGIN = 28;

function extLower(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

function isPdf(att: FormAttachment): boolean {
  return att.mimeType === "application/pdf" || extLower(att.fileName) === "pdf";
}

function isImage(att: FormAttachment): boolean {
  const ext = extLower(att.fileName);
  if (att.mimeType.startsWith("image/")) return true;
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp" || ext === "gif";
}

function isDocx(att: FormAttachment): boolean {
  const ext = extLower(att.fileName);
  return ext === "docx" || att.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isTxt(att: FormAttachment): boolean {
  const ext = extLower(att.fileName);
  return ext === "txt" || att.mimeType === "text/plain";
}

function isSpreadsheet(att: FormAttachment): boolean {
  const ext = extLower(att.fileName);
  return ext === "xlsx" || ext === "xls" || ext === "csv";
}

function addSlotHeaderPage(pdf: jsPDF, slotLabel: string) {
  pdf.addPage("letter");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`Attachments — ${slotLabel}`, MARGIN, MARGIN + 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("The following pages were appended from uploaded attachments.", MARGIN, MARGIN + 36);
}

function fitRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { w, h };
}

async function appendPdf(pdf: jsPDF, bytes: ArrayBuffer) {
  const { initPdfJs, PDF_RENDER_SCALE } = await import("./markup/pdf");
  const pdfjs = await initPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");

    pdf.addPage("letter");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const { w, h } = fitRect(canvas.width, canvas.height, pageW - MARGIN * 2, pageH - MARGIN * 2);
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(dataUrl, "PNG", x, y, w, h);
  }
}

async function appendImage(pdf: jsPDF, bytes: ArrayBuffer, fileName: string) {
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed"));
    });
    img.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");

    pdf.addPage("letter");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const { w, h } = fitRect(canvas.width, canvas.height, pageW - MARGIN * 2, pageH - MARGIN * 2);
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(fileName, MARGIN, MARGIN - 6);
    pdf.addImage(dataUrl, "PNG", x, y, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function appendWrappedTextPages(pdf: jsPDF, title: string, text: string) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const maxW = pageW - MARGIN * 2;
  const lineH = 12;
  const topY = MARGIN + 34;
  const bottomY = pageH - MARGIN;
  const maxLines = Math.max(1, Math.floor((bottomY - topY) / lineH));

  const lines = (pdf.splitTextToSize(text, maxW) as string[]) ?? [text];
  let idx = 0;
  while (idx < lines.length) {
    pdf.addPage("letter");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, MARGIN, MARGIN + 18);
    pdf.setFont("courier", "normal");
    pdf.setFontSize(10);
    let y = topY;
    for (let i = 0; i < maxLines && idx < lines.length; i++, idx++) {
      pdf.text(lines[idx], MARGIN, y);
      y += lineH;
    }
  }
}

async function appendDocx(pdf: jsPDF, bytes: ArrayBuffer, fileName: string) {
  const mammoth = await import("mammoth");
  const res = await mammoth.extractRawText({ arrayBuffer: bytes });
  appendWrappedTextPages(pdf, fileName, res.value || "");
}

async function appendSpreadsheet(pdf: jsPDF, bytes: ArrayBuffer, fileName: string) {
  // `xlsx` is added as a dependency in this task; dynamic import keeps initial bundles smaller.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const first = wb.SheetNames?.[0];
  if (!first) {
    appendWrappedTextPages(pdf, fileName, "(Empty workbook)");
    return;
  }
  const sheet = wb.Sheets[first];
  const csv = XLSX.utils.sheet_to_csv(sheet);
  appendWrappedTextPages(pdf, `${fileName} — ${first}`, csv || "(Empty sheet)");
}

function appendUnsupported(pdf: jsPDF, att: FormAttachment) {
  pdf.addPage("letter");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(att.fileName, MARGIN, MARGIN + 18);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const msg = [
    `File type: ${att.mimeType || "unknown"}`,
    "",
    "This attachment is stored with the document, but could not be rendered into the PDF.",
  ].join("\n");
  const lines = pdf.splitTextToSize(msg, LETTER_W - MARGIN * 2) as string[];
  let y = MARGIN + 40;
  for (const line of lines) {
    pdf.text(line, MARGIN, y);
    y += 12;
  }
}

export async function appendFilesToJsPdf(
  pdf: jsPDF,
  attachments: FormAttachment[],
  fetchBytes: FetchAttachmentBytes | undefined,
  slotLabel: string,
): Promise<void> {
  if (!attachments.length || !fetchBytes) return;

  addSlotHeaderPage(pdf, slotLabel);

  for (const att of attachments) {
    try {
      const bytes = await fetchBytes(att.storageId);
      if (isPdf(att)) {
        await appendPdf(pdf, bytes);
      } else if (isImage(att)) {
        await appendImage(pdf, bytes, att.fileName);
      } else if (isDocx(att)) {
        await appendDocx(pdf, bytes, att.fileName);
      } else if (isTxt(att)) {
        const text = new TextDecoder().decode(bytes);
        appendWrappedTextPages(pdf, att.fileName, text);
      } else if (isSpreadsheet(att)) {
        await appendSpreadsheet(pdf, bytes, att.fileName);
      } else {
        appendUnsupported(pdf, att);
      }
    } catch {
      appendUnsupported(pdf, att);
    }
  }
}

