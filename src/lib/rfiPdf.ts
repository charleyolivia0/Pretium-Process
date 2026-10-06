import { jsPDF } from "jspdf";
import { loadPretiumLogoDataUrl } from "./pretiumLogo";
import { appendCustomFieldsPage } from "./customFieldsPdf";
import type { CustomFieldDef, CustomFieldValues } from "./changeFormTemplate";

export type RfiProceedVia = "" | "change_order" | "change_directive" | "pcn" | "si";

export type RfiFormData = {
  projectNumber: string;
  projectName: string;
  rfiNumber: string;
  date: string;
  to: string;
  attention: string;
  cc: string;
  subject: string;
  description: string;
  proposedSolution: string;
  changeToContract: "" | "yes" | "no";
  responseRequiredBy: string;
  responseDetails: string;
  proceedVia: RfiProceedVia;
  signatureDate: string;
  signatureName: string;
  signatureDrawnDataUrl: string;
  customFields?: CustomFieldValues;
};

export function makeEmptyRfiForm(): RfiFormData {
  return {
    projectNumber: "",
    projectName: "",
    rfiNumber: "",
    date: "",
    to: "",
    attention: "",
    cc: "",
    subject: "",
    description: "",
    proposedSolution: "",
    changeToContract: "",
    responseRequiredBy: "",
    responseDetails: "",
    proceedVia: "",
    signatureDate: "",
    signatureName: "",
    signatureDrawnDataUrl: "",
    customFields: {},
  };
}

function slugifyForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

export function buildRfiFilename(form: RfiFormData): string {
  const project = slugifyForFilename(form.projectNumber || "Project");
  const name = slugifyForFilename(form.projectName || "Project");
  const rfi = slugifyForFilename(form.rfiNumber || "RFI");
  return `${project} - ${name} - RFI-${rfi}.pdf`;
}

const LAYOUT = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 54,
  marginTop: 36,
  marginBottom: 36,
  logoBoxWidth: 230,
  logoBoxHeight: 96,
  metaCellHeight: 32,
  metaLabelWidth: 95,
  labelWidth: 110,
  rowHeightSmall: 22,
  rowHeightMed: 60,
  rowHeightLarge: 110,
  bannerHeight: 18,
  proceedRowHeight: 26,
  signatureRowHeight: 26,
  signatureBlockHeight: 70,
  borderColor: [50, 50, 50] as [number, number, number],
  red: [200, 32, 38] as [number, number, number],
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
  options: { fill?: [number, number, number]; border?: boolean; lineWidth?: number } = {},
) {
  if (options.fill) {
    setFill(pdf, options.fill);
    pdf.rect(x, y, w, h, "F");
  }
  if (options.border !== false) {
    setDraw(pdf, LAYOUT.borderColor);
    pdf.setLineWidth(options.lineWidth ?? 0.5);
    pdf.rect(x, y, w, h, "S");
  }
}

function drawLabelCell(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: { fontSize?: number; bold?: boolean; align?: "left" | "right" | "center" } = {},
) {
  drawCell(pdf, x, y, w, h);
  pdf.setFont("helvetica", opts.bold === false ? "normal" : "bold");
  pdf.setFontSize(opts.fontSize ?? 9);
  setText(pdf, [0, 0, 0]);
  const padX = 5;
  const align = opts.align ?? "right";
  const textX = align === "right" ? x + w - padX : align === "center" ? x + w / 2 : x + padX;
  pdf.text(label, textX, y + h / 2 + (opts.fontSize ?? 9) / 3, { align });
}

function drawValueCell(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
  opts: { fontSize?: number; color?: [number, number, number]; bold?: boolean; multiline?: boolean } = {},
) {
  drawCell(pdf, x, y, w, h);
  if (!value) return;
  pdf.setFont("helvetica", opts.bold ? "bold" : "normal");
  pdf.setFontSize(opts.fontSize ?? 9.5);
  setText(pdf, opts.color ?? [0, 0, 0]);
  const padX = 6;
  if (opts.multiline) {
    const lines = pdf.splitTextToSize(value, w - padX * 2) as string[];
    const lineHeight = (opts.fontSize ?? 9.5) + 2;
    let textY = y + lineHeight + 2;
    for (const line of lines) {
      if (textY > y + h - 3) break;
      pdf.text(line, x + padX, textY);
      textY += lineHeight;
    }
  } else {
    pdf.text(value, x + padX, y + h / 2 + (opts.fontSize ?? 9.5) / 3);
  }
}

