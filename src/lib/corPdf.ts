import { jsPDF } from "jspdf";
import { loadPretiumLogoDataUrl } from "./pretiumLogo";
import { appendCustomFieldsPage } from "./customFieldsPdf";
import type { CustomFieldDef, CustomFieldValues } from "./changeFormTemplate";

export type CorLineItem = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  lumpsum: string;
  note: string;
};

export type CorTable = {
  rows: CorLineItem[];
  overhead: string;
  profit: string;
};

export type CorFormData = {
  corNumber: string;
  jobNumber: string;
  jobName: string;
  date: string;
  change: string;
  changeNotice: string;
  totalDaysAdded: string;
  tableA: CorTable;
  tableB: CorTable;
  customFields?: CustomFieldValues;
};

export function makeEmptyLineItem(): CorLineItem {
  return {
    description: "",
    quantity: "",
    unit: "",
    unitPrice: "",
    total: "",
    lumpsum: "",
    note: "",
  };
}

export function makeEmptyTable(rowCount = 8): CorTable {
  return {
    rows: Array.from({ length: rowCount }, () => makeEmptyLineItem()),
    overhead: "",
    profit: "",
  };
}

export function makeEmptyForm(): CorFormData {
  return {
    corNumber: "",
    jobNumber: "",
    jobName: "",
    date: "",
    change: "",
    changeNotice: "",
    totalDaysAdded: "",
    tableA: makeEmptyTable(8),
    tableB: makeEmptyTable(8),
    customFields: {},
  };
}

