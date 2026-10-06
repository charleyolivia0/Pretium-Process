export type CustomFieldKind =
  | "text"
  | "longtext"
  | "date"
  | "number"
  | "select"
  | "checkbox";

export type CustomFieldDef = {
  id: string;
  label: string;
  kind: CustomFieldKind;
  required: boolean;
  options?: string[];
};

export type CustomFieldValue = string | number | boolean | null;

export type CustomFieldValues = Record<string, CustomFieldValue>;

export type ChangeFormType =
  | "rfi"
  | "pcn"
  | "co"
  | "cor"
  | "si"
  | "submittal"
  | "po";

export const CHANGE_FORM_TYPE_LABEL: Record<ChangeFormType, string> = {
  rfi: "Request for Information",
  pcn: "Potential Change Order",
  co: "Change Order",
  cor: "Change Order Request",
  si: "Site Instruction",
  submittal: "Submittal",
  po: "Purchase Order",
};

/** Types with a built-in pop-up form; custom fields append after the standard fields. */
export const BUILT_IN_FORM_TYPES = new Set<ChangeFormType>(["rfi", "pcn", "co", "cor"]);

export const ALL_CHANGE_FORM_TYPES: ChangeFormType[] = [
  "rfi",
  "pcn",
  "co",
  "cor",
  "si",
  "submittal",
  "po",
];

/** Uppercase document.type values stored in the documents table for project changes. */
export const CHANGE_DOCUMENT_TYPES = [
  "RFI",
  "PCN",
  "CO",
  "COR",
  "SI",
  "SUBMITTAL",
  "PO",
] as const;

export type ChangeDocumentType = (typeof CHANGE_DOCUMENT_TYPES)[number];

export const CHANGE_DOCUMENT_TYPE_LABEL: Record<ChangeDocumentType, string> = {
  RFI: "RFI",
  PCN: "PCN",
  CO: "Change order",
  COR: "COR",
  SI: "Site Instruction",
  SUBMITTAL: "Submittal",
  PO: "Purchase Order",
};

export const CUSTOM_FIELD_KIND_LABEL: Record<CustomFieldKind, string> = {
  text: "Short text",
  longtext: "Long text",
  date: "Date",
  number: "Number",
  select: "Dropdown",
  checkbox: "Checkbox",
};

export function makeFieldId(): string {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof (globalThis.crypto as Crypto).randomUUID === "function"
  ) {
    return (globalThis.crypto as Crypto).randomUUID();
  }
  return `f_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

/** Coerce stored values into the right primitive for rendering. */
export function readFieldValue(
  field: CustomFieldDef,
  values: CustomFieldValues | undefined,
): CustomFieldValue {
  const raw = values?.[field.id];
  if (raw == null) {
    switch (field.kind) {
      case "checkbox":
        return false;
      case "number":
        return "";
      default:
        return "";
    }
  }
  return raw;
}

/** Validate field values. Returns an error string or null. */
export function validateCustomFields(
  fields: CustomFieldDef[],
  values: CustomFieldValues | undefined,
): string | null {
  if (!fields || fields.length === 0) return null;
  for (const f of fields) {
    const v = values?.[f.id];
    if (!f.required) continue;
    if (f.kind === "checkbox") {
      if (v !== true) return `"${f.label}" is required.`;
      continue;
    }
    if (v == null || (typeof v === "string" && v.trim() === "")) {
      return `"${f.label}" is required.`;
    }
  }
  return null;
}

/** Render a value for display in a PDF. */
export function formatCustomFieldValueForPdf(
  field: CustomFieldDef,
  value: CustomFieldValue,
): string {
  if (value == null || value === "") return "—";
  if (field.kind === "checkbox") return value === true ? "Yes" : "No";
  if (field.kind === "date" && typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      const monthName = months[Number(m[2]) - 1] ?? m[2];
      const day = String(Number(m[3]));
      const year = m[1].slice(2);
      return `${day}-${monthName}-${year}`;
    }
    return value;
  }
  return String(value);
}
