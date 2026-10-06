import { jsPDF } from "jspdf";
import { loadPretiumLogoDataUrl } from "./pretiumLogo";
import { appendCustomFieldsPage } from "./customFieldsPdf";
import type { CustomFieldDef, CustomFieldValues } from "./changeFormTemplate";
import type { CoFormAttachments, FetchAttachmentBytes } from "./formAttachments";
import { appendFilesToJsPdf } from "./formAttachments";

export type CoLineItem = {
  description: string;
  reference: string;
  internalCharge: string;
  externalCharge: string;
};

export type CoFormData = {
  date: string;
  subcontractNumber: string;
  coNumber: string;
  projectNumber: string;
  projectName: string;
  companyName: string;
  address: string;
  rows: CoLineItem[];
  ccnNumber: string;
  approvalNumber: string;
  originalContract: string;
  previousChange: string;
  attachments?: CoFormAttachments;
  customFields?: CustomFieldValues;
};

export function makeEmptyCoLine(): CoLineItem {
  return { description: "", reference: "", internalCharge: "", externalCharge: "" };
}

export function makeEmptyCoForm(): CoFormData {
  return {
    date: "",
    subcontractNumber: "",
    coNumber: "",
    projectNumber: "",
    projectName: "",
    companyName: "",
    address: "",
    rows: [makeEmptyCoLine()],
    ccnNumber: "",
    approvalNumber: "",
    originalContract: "",
    previousChange: "",
    attachments: { workSection: [], end: [] },
    customFields: {},
  };
}

function num(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export type CoTotals = {
  totalInternal: number;
  totalThisCo: number;
  originalContract: number;
  previousChange: number;
  revisedAmount: number;
};

export function getPdfRows(form: CoFormData): CoLineItem[] {
  return form.rows.filter((r) => num(r.externalCharge) !== 0);
}

export function computeCoTotals(form: CoFormData): CoTotals {
  const totalInternal = form.rows.reduce((sum, r) => sum + num(r.internalCharge), 0);
  const totalThisCo = form.rows.reduce((sum, r) => sum + num(r.externalCharge), 0);
  const originalContract = num(form.originalContract);
  const previousChange = num(form.previousChange);
  const revisedAmount = originalContract + previousChange + totalThisCo;
  return { totalInternal, totalThisCo, originalContract, previousChange, revisedAmount };
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function slugifyForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

export function buildCoFilename(form: CoFormData): string {
  const project = slugifyForFilename(form.projectNumber || "Project");
  const company = slugifyForFilename(form.companyName || "Subcontractor");
  const co = slugifyForFilename(form.coNumber || "CO");
  return `${project} - ${company} - CO-${co}.pdf`;
}

const LAYOUT = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 36,
  marginTop: 36,
  marginBottom: 36,
  topBandHeight: 130,
  logoWidth: 170,
  logoHeight: 111,
  titleColor: [40, 40, 40] as [number, number, number],
  bandGrey: [217, 217, 217] as [number, number, number],
  lightGrey: [240, 240, 240] as [number, number, number],
  borderGrey: [120, 120, 120] as [number, number, number],
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
    setDraw(pdf, LAYOUT.borderGrey);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, w, h, "S");
  }
}