function num(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function rowTotal(row: CorLineItem): number {
  const typed = num(row.total);
  if (typed !== 0) return typed;
  return num(row.quantity) * num(row.unitPrice);
}

export type TableTotals = {
  subtotalTotal: number;
  subtotalLumpsum: number;
  total: number;
  overhead: number;
  profit: number;
  gstExcludedTotal: number;
};

export function computeTableTotals(t: CorTable): TableTotals {
  const subtotalTotal = t.rows.reduce((sum, r) => sum + rowTotal(r), 0);
  const subtotalLumpsum = t.rows.reduce((sum, r) => sum + num(r.lumpsum), 0);
  const total = subtotalTotal + subtotalLumpsum;
  const overhead = num(t.overhead);
  const profit = num(t.profit);
  const gstExcludedTotal = total + overhead + profit;
  return { subtotalTotal, subtotalLumpsum, total, overhead, profit, gstExcludedTotal };
}

export function computeGrandTotal(form: CorFormData): number {
  return computeTableTotals(form.tableA).gstExcludedTotal + computeTableTotals(form.tableB).gstExcludedTotal;
}

function formatMoney(n: number): string {
  if (n === 0) return "$        -";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-$" : "$ ") + formatted;
}

function slugifyForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

export function buildCorFilename(form: CorFormData): string {
  const job = slugifyForFilename(form.jobNumber || "Job");
  const name = slugifyForFilename(form.jobName || "Project");
  const cor = slugifyForFilename(form.corNumber || "COR");
  const change = slugifyForFilename(form.change || "Change");
  return `${job} - ${name} - COR-${cor} - ${change}.pdf`;
}

const LAYOUT = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 36,
  marginTop: 36,
  marginBottom: 36,
  topBandHeight: 120,
  headerCellHeight: 22,
  logoWidth: 170,
  logoHeight: 111,
  tableRowHeight: 15,
  tableHeaderHeight: 16,
  tableBannerHeight: 16,
  footerRowHeight: 14,
  cols: {
    itemNumber: 40,
    description: 220,
    quantity: 28,
    unit: 36,
    unitPrice: 60,
    total: 75,
    lumpsum: 81,
  },
  tableARows: 8,
  tableBRows: 6,
  titleColor: [55, 71, 105] as [number, number, number],
  greenAccent: [16, 121, 79] as [number, number, number],
  bandGrey: [217, 217, 217] as [number, number, number],
  lightGrey: [245, 245, 245] as [number, number, number],
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

function drawTextCenteredIn(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { bold?: boolean; fontSize?: number; align?: "left" | "center" | "right"; color?: [number, number, number]; padX?: number } = {},
) {
  const fontSize = options.fontSize ?? 9;
  pdf.setFontSize(fontSize);
  pdf.setFont("helvetica", options.bold ? "bold" : "normal");
  if (options.color) setText(pdf, options.color);
  else setText(pdf, [0, 0, 0]);
  const align = options.align ?? "left";
  const padX = options.padX ?? 4;
  const textY = y + h / 2 + fontSize / 3;
  let textX: number;
  if (align === "center") textX = x + w / 2;
  else if (align === "right") textX = x + w - padX;
  else textX = x + padX;
  pdf.text(text, textX, textY, { align });
}

type WrapOptions = {
  fontSize?: number;
  padX?: number;
  padY?: number;
  lineHeight?: number;
};

function measureWrappedHeight(
  pdf: jsPDF,
  text: string,
  w: number,
  minHeight: number,
  options: WrapOptions = {},
): number {
  const fontSize = options.fontSize ?? 9;
  const padX = options.padX ?? 4;
  const padY = options.padY ?? 4;
  const lineHeight = options.lineHeight ?? fontSize + 2;
  if (!text) return minHeight;
  const lines = (pdf.splitTextToSize(text, w - padX * 2) as string[]).length;
  return Math.max(minHeight, lines * lineHeight + padY * 2);
}

function drawWrappedTextIn(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: WrapOptions & { bold?: boolean; align?: "left" | "center" | "right" } = {},
) {
  if (!text) return;
  const fontSize = options.fontSize ?? 9;
  const padX = options.padX ?? 4;
  const lineHeight = options.lineHeight ?? fontSize + 2;
  const wrapped = pdf.splitTextToSize(text, w - padX * 2) as string[];
  pdf.setFont("helvetica", options.bold ? "bold" : "normal");
  pdf.setFontSize(fontSize);
  setText(pdf, [0, 0, 0]);
  const align = options.align ?? "left";
  let textX: number;
  if (align === "center") textX = x + w / 2;
  else if (align === "right") textX = x + w - padX;
  else textX = x + padX;
  const textBlockH = wrapped.length * lineHeight;
  const startY = y + h / 2 - textBlockH / 2 + fontSize - 1;
  wrapped.forEach((line, i) => {
    pdf.text(line, textX, startY + i * lineHeight, { align });
  });
}

function drawHeaderBand(pdf: jsPDF, form: CorFormData, logoDataUrl: string | null) {
  const { marginX, marginTop, topBandHeight, titleColor, greenAccent, logoWidth, logoHeight } = LAYOUT;
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
    pdf.setFontSize(22);
    setText(pdf, [40, 40, 40]);
    pdf.text("Pretium", marginX, y + 18);
    setText(pdf, greenAccent);
    pdf.setFontSize(14);
    pdf.text(">>>", marginX + 78, y + 18);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    setText(pdf, greenAccent);
    pdf.text("BUILD VALUE", marginX + 108, y + 18);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    setText(pdf, [70, 70, 70]);
    pdf.text("LEAN CONSTRUCTION SPECIALISTS", marginX, y + 30);
    pdf.text("MANITOBA  -  SASKATCHEWAN  -  ALBERTA  -  BRITISH COLUMBIA", marginX, y + 39);
  }

  const cor = form.corNumber ? form.corNumber.padStart(2, "0") : "";
  const title = `CHANGE ORDER REQUEST ${cor}`.trim();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  setText(pdf, titleColor);
  pdf.text(title, marginX + contentWidth, y + topBandHeight / 2 + 6, { align: "right" });
}