function drawHeaderBlock(pdf: jsPDF, form: RfiFormData, logoDataUrl: string | null) {
  const { marginX, marginTop, logoBoxWidth, logoBoxHeight, metaCellHeight, metaLabelWidth } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  const y = marginTop;

  drawCell(pdf, marginX, y, logoBoxWidth, logoBoxHeight);
  if (logoDataUrl) {
    try {
      const padX = 6;
      const padY = 4;
      const maxW = logoBoxWidth - padX * 2;
      const maxH = logoBoxHeight - padY * 2;
      const naturalRatio = 170 / 111;
      let drawW = maxH * naturalRatio;
      let drawH = maxH;
      if (drawW > maxW) {
        drawW = maxW;
        drawH = maxW / naturalRatio;
      }
      const offsetX = marginX + padX + (maxW - drawW) / 2;
      const offsetY = y + padY + (maxH - drawH) / 2;
      pdf.addImage(logoDataUrl, "PNG", offsetX, offsetY, drawW, drawH);
    } catch {
      logoDataUrl = null;
    }
  }
  if (!logoDataUrl) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    setText(pdf, [40, 40, 40]);
    pdf.text("Pretium", marginX + 8, y + 26);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("LEAN CONSTRUCTION SPECIALISTS", marginX + 8, y + 42);
  }

  const metaX = marginX + logoBoxWidth;
  const metaW = contentWidth - logoBoxWidth;
  const valueW = metaW - metaLabelWidth;

  drawLabelCell(pdf, metaX, y, metaLabelWidth, metaCellHeight, "Project #");
  drawValueCell(pdf, metaX + metaLabelWidth, y, valueW, metaCellHeight, form.projectNumber);

  drawLabelCell(pdf, metaX, y + metaCellHeight, metaLabelWidth, metaCellHeight, "Project Name");
  drawValueCell(pdf, metaX + metaLabelWidth, y + metaCellHeight, valueW, metaCellHeight, form.projectName);

  drawLabelCell(pdf, metaX, y + metaCellHeight * 2, metaLabelWidth, metaCellHeight, "RFI #");
  drawValueCell(pdf, metaX + metaLabelWidth, y + metaCellHeight * 2, valueW, metaCellHeight, form.rfiNumber);
}

function drawBanner(pdf: jsPDF, x: number, y: number, w: number, h: number, label: string) {
  drawCell(pdf, x, y, w, h, { fill: [255, 255, 255] });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  setText(pdf, [0, 0, 0]);
  pdf.text(label, x + w / 2, y + h / 2 + 4, { align: "center" });
}

type RowSpec = {
  label: string;
  value: string;
  height: number;
  multiline?: boolean;
  valueColor?: [number, number, number];
  valueBold?: boolean;
};

function drawLabeledRow(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  spec: RowSpec,
) {
  const { labelWidth } = LAYOUT;
  drawLabelCell(pdf, x, y, labelWidth, spec.height, spec.label);
  drawValueCell(pdf, x + labelWidth, y, w - labelWidth, spec.height, spec.value, {
    multiline: spec.multiline,
    color: spec.valueColor,
    bold: spec.valueBold,
  });
}

function drawProceedRow(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  selected: RfiProceedVia,
) {
  const { labelWidth } = LAYOUT;
  drawLabelCell(pdf, x, y, labelWidth, h, "Proceed via:");

  const cellsX = x + labelWidth;
  const cellsW = w - labelWidth;
  const options: { id: RfiProceedVia; label: string }[] = [
    { id: "change_order", label: "Change Order" },
    { id: "change_directive", label: "Change Directive" },
    { id: "pcn", label: "PCN" },
    { id: "si", label: "SI" },
  ];
  const colW = cellsW / options.length;
  options.forEach((opt, i) => {
    const cellX = cellsX + colW * i;
    drawCell(pdf, cellX, y, colW, h);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    setText(pdf, [0, 0, 0]);
    pdf.text(opt.label, cellX + colW / 2, y + h / 2 + 3, { align: "center" });
    if (selected === opt.id) {
      setDraw(pdf, LAYOUT.red);
      pdf.setLineWidth(1.4);
      const ovalW = Math.min(colW - 16, 60);
      const ovalH = h - 8;
      const cx = cellX + colW / 2;
      const cy = y + h / 2;
      pdf.ellipse(cx, cy, ovalW / 2, ovalH / 2, "S");
    }
  });
}

