import type { jsPDF } from "jspdf";
import {
  formatCustomFieldValueForPdf,
  type CustomFieldDef,
  type CustomFieldValues,
} from "./changeFormTemplate";

const PAGE_LAYOUT = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 54,
  marginTop: 54,
  marginBottom: 54,
  labelWidth: 150,
  rowMinHeight: 22,
  multilineMinHeight: 60,
  bannerHeight: 18,
  borderColor: [50, 50, 50] as [number, number, number],
  bannerFill: [240, 240, 240] as [number, number, number],
};

function setFill(pdf: jsPDF, rgb: [number, number, number]) {
  pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setText(pdf: jsPDF, rgb: [number, number, number]) {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(pdf: jsPDF, rgb: [number, number, number]) {
  pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function drawCell(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { fill?: [number, number, number]; border?: boolean } = {},
) {
  if (options.fill) {
    setFill(pdf, options.fill);
    pdf.rect(x, y, w, h, "F");
  }
  if (options.border !== false) {
    setDraw(pdf, PAGE_LAYOUT.borderColor);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, w, h, "S");
  }
}

function drawBanner(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
) {
  drawCell(pdf, x, y, w, h, { fill: PAGE_LAYOUT.bannerFill });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  setText(pdf, [0, 0, 0]);
  pdf.text(label, x + w / 2, y + h / 2 + 4, { align: "center" });
}

function drawLabelCell(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
) {
  drawCell(pdf, x, y, w, h);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  setText(pdf, [0, 0, 0]);
  const padX = 5;
  const maxW = w - padX * 2;
  const lines = pdf.splitTextToSize(label, maxW) as string[];
  const lineH = 11;
  const startY = y + h / 2 - ((lines.length - 1) * lineH) / 2 + 3;
  lines.forEach((line, i) => {
    pdf.text(line, x + w - padX, startY + i * lineH, { align: "right" });
  });
}

function drawValueCell(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  opts: { multiline?: boolean } = {},
) {
  drawCell(pdf, x, y, w, h);
  if (!value) return;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  setText(pdf, [0, 0, 0]);
  const padX = 6;
  if (opts.multiline) {
    const lines = pdf.splitTextToSize(value, w - padX * 2) as string[];
    const lineHeight = 11.5;
    let textY = y + lineHeight + 2;
    for (const line of lines) {
      if (textY > y + h - 3) break;
      pdf.text(line, x + padX, textY);
      textY += lineHeight;
    }
  } else {
    pdf.text(value, x + padX, y + h / 2 + 9.5 / 3);
  }
}

function estimateRowHeight(
  pdf: jsPDF,
  field: CustomFieldDef,
  value: string,
  contentWidth: number,
): { height: number; multiline: boolean } {
  if (field.kind === "longtext") {
    const valueColWidth = contentWidth - PAGE_LAYOUT.labelWidth - 12;
    const lines = pdf.splitTextToSize(value || " ", valueColWidth) as string[];
    const lineHeight = 11.5;
    const needed = Math.max(
      PAGE_LAYOUT.multilineMinHeight,
      lines.length * lineHeight + 18,
    );
    return { height: needed, multiline: true };
  }
  return { height: PAGE_LAYOUT.rowMinHeight, multiline: false };
}

export type CustomFieldsRenderOptions = {
  /** When true, render onto a fresh page; otherwise render at cursorY of current page. */
  startNewPage?: boolean;
  /** Optional banner title. Defaults to "Additional Information". */
  title?: string;
  /** Required if startNewPage is false. */
  cursorY?: number;
};

/**
 * Render the custom-fields section onto the supplied jsPDF doc. Returns the
 * new cursor Y position. Paginates automatically when content exceeds page.
 */
export function renderCustomFieldsSection(
  pdf: jsPDF,
  fields: CustomFieldDef[],
  values: CustomFieldValues | undefined,
  options: CustomFieldsRenderOptions = {},
): number {
  if (!fields || fields.length === 0) {
    return options.cursorY ?? PAGE_LAYOUT.marginTop;
  }

  const { marginX, marginTop, marginBottom, labelWidth, bannerHeight, pageHeight, pageWidth } =
    PAGE_LAYOUT;
  const contentWidth = pageWidth - marginX * 2;
  const title = options.title ?? "Additional Information";

  if (options.startNewPage) {
    pdf.addPage();
  }
  let cursorY = options.startNewPage ? marginTop : options.cursorY ?? marginTop;

  drawBanner(pdf, marginX, cursorY, contentWidth, bannerHeight, title);
  cursorY += bannerHeight;

  for (const field of fields) {
    const raw = values?.[field.id] ?? null;
    const display = formatCustomFieldValueForPdf(field, raw);
    const { height, multiline } = estimateRowHeight(pdf, field, display, contentWidth);

    if (cursorY + height > pageHeight - marginBottom) {
      pdf.addPage();
      cursorY = marginTop;
      drawBanner(
        pdf,
        marginX,
        cursorY,
        contentWidth,
        bannerHeight,
        `${title} (continued)`,
      );
      cursorY += bannerHeight;
    }

    drawLabelCell(pdf, marginX, cursorY, labelWidth, height, field.label);
    drawValueCell(
      pdf,
      marginX + labelWidth,
      cursorY,
      contentWidth - labelWidth,
      height,
      display,
      { multiline },
    );
    cursorY += height;
  }

  return cursorY;
}

/**
 * Convenience: append the custom-fields section onto a new page. Returns
 * silently when there are no fields.
 */
export function appendCustomFieldsPage(
  pdf: jsPDF,
  fields: CustomFieldDef[] | undefined,
  values: CustomFieldValues | undefined,
  title?: string,
): void {
  if (!fields || fields.length === 0) return;
  renderCustomFieldsSection(pdf, fields, values, {
    startNewPage: true,
    title,
  });
}