function drawHeaderForm(pdf: jsPDF, form: CorFormData, startY: number): number {
  const { marginX, headerCellHeight } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  const labelW = 56;
  const colW = (contentWidth - labelW * 3) / 3;

  const rowY = startY;
  const row1H = Math.max(
    measureWrappedHeight(pdf, form.jobNumber, colW, headerCellHeight, { fontSize: 9 }),
    measureWrappedHeight(pdf, form.jobName, colW, headerCellHeight, { fontSize: 9 }),
    measureWrappedHeight(pdf, form.date, colW, headerCellHeight, { fontSize: 9 }),
  );

  let x = marginX;
  drawCell(pdf, x, rowY, labelW, row1H, { border: false });
  drawTextCenteredIn(pdf, "Job #", x, rowY, labelW, row1H, { bold: true, fontSize: 9 });
  x += labelW;
  drawCell(pdf, x, rowY, colW, row1H);
  drawWrappedTextIn(pdf, form.jobNumber, x, rowY, colW, row1H, { fontSize: 9 });
  x += colW;
  drawCell(pdf, x, rowY, labelW, row1H, { border: false });
  drawTextCenteredIn(pdf, "Job Name", x, rowY, labelW, row1H, { bold: true, fontSize: 9 });
  x += labelW;
  drawCell(pdf, x, rowY, colW, row1H);
  drawWrappedTextIn(pdf, form.jobName, x, rowY, colW, row1H, { fontSize: 9 });
  x += colW;
  drawCell(pdf, x, rowY, labelW, row1H, { border: false });
  drawTextCenteredIn(pdf, "Date:", x, rowY, labelW, row1H, { bold: true, fontSize: 9 });
  x += labelW;
  drawCell(pdf, x, rowY, colW, row1H);
  drawWrappedTextIn(pdf, form.date, x, rowY, colW, row1H, { fontSize: 9 });

  const wideLabelW = 96;
  const wideValueSpanW = contentWidth - wideLabelW;

  const row2Y = rowY + row1H + 2;
  const row2H = measureWrappedHeight(pdf, form.change, wideValueSpanW, headerCellHeight, { fontSize: 9 });
  drawCell(pdf, marginX, row2Y, wideLabelW, row2H, { border: false });
  drawTextCenteredIn(pdf, "Change Directions:", marginX, row2Y, wideLabelW, row2H, { bold: true, fontSize: 7 });
  drawCell(pdf, marginX + wideLabelW, row2Y, wideValueSpanW, row2H);
  drawWrappedTextIn(pdf, form.change, marginX + wideLabelW, row2Y, wideValueSpanW, row2H, { fontSize: 9 });

  const row3Y = row2Y + row2H;
  const row3H = measureWrappedHeight(pdf, form.changeNotice, wideValueSpanW, headerCellHeight, { fontSize: 9 });
  drawCell(pdf, marginX, row3Y, wideLabelW, row3H, { border: false });
  drawTextCenteredIn(pdf, "Change Notice (EC):", marginX, row3Y, wideLabelW, row3H, { bold: true, fontSize: 7 });
  drawCell(pdf, marginX + wideLabelW, row3Y, wideValueSpanW, row3H);
  drawWrappedTextIn(pdf, form.changeNotice, marginX + wideLabelW, row3Y, wideValueSpanW, row3H, { fontSize: 9 });

  return row3Y + row3H;
}

type TableLayout = {
  itemX: number;
  descX: number;
  qtyX: number;
  unitX: number;
  unitPriceX: number;
  totalX: number;
  lumpsumX: number;
  itemW: number;
  descW: number;
  qtyW: number;
  unitW: number;
  unitPriceW: number;
  totalW: number;
  lumpsumW: number;
};

function computeTableLayout(): TableLayout {
  const { marginX, cols } = LAYOUT;
  const itemX = marginX;
  const descX = itemX + cols.itemNumber;
  const qtyX = descX + cols.description;
  const unitX = qtyX + cols.quantity;
  const unitPriceX = unitX + cols.unit;
  const totalX = unitPriceX + cols.unitPrice;
  const lumpsumX = totalX + cols.total;
  return {
    itemX,
    descX,
    qtyX,
    unitX,
    unitPriceX,
    totalX,
    lumpsumX,
    itemW: cols.itemNumber,
    descW: cols.description,
    qtyW: cols.quantity,
    unitW: cols.unit,
    unitPriceW: cols.unitPrice,
    totalW: cols.total,
    lumpsumW: cols.lumpsum,
  };
}

