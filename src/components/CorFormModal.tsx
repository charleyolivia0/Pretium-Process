import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  buildCorFilename,
  buildCorPdf,
  computeGrandTotal,
  computeTableTotals,
  makeEmptyForm,
  makeEmptyLineItem,
  type CorFormData,
  type CorLineItem,
  type CorTable,
} from "../lib/corPdf";
import {
  validateCustomFields,
  type CustomFieldDef,
  type CustomFieldValues,
} from "../lib/changeFormTemplate";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { useDocumentAutosave } from "../hooks/useDocumentAutosave";
import { useLiveDocumentForm, parseJsonFormData } from "../hooks/useLiveDocumentForm";
import { DocumentSaveStatusChip } from "./DocumentSaveStatusChip";
import { DocumentViewersChip } from "./DocumentViewersChip";

const MODAL_Z_INDEX = 15000;

type CorFormModalProps = {
  open: boolean;
  projectId: Id<"projects">;
  projectName: string;
  existingDoc: Doc<"documents"> | null;
  onClose: () => void;
  onSaved: () => void;
};

const PRETIUM_LABOUR_ROWS: CorLineItem[] = [
  { description: "Superintendent", quantity: "0", unit: "hr.", unitPrice: "125.00", total: "", lumpsum: "", note: "" },
  { description: "Project Manager", quantity: "0", unit: "hr.", unitPrice: "115.00", total: "", lumpsum: "", note: "" },
  { description: "Project Coordinator", quantity: "0", unit: "hr.", unitPrice: "65.00", total: "", lumpsum: "", note: "" },
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateForPdf(isoDate: string): string {
  if (!isoDate) return "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const year = m[1].slice(2);
  const month = MONTH_SHORT[Number(m[2]) - 1] ?? m[2];
  const day = String(Number(m[3]));
  return `${day}-${month}-${year}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ensureMinRows(table: CorTable, n: number): CorTable {
  if (table.rows.length >= n) return table;
  const extra = Array.from({ length: n - table.rows.length }, () => makeEmptyLineItem());
  return { ...table, rows: [...table.rows, ...extra] };
}

function parseExistingForm(doc: Doc<"documents"> | null, projectName: string): CorFormData {
  if (doc?.formData) {
    try {
      const parsed = JSON.parse(doc.formData) as Partial<CorFormData>;
      const merged: CorFormData = {
        ...makeEmptyForm(),
        ...parsed,
        tableA: parsed.tableA
          ? ensureMinRows({ ...makeEmptyForm().tableA, ...parsed.tableA, rows: parsed.tableA.rows ?? [] }, 5)
          : makeEmptyForm().tableA,
        tableB: parsed.tableB
          ? ensureMinRows({ ...makeEmptyForm().tableB, ...parsed.tableB, rows: parsed.tableB.rows ?? [] }, 5)
          : makeEmptyForm().tableB,
      };
      if (!merged.jobName) merged.jobName = projectName;
      return merged;
    } catch {
      // fall through to defaults
    }
  }
  const f = makeEmptyForm();
  f.jobName = projectName;
  f.date = todayIso();
  f.tableA = ensureMinRows(f.tableA, 5);
  f.tableB = ensureMinRows(f.tableB, 5);
  if (doc?.name) f.change = doc.name;
  if (doc?.description) f.changeNotice = doc.description;
  return f;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.55)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  zIndex: MODAL_Z_INDEX,
  padding: "1rem",
  overflowY: "auto",
};

const dialogStyle: React.CSSProperties = {
  backgroundColor: "var(--surface-panel)",
  borderRadius: "0.75rem",
  padding: "1.25rem 1.25rem 1.5rem",
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.08)",
  maxWidth: "62rem",
  width: "100%",
  margin: "1rem 0",
  fontFamily: "Montserrat, sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.35rem 0.5rem",
  borderRadius: "0.35rem",
  border: "1px solid #d1d5db",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.8125rem",
  boxSizing: "border-box",
};

const numericInputStyle: React.CSSProperties = {
  ...inputStyle,
  textAlign: "right",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.15rem",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0.75rem 0 0.4rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "var(--text-primary)",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.78rem",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.3rem 0.4rem",
  background: "#f3f4f6",
  fontWeight: 700,
  color: "#374151",
  border: "1px solid #e5e7eb",
  fontSize: "0.72rem",
};

const tdStyle: React.CSSProperties = {
  padding: "0.15rem 0.2rem",
  border: "1px solid #e5e7eb",
  verticalAlign: "middle",
};

const rowInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.25rem 0.4rem",
  border: "none",
  background: "transparent",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.78rem",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: "0.4rem",
  border: "1px solid #047857",
  backgroundColor: "#059669",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.85rem",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "0.4rem 0.85rem",
  borderRadius: "0.4rem",
  border: "1px solid #d1d5db",
  backgroundColor: "var(--surface-panel)",
  color: "var(--text-primary)",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.8rem",
  cursor: "pointer",
};

const ghostBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  padding: "0.2rem 0.5rem",
  fontSize: "0.72rem",
};

function fmtMoneyDisplay(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$ -";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function CorFormModal({ open, projectId, projectName, existingDoc, onClose, onSaved }: CorFormModalProps) {
  const [form, setForm] = useState<CorFormData>(() => parseExistingForm(existingDoc, projectName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const updateDocument = useMutation(api.documents.updateDocumentRecord);
  const formTemplate = useQuery(api.changeFormTemplates.getByType, { type: "cor" });
  const currentUser = useQuery(api.users.current);
  const customFieldDefs: CustomFieldDef[] = (formTemplate?.fields ?? []) as CustomFieldDef[];
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const { markFieldDirty, clearDirtyFields, dialogFocusProps, fieldProps } = useLiveDocumentForm<CorFormData>({
    documentId: existingDoc?._id,
    open,
    enabled: !!existingDoc,
    setForm,
    parseRemoteFormData: parseJsonFormData,
    onConflict: (field) => setConflictMsg(`Another user changed "${field}". Your edit is kept.`),
  });

  useEffect(() => {
    if (open) {
      setForm(parseExistingForm(existingDoc, projectName));
      setError(null);
      setConflictMsg(null);
    }
  }, [open, existingDoc, projectName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const totalsA = useMemo(() => computeTableTotals(form.tableA), [form.tableA]);
  const totalsB = useMemo(() => computeTableTotals(form.tableB), [form.tableB]);
  const grandTotal = useMemo(() => computeGrandTotal(form), [form]);
  const formDataJson = useMemo(() => JSON.stringify(form), [form]);
  const autosaveDraft = useMemo(
    () => ({
      formData: formDataJson,
      name: form.change.trim() || existingDoc?.name,
      description: form.changeNotice.trim() || undefined,
    }),
    [formDataJson, form.change, form.changeNotice, existingDoc?.name],
  );
  const { saveStatus, lastSavedAt, error: autosaveError } = useDocumentAutosave({
    documentId: existingDoc?._id,
    enabled: open && !!existingDoc && !busy,
    payload: formDataJson,
    draft: autosaveDraft,
  });

  useEffect(() => {
    if (saveStatus === "saved") clearDirtyFields();
  }, [saveStatus, clearDirtyFields]);

  if (!open || typeof document === "undefined") return null;

  function updateForm(patch: Partial<CorFormData>) {
    for (const key of Object.keys(patch)) markFieldDirty(key);
    setForm((f) => ({ ...f, ...patch }));
  }

  function updateTable(which: "tableA" | "tableB", patch: Partial<CorTable>) {
    markFieldDirty(which);
    setForm((f) => ({ ...f, [which]: { ...f[which], ...patch } }));
  }

  function updateRow(which: "tableA" | "tableB", index: number, patch: Partial<CorLineItem>) {
    markFieldDirty(which);
    setForm((f) => {
      const rows = f[which].rows.slice();
      rows[index] = { ...rows[index], ...patch };
      return { ...f, [which]: { ...f[which], rows } };
    });
  }

  function addRow(which: "tableA" | "tableB") {
    markFieldDirty(which);
    setForm((f) => ({ ...f, [which]: { ...f[which], rows: [...f[which].rows, makeEmptyLineItem()] } }));
  }

  function removeRow(which: "tableA" | "tableB", index: number) {
    markFieldDirty(which);
    setForm((f) => {
      const rows = f[which].rows.slice();
      rows.splice(index, 1);
      if (rows.length === 0) rows.push(makeEmptyLineItem());
      return { ...f, [which]: { ...f[which], rows } };
    });
  }

  function insertPretiumLabourRows() {
    markFieldDirty("tableA");
    setForm((f) => {
      const existingNonEmpty = f.tableA.rows.filter(
        (r) => r.description.trim() || r.quantity.trim() || r.unitPrice.trim() || r.lumpsum.trim(),
      );
      const labour = PRETIUM_LABOUR_ROWS.map((r) => ({ ...r }));
      const remainingBlanks = Math.max(0, 5 - (existingNonEmpty.length + labour.length));
      const blanks = Array.from({ length: remainingBlanks }, () => makeEmptyLineItem());
      return {
        ...f,
        tableA: { ...f.tableA, rows: [...labour, ...existingNonEmpty, ...blanks] },
      };
    });
  }

  function validate(): string | null {
    if (!form.corNumber.trim()) return "COR # is required.";
    if (!form.jobNumber.trim()) return "Job # is required.";
    if (!form.jobName.trim()) return "Job Name is required.";
    if (!form.date.trim()) return "Date is required.";
    if (!form.change.trim()) return "Change Directions is required.";
    const customError = validateCustomFields(customFieldDefs, form.customFields);
    if (customError) return customError;
    return null;
  }

  async function handleGenerate() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formForPdf: CorFormData = { ...form, date: formatDateForPdf(form.date) };
      const pdf = await buildCorPdf(formForPdf, customFieldDefs);
      const filename = buildCorFilename(formForPdf);
      pdf.save(filename);

      const blob = pdf.output("blob") as Blob;

      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: blob,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      const isoToMs = (iso: string): number | undefined => {
        const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return undefined;
        return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      };
      const createdMs = isoToMs(form.date) ?? Date.now();
      const docName = form.change.trim();
      const docDescription = form.changeNotice.trim() || undefined;
      const formDataJson = JSON.stringify(form);

      if (existingDoc) {
        await updateDocument({
          documentId: existingDoc._id,
          name: docName,
          createdDate: createdMs,
          description: docDescription,
          storageId,
          formData: formDataJson,
        });
      } else {
        await createDocument({
          projectId,
          type: "COR",
          name: docName,
          storageId,
          status: "unpaid",
          createdDate: createdMs,
          description: docDescription,
          formData: formDataJson,
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the COR PDF.");
    } finally {
      setBusy(false);
    }
  }

  function renderTable(which: "tableA" | "tableB", letter: "A" | "B", title: string) {
    const table = form[which];
    const totals = which === "tableA" ? totalsA : totalsB;
    return (
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={sectionTitleStyle}>
          <span
            style={{
              display: "inline-flex",
              width: "1.5rem",
              height: "1.5rem",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.25rem",
              background: "#d4d4d4",
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {letter}
          </span>
          <span>{title}</span>
          {which === "tableA" ? (
            <button type="button" style={ghostBtnStyle} onClick={insertPretiumLabourRows} disabled={busy}>
              Insert Pretium labour rows
            </button>
          ) : null}
          <button type="button" style={ghostBtnStyle} onClick={() => addRow(which)} disabled={busy}>
            + Add row
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "26%" }}>Specific Work Execution</th>
                <th style={{ ...thStyle, width: "6%" }}>Qty</th>
                <th style={{ ...thStyle, width: "8%" }}>Unit</th>
                <th style={{ ...thStyle, width: "10%" }}>Unit Price</th>
                <th style={{ ...thStyle, width: "12%" }}>Total</th>
                <th style={{ ...thStyle, width: "12%" }}>Lumpsum</th>
                <th style={{ ...thStyle, width: "16%" }}>Note</th>
                <th style={{ ...thStyle, width: "3%" }} aria-label="Remove row"></th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => {
                const computedTotal = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
                return (
                  <tr key={i}>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(which, i, { description: e.target.value })}
                        style={rowInputStyle}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateRow(which, i, { quantity: e.target.value })}
                        style={{ ...rowInputStyle, textAlign: "right" }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => updateRow(which, i, { unit: e.target.value })}
                        style={{ ...rowInputStyle, textAlign: "center" }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(which, i, { unitPrice: e.target.value })}
                        style={{ ...rowInputStyle, textAlign: "right" }}
                      />
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280", textAlign: "right", padding: "0.3rem 0.4rem" }}>
                      {computedTotal ? fmtMoneyDisplay(computedTotal) : "$ -"}
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.lumpsum}
                        onChange={(e) => updateRow(which, i, { lumpsum: e.target.value })}
                        style={{ ...rowInputStyle, textAlign: "right" }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => updateRow(which, i, { note: e.target.value })}
                        style={rowInputStyle}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => removeRow(which, i)}
                        disabled={busy}
                        title="Remove row"
                        aria-label="Remove row"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#dc2626",
                          fontSize: "0.9rem",
                          cursor: "pointer",
                          padding: "0 0.2rem",
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>Subtotal</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#6b7280" }}></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtMoneyDisplay(totals.subtotalTotal)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmtMoneyDisplay(totals.subtotalLumpsum)}</td>
                <td style={tdStyle} colSpan={2}></td>
              </tr>
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>Total</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: "right" }} colSpan={2}>{fmtMoneyDisplay(totals.total)}</td>
                <td style={tdStyle} colSpan={2}></td>
              </tr>
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>Overhead ($)</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, padding: "0.15rem 0.2rem" }} colSpan={2}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={table.overhead}
                    onChange={(e) => updateTable(which, { overhead: e.target.value })}
                    style={{ ...rowInputStyle, textAlign: "right" }}
                  />
                </td>
                <td style={tdStyle} colSpan={2}></td>
              </tr>
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>Profit ($)</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, padding: "0.15rem 0.2rem" }} colSpan={2}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={table.profit}
                    onChange={(e) => updateTable(which, { profit: e.target.value })}
                    style={{ ...rowInputStyle, textAlign: "right" }}
                  />
                </td>
                <td style={tdStyle} colSpan={2}></td>
              </tr>
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>(GST Excluded) Total</td>
                <td style={tdStyle}></td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, background: "#f9fafb" }} colSpan={2}>
                  {fmtMoneyDisplay(totals.gstExcludedTotal)}
                </td>
                <td style={{ ...tdStyle, background: "#d4d4d4", textAlign: "center", fontWeight: 700 }} colSpan={2}>
                  {letter}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
      style={overlayStyle}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cor-form-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
        {...dialogFocusProps}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 id="cor-form-modal-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {existingDoc ? "Edit Change Order Request" : "New Change Order Request"}
              <DocumentSaveStatusChip saveStatus={saveStatus} lastSavedAt={lastSavedAt} error={autosaveError} />
            </h2>
            {existingDoc && (
              <div style={{ marginTop: "0.35rem" }}>
                <DocumentViewersChip
                  resourceKind="document"
                  resourceId={existingDoc._id}
                  currentUserId={currentUser?._id}
                />
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>Close</button>
        </div>

        {conflictMsg && (
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#b45309" }}>{conflictMsg}</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <div>
            <label style={labelStyle}>COR #</label>
            <input
              type="text"
              {...fieldProps("corNumber")}
              value={form.corNumber}
              onChange={(e) => updateForm({ corNumber: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Job #</label>
            <input
              type="text"
              {...fieldProps("jobNumber")}
              value={form.jobNumber}
              onChange={(e) => updateForm({ jobNumber: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Job Name</label>
            <input
              type="text"
              {...fieldProps("jobName")}
              value={form.jobName}
              onChange={(e) => updateForm({ jobName: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              {...fieldProps("date")}
              value={form.date}
              onChange={(e) => updateForm({ date: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <label style={labelStyle}>Change Directions</label>
            <input
              type="text"
              {...fieldProps("change")}
              value={form.change}
              onChange={(e) => updateForm({ change: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <label style={labelStyle}>Change Notice (EC)</label>
            <input
              type="text"
              {...fieldProps("changeNotice")}
              value={form.changeNotice}
              onChange={(e) => updateForm({ changeNotice: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        {renderTable("tableA", "A", "Pretium Projects Own Work")}
        {renderTable("tableB", "B", "Sub-Contractors Own Work")}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f3f4f6",
            border: "1px solid #e5e7eb",
            borderRadius: "0.4rem",
            padding: "0.5rem 0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>Total GST Excluded (A + B):</span>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{fmtMoneyDisplay(grandTotal)}</span>
        </div>

        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "0.75rem" }}>
          <div style={{ width: "10rem" }}>
            <label style={labelStyle}>Total Days Added to Contract</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.totalDaysAdded}
              onChange={(e) => updateForm({ totalDaysAdded: e.target.value })}
              style={numericInputStyle}
            />
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic", paddingBottom: "0.5rem" }}>
            Quote is valid for 30 days.
          </span>
        </div>

        <CustomFieldsSection
          fields={customFieldDefs}
          values={form.customFields ?? {}}
          onChange={(next: CustomFieldValues) => updateForm({ customFields: next })}
          disabled={busy}
        />

        {error ? (
          <div style={{ color: "#dc2626", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{error}</div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy}
            style={{ ...primaryBtnStyle, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }}
          >
            {busy ? "Generating…" : existingDoc ? "Re-generate PDF" : "Generate PDF"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
