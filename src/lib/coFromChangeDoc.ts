import type { Doc } from "../../convex/_generated/dataModel";
import { isPcnOrCorType } from "./changeDocStatus";
import { computeGrandTotal as computeCorGrandTotal, type CorFormData } from "./corPdf";
import { makeEmptyCoForm, makeEmptyCoLine, type CoFormData, type CoLineItem } from "./coPdf";
import { computeGrandTotal as computePcnGrandTotal, type PcnFormData } from "./pcnPdf";

function num(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function rowAmount(quantity: string, unitPrice: string, total: string, lumpsum: string): number {
  const typed = num(total);
  if (typed !== 0) return typed;
  const computed = num(quantity) * num(unitPrice);
  if (computed !== 0) return computed;
  return num(lumpsum);
}

function formatAmount(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return n.toFixed(2);
}

type LineRow = {
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  lumpsum: string;
};

function rowsFromTable(
  table: { rows: LineRow[] },
  referencePrefix: string,
  chargeField: "internal" | "external",
): CoLineItem[] {
  const out: CoLineItem[] = [];
  for (const row of table.rows) {
    const desc = row.description.trim();
    if (!desc) continue;
    const amount = rowAmount(row.quantity, row.unitPrice, row.total, row.lumpsum);
    if (amount === 0) continue;
    const formatted = formatAmount(amount);
    out.push({
      description: desc,
      reference: referencePrefix,
      internalCharge: chargeField === "internal" ? formatted : "",
      externalCharge: chargeField === "external" ? formatted : "",
    });
  }
  return out;
}

function parsePcnForm(formData: string): PcnFormData | null {
  try {
    return JSON.parse(formData) as PcnFormData;
  } catch {
    return null;
  }
}

function parseCorForm(formData: string): CorFormData | null {
  try {
    return JSON.parse(formData) as CorFormData;
  } catch {
    return null;
  }
}

export function buildCoFormFromChangeDoc(
  sourceDoc: Doc<"documents">,
  projectName: string,
): CoFormData {
  const base = makeEmptyCoForm();
  base.projectName = projectName;
  base.coNumber = "";

  if (!isPcnOrCorType(sourceDoc.type)) {
    return base;
  }

  const docType = sourceDoc.type.trim().toUpperCase();
  const tradeName = sourceDoc.tradeName?.trim() ?? "";

  if (!sourceDoc.formData) {
    if (tradeName) base.companyName = tradeName;
    if (sourceDoc.name) {
      base.rows = [
        {
          description: sourceDoc.name,
          reference: docType,
          internalCharge: "",
          externalCharge: "",
        },
      ];
    }
    return base;
  }

  if (docType === "PCN") {
    const form = parsePcnForm(sourceDoc.formData);
    if (!form) return base;

    const refNum = form.pcnNumber.trim() || "PCN";
    base.date = form.date || base.date;
    base.projectNumber = form.jobNumber?.trim() || projectName;
    base.projectName = form.jobName || projectName;
    base.companyName = tradeName;
    base.ccnNumber = form.pcnNumber || base.ccnNumber;

    const rows: CoLineItem[] = [
      ...rowsFromTable(form.tableA, `${refNum} Table A`, "internal"),
      ...rowsFromTable(form.tableB, `${refNum} Table B`, "external"),
    ];

    if (form.change.trim()) {
      const grandTotal = computePcnGrandTotal(form);
      rows.push({
        description: form.change.trim(),
        reference: `PCN-${refNum}`,
        internalCharge: "",
        externalCharge: grandTotal !== 0 ? formatAmount(grandTotal) : "",
      });
    }

    base.rows = rows.length > 0 ? rows : [makeEmptyCoLine()];
    return base;
  }

  const form = parseCorForm(sourceDoc.formData);
  if (!form) return base;

  const refNum = form.corNumber.trim() || "COR";
  base.date = form.date || base.date;
  base.projectNumber = form.jobNumber?.trim() || projectName;
  base.projectName = form.jobName || projectName;
  base.companyName = tradeName;
  base.ccnNumber = form.corNumber || base.ccnNumber;

  const rows: CoLineItem[] = [
    ...rowsFromTable(form.tableA, `${refNum} Table A`, "internal"),
    ...rowsFromTable(form.tableB, `${refNum} Table B`, "external"),
  ];

  if (form.change.trim()) {
    const grandTotal = computeCorGrandTotal(form);
    rows.push({
      description: form.change.trim(),
      reference: `COR-${refNum}`,
      internalCharge: "",
      externalCharge: grandTotal !== 0 ? formatAmount(grandTotal) : "",
    });
  }

  base.rows = rows.length > 0 ? rows : [makeEmptyCoLine()];
  return base;
}