function drawTableHeader(pdf: jsPDF, y: number, layout: TableLayout) {
  const h = LAYOUT.tableHeaderHeight;
  const headers: Array<{ x: number; w: number; label: string; align?: "left" | "center" | "right" }> = [
    { x: layout.itemX, w: layout.itemW, label: "Item #", align: "center" },
    { x: layout.descX, w: layout.descW, label: "Specific Work Execution", align: "center" },
    { x: layout.qtyX, w: layout.qtyW + layout.unitW, label: "Units", align: "center" },
    { x: layout.unitPriceX, w: layout.unitPriceW, label: "Unit Price", align: "center" },
    { x: layout.totalX, w: layout.totalW, label: "Total", align: "center" },
    { x: layout.lumpsumX, w: layout.lumpsumW, label: "Lumpsum", align: "center" },
  ];
  for (const h2 of headers) {
    drawCell(pdf, h2.x, y, h2.w, h, { border: false });
    drawTextCenteredIn(pdf, h2.label, h2.x, y, h2.w, h, { bold: true, fontSize: 9, align: h2.align });
  }
}

function drawTableBanner(pdf: jsPDF, y: number, layout: TableLayout, letter: string, title: string) {
  const h = LAYOUT.tableBannerHeight;
  drawCell(pdf, layout.itemX, y, layout.itemW, h, { fill: LAYOUT.bandGrey });
  drawTextCenteredIn(pdf, letter, layout.itemX, y, layout.itemW, h, { bold: true, fontSize: 11, align: "center" });
  const titleX = layout.descX;
  const titleW = layout.descW + layout.qtyW + layout.unitW + layout.unitPriceW + layout.totalW + layout.lumpsumW;
  drawCell(pdf, titleX, y, titleW, h);
  drawTextCenteredIn(pdf, title, titleX, y, titleW, h, { bold: true, fontSize: 10, align: "center" });
}

function drawTableRow(pdf: jsPDF, y: number, layout: TableLayout, row: CorLineItem): number {
  const fontSize = 8.5;
  const lineHeight = 10;
  const padX = 3;
  const padY = 3;
  const h = measureWrappedHeight(pdf, row.description, layout.descW, LAYOUT.tableRowHeight, {
    fontSize,
    padX,
    padY,
    lineHeight,
  });

  drawCell(pdf, layout.itemX, y, layout.itemW, h);
  drawCell(pdf, layout.descX, y, layout.descW, h);
  drawCell(pdf, layout.qtyX, y, layout.qtyW, h);
  drawCell(pdf, layout.unitX, y, layout.unitW, h);
  drawCell(pdf, layout.unitPriceX, y, layout.unitPriceW, h);
  drawCell(pdf, layout.totalX, y, layout.totalW, h);
  drawCell(pdf, layout.lumpsumX, y, layout.lumpsumW, h);

  if (row.description) {
    drawWrappedTextIn(pdf, row.description, layout.descX, y, layout.descW, h, {
      fontSize,
      padX,
      padY,
      lineHeight,
      align: "left",
    });
  }
  if (row.quantity) drawTextCenteredIn(pdf, row.quantity, layout.qtyX, y, layout.qtyW, h, { fontSize, align: "center" });
  if (row.unit) drawTextCenteredIn(pdf, row.unit, layout.unitX, y, layout.unitW, h, { fontSize, align: "center" });
  if (row.unitPrice) {
    const n = num(row.unitPrice);
    drawTextCenteredIn(pdf, formatMoney(n), layout.unitPriceX, y, layout.unitPriceW, h, { fontSize, align: "right", padX: 6 });
  }

  const rt = rowTotal(row);
  const totalText = rt !== 0 ? formatMoney(rt) : (row.total ? formatMoney(num(row.total)) : "$        -");
  if (row.note) {
    const noteW = 30;
    drawCell(pdf, layout.totalX, y, noteW, h, { fill: LAYOUT.lightGrey, border: true });
    drawTextCenteredIn(pdf, row.note, layout.totalX, y, noteW, h, { fontSize: 7, align: "center" });
    drawTextCenteredIn(pdf, totalText, layout.totalX + noteW, y, layout.totalW - noteW, h, { fontSize, align: "right", padX: 6 });
  } else if (rt !== 0) {
    drawTextCenteredIn(pdf, totalText, layout.totalX, y, layout.totalW, h, { fontSize, align: "right", padX: 6 });
  } else if (row.description || row.quantity || row.unitPrice) {
    drawTextCenteredIn(pdf, "$        -", layout.totalX, y, layout.totalW, h, { fontSize, align: "right", padX: 6 });
  }

  if (row.lumpsum) {
    const n = num(row.lumpsum);
    drawTextCenteredIn(pdf, formatMoney(n), layout.lumpsumX, y, layout.lumpsumW, h, { fontSize, align: "right", padX: 6 });
  }

  return h;
}

