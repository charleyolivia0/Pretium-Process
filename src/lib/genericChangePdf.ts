import { jsPDF } from "jspdf";
import { loadPretiumLogoDataUrl } from "./pretiumLogo";
import { renderCustomFieldsSection } from "./customFieldsPdf";
import type { CustomFieldDef, CustomFieldValues } from "./changeFormTemplate";

const LAYOUT = {
  pageWidth: 612,
  pageHeight: 792,
  marginX: 54,
  marginTop: 36,
  logoBoxWidth: 230,
  logoBoxHeight: 96,
  metaCellHeight: 32,
  metaLabelWidth: 95,
  bannerHeight: 22,
  borderColor: [50, 50, 50] as [number, number, number],
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
  fill?: [number, number, number],
) {
  if (fill) {
    setFill(pdf, fill);
    pdf.rect(x, y, w, h, "F");
  }
  setDraw(pdf, LAYOUT.borderColor);
  pdf.setLineWidth(0.5);
  pdf.rect(x, y, w, h, "S");
}

function drawLabelCell(pdf: jsPDF, x: number, y: number, w: number, h: number, label: string) {
  drawCell(pdf, x, y, w, h);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  setText(pdf, [0, 0, 0]);
  pdf.text(label, x + w - 5, y + h / 2 + 3, { align: "right" });
}

function drawValueCell(pdf: jsPDF, x: number, y: number, w: number, h: number, value: string) {
  drawCell(pdf, x, y, w, h);
  if (!value) return;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  setText(pdf, [0, 0, 0]);
  pdf.text(value, x + 6, y + h / 2 + 3);
}

export type GenericChangeFormData = {
  projectNumber: string;
  projectName: string;
  documentNumber: string;
  date: string;
  customFields: CustomFieldValues;
};

export function makeEmptyGenericForm(
  projectName: string,
  projectNumber: string,
): GenericChangeFormData {
  return {
    projectNumber,
    projectName,
    documentNumber: "",
    date: "",
    customFields: {},
  };
}

const TITLE_BY_TYPE: Record<string, { title: string; numberLabel: string }> = {
  si: { title: "Site Instruction", numberLabel: "SI #" },
  submittal: { title: "Submittal", numberLabel: "Submittal #" },
  po: { title: "Purchase Order", numberLabel: "PO #" },
};

function slugifyForFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

export function buildGenericChangeFilename(
  type: keyof typeof TITLE_BY_TYPE | string,
  form: GenericChangeFormData,
): string {
  const meta = TITLE_BY_TYPE[type] ?? { title: type.toUpperCase(), numberLabel: "#" };
  const project = slugifyForFilename(form.projectNumber || "Project");
  const name = slugifyForFilename(form.projectName || "Project");
  const num = slugifyForFilename(form.documentNumber || meta.title);
  const safeTitle = slugifyForFilename(meta.title);
  return `${project} - ${name} - ${safeTitle}-${num}.pdf`;
}

export async function buildGenericChangePdf(
  type: keyof typeof TITLE_BY_TYPE | string,
  form: GenericChangeFormData,
  customFieldDefs: CustomFieldDef[],
): Promise<jsPDF> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const logoDataUrl = await loadPretiumLogoDataUrl();

  const meta = TITLE_BY_TYPE[type] ?? { title: type.toUpperCase(), numberLabel: "#" };

  const {
    marginX,
    marginTop,
    logoBoxWidth,
    logoBoxHeight,
    metaCellHeight,
    metaLabelWidth,
    bannerHeight,
    pageWidth,
  } = LAYOUT;
  const contentWidth = pageWidth - marginX * 2;
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
      // ignore
    }
  } else {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    setText(pdf, [40, 40, 40]);
    pdf.text("Pretium", marginX + 8, y + 26);
  }

  const metaX = marginX + logoBoxWidth;
  const metaW = contentWidth - logoBoxWidth;
  const valueW = metaW - metaLabelWidth;

  drawLabelCell(pdf, metaX, y, metaLabelWidth, metaCellHeight, "Project #");
  drawValueCell(pdf, metaX + metaLabelWidth, y, valueW, metaCellHeight, form.projectNumber);

  drawLabelCell(pdf, metaX, y + metaCellHeight, metaLabelWidth, metaCellHeight, "Project Name");
  drawValueCell(
    pdf,
    metaX + metaLabelWidth,
    y + metaCellHeight,
    valueW,
    metaCellHeight,
    form.projectName,
  );

  drawLabelCell(pdf, metaX, y + metaCellHeight * 2, metaLabelWidth, metaCellHeight, meta.numberLabel);
  drawValueCell(
    pdf,
    metaX + metaLabelWidth,
    y + metaCellHeight * 2,
    valueW,
    metaCellHeight,
    form.documentNumber,
  );

  let cursorY = y + logoBoxHeight;

  drawCell(pdf, marginX, cursorY, contentWidth, bannerHeight, [240, 240, 240]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  setText(pdf, [0, 0, 0]);
  pdf.text(meta.title, marginX + contentWidth / 2, cursorY + bannerHeight / 2 + 4, {
    align: "center",
  });
  cursorY += bannerHeight;

  drawLabelCell(pdf, marginX, cursorY, metaLabelWidth, metaCellHeight, "Date");
  drawValueCell(
    pdf,
    marginX + metaLabelWidth,
    cursorY,
    contentWidth - metaLabelWidth,
    metaCellHeight,
    form.date,
  );
  cursorY += metaCellHeight + 6;

  renderCustomFieldsSection(pdf, customFieldDefs, form.customFields, {
    startNewPage: false,
    cursorY,
    title: "Details",
  });

  return pdf;
}