function drawSignatureBlock(pdf: jsPDF, x: number, y: number, w: number, form: RfiFormData) {
  const { signatureRowHeight, signatureBlockHeight, labelWidth } = LAYOUT;

  drawLabelCell(pdf, x, y, labelWidth, signatureRowHeight, "Date");
  drawValueCell(pdf, x + labelWidth, y, w - labelWidth, signatureRowHeight, form.signatureDate, {
    color: LAYOUT.red,
    bold: true,
  });

  const nameY = y + signatureRowHeight;
  drawLabelCell(pdf, x, nameY, labelWidth, signatureRowHeight, "Name");
  drawValueCell(pdf, x + labelWidth, nameY, w - labelWidth, signatureRowHeight, form.signatureName, {
    color: LAYOUT.red,
    bold: true,
  });

  const sigY = nameY + signatureRowHeight;
  drawLabelCell(pdf, x, sigY, labelWidth, signatureBlockHeight, "Signature");
  drawCell(pdf, x + labelWidth, sigY, w - labelWidth, signatureBlockHeight);

  if (form.signatureDrawnDataUrl) {
    try {
      const padX = 8;
      const padY = 6;
      pdf.addImage(
        form.signatureDrawnDataUrl,
        "PNG",
        x + labelWidth + padX,
        sigY + padY,
        w - labelWidth - padX * 2,
        signatureBlockHeight - padY * 2,
      );
    } catch {
      // fall through to typed
    }
  }
  if (!form.signatureDrawnDataUrl && form.signatureName.trim()) {
    pdf.setFont("times", "italic");
    pdf.setFontSize(28);
    setText(pdf, LAYOUT.red);
    pdf.text(form.signatureName, x + labelWidth + w / 2 - labelWidth / 2, sigY + signatureBlockHeight / 2 + 8, {
      align: "center",
    });
  }
}

export async function buildRfiPdf(
  form: RfiFormData,
  customFieldDefs?: CustomFieldDef[],
): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const logoDataUrl = await loadPretiumLogoDataUrl();

  const { marginX, marginTop, logoBoxHeight, bannerHeight, rowHeightSmall, rowHeightMed, rowHeightLarge, proceedRowHeight } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;

  drawHeaderBlock(pdf, form, logoDataUrl);

  let cursorY = marginTop + logoBoxHeight;

  drawBanner(pdf, marginX, cursorY, contentWidth, bannerHeight, "Request for Information");
  cursorY += bannerHeight;

  const requestRows: RowSpec[] = [
    { label: "Date", value: form.date, height: rowHeightSmall },
    { label: "To", value: form.to, height: rowHeightSmall },
    { label: "Attention", value: form.attention, height: rowHeightSmall },
    { label: "CC", value: form.cc, height: rowHeightSmall, multiline: true },
    { label: "Subject", value: form.subject, height: rowHeightSmall },
    { label: "Description", value: form.description, height: rowHeightLarge, multiline: true },
    {
      label: "Proposed\nSolution",
      value: form.proposedSolution,
      height: rowHeightMed,
      multiline: true,
    },
    {
      label: "Change to\nContract",
      value: form.changeToContract === "yes" ? "Yes" : form.changeToContract === "no" ? "No" : "",
      height: rowHeightSmall,
    },
    { label: "Response\nrequired by", value: form.responseRequiredBy, height: rowHeightSmall },
  ];

  for (const row of requestRows) {
    if (row.label.includes("\n")) {
      const lines = row.label.split("\n");
      drawCell(pdf, marginX, cursorY, LAYOUT.labelWidth, row.height);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      setText(pdf, [0, 0, 0]);
      const lineH = 11;
      const startY = cursorY + row.height / 2 - ((lines.length - 1) * lineH) / 2 + 3;
      lines.forEach((line, i) => {
        pdf.text(line, marginX + LAYOUT.labelWidth - 5, startY + i * lineH, { align: "right" });
      });
      drawValueCell(
        pdf,
        marginX + LAYOUT.labelWidth,
        cursorY,
        contentWidth - LAYOUT.labelWidth,
        row.height,
        row.value,
        { multiline: row.multiline, color: row.valueColor, bold: row.valueBold },
      );
    } else {
      drawLabeledRow(pdf, marginX, cursorY, contentWidth, row);
    }
    cursorY += row.height;
  }

  drawBanner(pdf, marginX, cursorY, contentWidth, bannerHeight, "Response");
  cursorY += bannerHeight;

  drawLabelCell(pdf, marginX, cursorY, LAYOUT.labelWidth, rowHeightLarge, "Response Details");
  drawValueCell(
    pdf,
    marginX + LAYOUT.labelWidth,
    cursorY,
    contentWidth - LAYOUT.labelWidth,
    rowHeightLarge,
    form.responseDetails,
    { multiline: true, color: LAYOUT.red, bold: true, fontSize: 10 },
  );
  cursorY += rowHeightLarge;

  drawProceedRow(pdf, marginX, cursorY, contentWidth, proceedRowHeight, form.proceedVia);
  cursorY += proceedRowHeight;

  drawSignatureBlock(pdf, marginX, cursorY, contentWidth, form);

  appendCustomFieldsPage(pdf, customFieldDefs, form.customFields);

  return pdf;
}