function drawTableFooter(
  pdf: jsPDF,
  startY: number,
  layout: TableLayout,
  totals: TableTotals,
  badgeLetter: string,
): number {
  const h = LAYOUT.footerRowHeight;
  const labelX = layout.unitPriceX;
  const labelW = layout.unitPriceW;
  let y = startY;

  drawTextCenteredIn(pdf, "Subtotal:", labelX, y, labelW, h, { bold: true, fontSize: 9, align: "right", padX: 6 });
  drawTextCenteredIn(pdf, formatMoney(totals.subtotalTotal), layout.totalX, y, layout.totalW, h, { fontSize: 9, align: "right", padX: 6 });
  drawTextCenteredIn(pdf, formatMoney(totals.subtotalLumpsum), layout.lumpsumX, y, layout.lumpsumW, h, { fontSize: 9, align: "right", padX: 6 });
  y += h;

  drawTextCenteredIn(pdf, "Total", labelX, y, labelW, h, { fontSize: 9, align: "right", padX: 6 });
  drawTextCenteredIn(pdf, formatMoney(totals.total), layout.totalX, y, layout.totalW, h, { fontSize: 9, align: "right", padX: 6 });
  y += h;

  drawTextCenteredIn(pdf, "Overhead", labelX, y, labelW, h, { fontSize: 9, align: "right", padX: 6 });
  drawTextCenteredIn(pdf, formatMoney(totals.overhead), layout.totalX, y, layout.totalW, h, { fontSize: 9, align: "right", padX: 6 });
  y += h;

  drawTextCenteredIn(pdf, "Profit", labelX, y, labelW, h, { fontSize: 9, align: "right", padX: 6 });
  drawTextCenteredIn(pdf, formatMoney(totals.profit), layout.totalX, y, layout.totalW, h, { fontSize: 9, align: "right", padX: 6 });
  y += h;

  const finalLabelW = layout.unitPriceW + layout.qtyW + layout.unitW;
  const finalLabelX = layout.qtyX;
  drawCell(pdf, finalLabelX, y, finalLabelW, h, { border: false });
  drawTextCenteredIn(pdf, "(GST Excluded)    Total", finalLabelX, y, finalLabelW, h, { bold: true, fontSize: 9, align: "right", padX: 6 });
  drawCell(pdf, layout.totalX, y, layout.totalW, h);
  drawTextCenteredIn(pdf, formatMoney(totals.gstExcludedTotal), layout.totalX, y, layout.totalW, h, { bold: true, fontSize: 9, align: "right", padX: 6 });
  drawCell(pdf, layout.lumpsumX, y, layout.lumpsumW, h, { fill: LAYOUT.bandGrey });
  drawTextCenteredIn(pdf, badgeLetter, layout.lumpsumX, y, layout.lumpsumW, h, { bold: true, fontSize: 11, align: "center" });
  y += h;

  return y;
}

function drawTable(
  pdf: jsPDF,
  startY: number,
  table: CorTable,
  minRows: number,
  letter: string,
  title: string,
): { endY: number; totals: TableTotals } {
  const layout = computeTableLayout();
  let y = startY;

  drawTableHeader(pdf, y, layout);
  y += LAYOUT.tableHeaderHeight;

  drawTableBanner(pdf, y, layout, letter, title);
  y += LAYOUT.tableBannerHeight;

  const rows = table.rows.slice();
  while (rows.length < minRows) rows.push(makeEmptyLineItem());

  for (const row of rows) {
    const usedH = drawTableRow(pdf, y, layout, row);
    y += usedH;
  }

  const totals = computeTableTotals(table);
  y = drawTableFooter(pdf, y, layout, totals, letter);

  return { endY: y, totals };
}