function drawHeaderBand(pdf: jsPDF, logoDataUrl: string | null) {
  const { marginX, marginTop, logoWidth, logoHeight } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  const y = marginTop;

  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "PNG", marginX, y, logoWidth, logoHeight);
    } catch {
      logoDataUrl = null;
    }
  }
  if (!logoDataUrl) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    setText(pdf, [40, 40, 40]);
    pdf.text("Pretium", marginX, y + 22);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("LEAN CONSTRUCTION SPECIALISTS", marginX, y + 38);
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  setText(pdf, [40, 40, 40]);
  const rightX = marginX + contentWidth;
  pdf.text("Pretium Projects Ltd.", rightX, y + 18, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text("200-698 Corydon Avenue", rightX, y + 32, { align: "right" });
  pdf.text("Winnipeg, MB R3M 0X9", rightX, y + 46, { align: "right" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  setText(pdf, [40, 40, 40]);
  pdf.text("Subcontract Change Order", rightX, y + LAYOUT.topBandHeight - 12, { align: "right" });
}

function drawToSection(pdf: jsPDF, form: CoFormData, startY: number): number {
  const { marginX } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  const headerH = 16;
  const leftW = contentWidth * 0.55;
  const rightW = contentWidth - leftW;

  drawCell(pdf, marginX, startY, contentWidth, headerH, { fill: LAYOUT.lightGrey });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  setText(pdf, [0, 0, 0]);
  pdf.text("To:", marginX + 6, startY + headerH - 5);

  const bodyY = startY + headerH;
  const leftContentW = leftW - 12;
  const companyLines = pdf.splitTextToSize(form.companyName || " ", leftContentW) as string[];
  const addressLines = pdf.splitTextToSize(form.address || " ", leftContentW) as string[];

  const lineH = 11;
  const labelToValueGap = 12;
  const blockGap = 8;
  const topPad = 14;
  const bottomPad = 10;
  const leftContentH =
    topPad +
    labelToValueGap + companyLines.length * lineH +
    blockGap +
    labelToValueGap + addressLines.length * lineH +
    bottomPad;

  const labelX = marginX + leftW + 6;
  const valueX = marginX + leftW + 90;
  const valueColW = rightW - (valueX - (marginX + leftW)) - 6;
  const projectNumberLines = pdf.splitTextToSize(form.projectNumber || " ", valueColW) as string[];
  const projectNameLines = pdf.splitTextToSize(form.projectName || " ", valueColW) as string[];
  const dateLines = pdf.splitTextToSize(form.date || " ", valueColW) as string[];
  const subLines = pdf.splitTextToSize(form.subcontractNumber || " ", valueColW) as string[];
  const coLines = pdf.splitTextToSize(form.coNumber || " ", valueColW) as string[];

  const rowGap = 14;
  const rightContentH =
    topPad +
    Math.max(1, dateLines.length) * lineH + (rowGap - lineH) +
    Math.max(1, subLines.length) * lineH + (rowGap - lineH) +
    Math.max(1, coLines.length) * lineH + (rowGap - lineH) +
    Math.max(1, projectNumberLines.length) * lineH +
    projectNameLines.length * lineH +
    bottomPad;

  const minBodyH = 70;
  const bodyH = Math.max(minBodyH, leftContentH, rightContentH);

  drawCell(pdf, marginX, bodyY, leftW, bodyH);
  drawCell(pdf, marginX + leftW, bodyY, rightW, bodyH);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  let leftCursor = bodyY + topPad;
  pdf.text("Company Name:", marginX + 6, leftCursor);
  pdf.setFont("helvetica", "normal");
  let companyY = leftCursor + labelToValueGap;
  for (const line of companyLines) {
    pdf.text(line, marginX + 6, companyY);
    companyY += lineH;
  }
  leftCursor = companyY + blockGap;
  pdf.setFont("helvetica", "bold");
  pdf.text("Address:", marginX + 6, leftCursor);
  pdf.setFont("helvetica", "normal");
  let addressY = leftCursor + labelToValueGap;
  for (const line of addressLines) {
    pdf.text(line, marginX + 6, addressY);
    addressY += lineH;
  }

  let rightCursor = bodyY + topPad;
  const drawRightRow = (label: string, valueLines: string[]) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(label, labelX, rightCursor);
    pdf.setFont("helvetica", "normal");
    let lineY = rightCursor;
    for (const line of valueLines) {
      pdf.text(line, valueX, lineY);
      lineY += lineH;
    }
    rightCursor += Math.max(rowGap, valueLines.length * lineH + (rowGap - lineH));
  };
  drawRightRow("Date:", dateLines);
  drawRightRow("Subcontract #:", subLines);
  drawRightRow("C.O. #:", coLines);

  pdf.setFont("helvetica", "bold");
  pdf.text("Project:", labelX, rightCursor);
  pdf.setFont("helvetica", "normal");
  let projectLineY = rightCursor;
  for (const line of projectNumberLines) {
    pdf.text(line, valueX, projectLineY);
    projectLineY += lineH;
  }
  for (const line of projectNameLines) {
    pdf.text(line, valueX, projectLineY);
    projectLineY += lineH;
  }

  return bodyY + bodyH;
}

function drawDescriptionSection(pdf: jsPDF, form: CoFormData, totals: CoTotals, startY: number): number {
  const { marginX } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  const headerH = 16;

  drawCell(pdf, marginX, startY, contentWidth, headerH, { fill: LAYOUT.lightGrey });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  setText(pdf, [0, 0, 0]);
  pdf.text("Description of Work", marginX + 6, startY + headerH - 5);

  const intro = "This is a formal authorization for you to proceed with the following changes in accordance with the terms of your Subcontract.";
  const introWrapped = pdf.splitTextToSize(intro, contentWidth - 12) as string[];

  const descX = marginX + 6;
  const refX = marginX + contentWidth * 0.45;
  const amtRightX = marginX + contentWidth - 12;
  const descColW = (refX - descX) - 6;
  const refColW = (amtRightX - 80) - refX;

  const fontSize = 9;
  const lineH = 11;
  const minRowH = 13;
  const rowPad = 2;

  const pdfRows = getPdfRows(form);
  const rowMetrics = pdfRows.map((row) => {
    const descLines = row.description ? (pdf.splitTextToSize(row.description, descColW) as string[]) : [];
    const refLines = row.reference ? (pdf.splitTextToSize(row.reference, refColW) as string[]) : [];
    const lines = Math.max(1, descLines.length, refLines.length);
    const h = Math.max(minRowH, lines * lineH + rowPad);
    return { descLines, refLines, h };
  });

  const colHeaderH = 16;
  const summaryH = 14 * 6;
  const introH = 8 + introWrapped.length * lineH + 10;
  const rowsH = rowMetrics.reduce((sum, r) => sum + r.h, 0);
  const bodyH = introH + colHeaderH + rowsH + 6 + summaryH + 10;

  const bodyY = startY + headerH;
  drawCell(pdf, marginX, bodyY, contentWidth, bodyH);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(fontSize);
  let cursorY = bodyY + 14;
  for (const line of introWrapped) {
    pdf.text(line, marginX + 6, cursorY);
    cursorY += lineH;
  }
  cursorY += 6;

  pdf.setFont("helvetica", "bold");
  pdf.text("Description:", descX, cursorY);
  pdf.text("Reference:", refX, cursorY);
  pdf.text("Change Amount:", amtRightX, cursorY, { align: "right" });
  cursorY += colHeaderH - 2;

  pdf.setFont("helvetica", "normal");
  pdfRows.forEach((row, i) => {
    const metrics = rowMetrics[i];
    let descLineY = cursorY;
    for (const line of metrics.descLines) {
      pdf.text(line, descX, descLineY);
      descLineY += lineH;
    }
    let refLineY = cursorY;
    for (const line of metrics.refLines) {
      pdf.text(line, refX, refLineY);
      refLineY += lineH;
    }
    if (row.externalCharge) {
      pdf.text(formatMoney(num(row.externalCharge)), amtRightX, cursorY, { align: "right" });
    }
    cursorY += metrics.h;
  });
  cursorY += 6;

  const summaryLeftLabelX = marginX + contentWidth * 0.4;
  const summaryValueX = amtRightX;
  const summaryLineGap = 14;
  const drawSummaryLine = (label: string, value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.text(label, summaryLeftLabelX, cursorY);
    pdf.text(value, summaryValueX, cursorY, { align: "right" });
    cursorY += summaryLineGap;
  };
  drawSummaryLine("CCN #", form.ccnNumber || "");
  drawSummaryLine("Approval #", form.approvalNumber || "");
  drawSummaryLine("Total this C.O.:", formatMoney(totals.totalThisCo));
  drawSummaryLine("Original Contract Amt:", formatMoney(totals.originalContract));
  drawSummaryLine("Previous Change Amount:", formatMoney(totals.previousChange));
  drawSummaryLine("Revised Amount:", formatMoney(totals.revisedAmount), true);

  return bodyY + bodyH;
}

function drawSignatureSection(pdf: jsPDF, form: CoFormData, startY: number) {
  const { marginX } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  const y = startY + 24;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  setText(pdf, [0, 0, 0]);
  const intro = "Signatures authorize changes to the Subcontract as outlined in Description of Work.  A signed copy must be received prior to payment for the above work.";
  const wrapped = pdf.splitTextToSize(intro, contentWidth) as string[];
  let cursorY = y;
  for (const line of wrapped) {
    pdf.text(line, marginX, cursorY);
    cursorY += 11;
  }

  cursorY += 38;
  const colW = (contentWidth - 30) / 2;
  const leftLineEnd = marginX + colW;
  const rightLineStart = marginX + colW + 30;
  const rightLineEnd = marginX + contentWidth;

  const drawPair = (leftLabel: string, rightLabel: string) => {
    setDraw(pdf, [0, 0, 0]);
    pdf.setLineWidth(0.5);
    pdf.line(marginX, cursorY, leftLineEnd, cursorY);
    pdf.line(rightLineStart, cursorY, rightLineEnd, cursorY);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(leftLabel, marginX, cursorY + 12);
    pdf.text(rightLabel, rightLineStart, cursorY + 12);
    cursorY += 38;
  };

  drawPair("Pretium Projects Ltd.", "Date");
  drawPair(form.companyName || "Subcontractor", "Date");
}

export async function buildCoPdf(
  form: CoFormData,
  customFieldDefs?: CustomFieldDef[],
  fetchAttachmentBytes?: FetchAttachmentBytes,
): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const logoDataUrl = await loadPretiumLogoDataUrl();

  drawHeaderBand(pdf, logoDataUrl);
  let cursorY = LAYOUT.marginTop + LAYOUT.topBandHeight + 6;

  cursorY = drawToSection(pdf, form, cursorY) + 6;

  const totals = computeCoTotals(form);
  cursorY = drawDescriptionSection(pdf, form, totals, cursorY) + 6;
  await appendFilesToJsPdf(pdf, form.attachments?.workSection ?? [], fetchAttachmentBytes, "Description of Work");

  drawSignatureSection(pdf, form, cursorY);
  await appendFilesToJsPdf(pdf, form.attachments?.end ?? [], fetchAttachmentBytes, "Additional");

  appendCustomFieldsPage(pdf, customFieldDefs, form.customFields);

  return pdf;
}