function drawGrandTotal(pdf: jsPDF, y: number, value: number): number {
  const layout = computeTableLayout();
  const h = LAYOUT.footerRowHeight + 2;
  const labelW = layout.unitPriceW + layout.qtyW + layout.unitW;
  const labelX = layout.qtyX;
  drawTextCenteredIn(pdf, "Total GST Excluded:", labelX, y, labelW, h, { bold: true, fontSize: 10, align: "right", padX: 6 });
  drawCell(pdf, layout.totalX, y, layout.totalW, h);
  drawTextCenteredIn(pdf, formatMoney(value), layout.totalX, y, layout.totalW, h, { bold: true, fontSize: 10, align: "right", padX: 6 });
  drawCell(pdf, layout.lumpsumX, y, layout.lumpsumW, h, { fill: LAYOUT.bandGrey });
  drawTextCenteredIn(pdf, "A+B", layout.lumpsumX, y, layout.lumpsumW, h, { bold: true, fontSize: 11, align: "center" });
  return y + h;
}

function drawBottomBlock(pdf: jsPDF, y: number, form: CorFormData) {
  const { marginX } = LAYOUT;
  const contentWidth = LAYOUT.pageWidth - marginX * 2;
  let cursorY = y + 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  setText(pdf, [0, 0, 0]);
  pdf.text("Total Days Added to Contract:", marginX + 40, cursorY);
  pdf.setFont("helvetica", "normal");
  pdf.text(form.totalDaysAdded || "0", marginX + 200, cursorY);
  setDraw(pdf, [0, 0, 0]);
  pdf.setLineWidth(0.5);
  pdf.line(marginX + 195, cursorY + 2, marginX + 235, cursorY + 2);

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(9);
  pdf.text("Quote is valid for 30 days.", marginX + 260, cursorY);

  cursorY += 60;
  const todayLabel = form.date || new Date().toLocaleDateString("en-US");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(todayLabel, marginX + contentWidth / 2, cursorY - 4, { align: "center" });

  const lineY = cursorY + 4;
  pdf.line(marginX, lineY, marginX + contentWidth / 2 - 20, lineY);
  pdf.line(marginX + contentWidth / 2 + 20, lineY, marginX + contentWidth, lineY);

  pdf.setFontSize(8);
  pdf.text("Pretium Projects Ltd", marginX, lineY + 10);
  pdf.text("Date", marginX + contentWidth / 2 - 60, lineY + 10);
  pdf.text("Accepted by:", marginX + contentWidth / 2 + 20, lineY + 10);
  pdf.text("Date", marginX + contentWidth - 30, lineY + 10);
}

export async function buildCorPdf(
  form: CorFormData,
  customFieldDefs?: CustomFieldDef[],
): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const logoDataUrl = await loadPretiumLogoDataUrl();

  drawHeaderBand(pdf, form, logoDataUrl);
  let cursorY = LAYOUT.marginTop + LAYOUT.topBandHeight;

  cursorY = drawHeaderForm(pdf, form, cursorY) + 6;

  const aResult = drawTable(pdf, cursorY, form.tableA, LAYOUT.tableARows, "A", "Pretium Projects Own Work");
  cursorY = aResult.endY + 8;

  const bResult = drawTable(pdf, cursorY, form.tableB, LAYOUT.tableBRows, "B", "Sub-Contractors Own Work");
  cursorY = bResult.endY + 4;

  cursorY = drawGrandTotal(pdf, cursorY, aResult.totals.gstExcludedTotal + bResult.totals.gstExcludedTotal);

  drawBottomBlock(pdf, cursorY, form);

  appendCustomFieldsPage(pdf, customFieldDefs, form.customFields);

  return pdf;
}
