import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  buildCoFilename,
  buildCoPdf,
  computeCoTotals,
  makeEmptyCoForm,
  makeEmptyCoLine,
  type CoFormData,
  type CoLineItem,
} from "../lib/coPdf";
import {
  validateCustomFields,
  type CustomFieldDef,
  type CustomFieldValues,
} from "../lib/changeFormTemplate";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { FormAttachmentUpload } from "./FormAttachmentUpload";
import type { CoFormAttachments, FormAttachment } from "../lib/formAttachments";
import { useDocumentAutosave } from "../hooks/useDocumentAutosave";
import { useLiveDocumentForm, parseJsonFormData } from "../hooks/useLiveDocumentForm";
import { DocumentSaveStatusChip } from "./DocumentSaveStatusChip";
import { projectQueryArgs } from "../lib/projectQueryArgs";
import { DocumentViewersChip } from "./DocumentViewersChip";

const MODAL_Z_INDEX = 15000;

type CoFormModalProps = {
  open: boolean;
  projectId: Id<"projects">;
  projectName: string;
  existingDoc: Doc<"documents"> | null;
  initialForm?: CoFormData | null;
  sourceDocumentId?: Id<"documents"> | null;
  mandatory?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateForPdf(isoDate: string): string {
  if (!isoDate) return "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const monthName = MONTH_SHORT[Number(m[2]) - 1] ?? m[2];
  const day = String(Number(m[3]));
  const year = m[1].slice(2);
  return `${monthName} ${day}/${year}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseExistingForm(
  doc: Doc<"documents"> | null,
  projectName: string,
  defaultProjectNumber?: string,
): CoFormData {
  if (doc?.formData) {
    try {
      const parsed = JSON.parse(doc.formData) as Partial<CoFormData>;
      const base = makeEmptyCoForm();
      const merged: CoFormData = {
        ...base,
        ...parsed,
        rows: normalizeCoRows(parsed.rows),
      };
      const parsedAttachments = parsed.attachments;
      merged.attachments = {
        workSection: parsedAttachments?.workSection ?? base.attachments?.workSection ?? [],
        end: parsedAttachments?.end ?? base.attachments?.end ?? [],
      };
      if (!merged.projectName) merged.projectName = projectName;
      if (!merged.projectNumber?.trim() && defaultProjectNumber?.trim()) {
        merged.projectNumber = defaultProjectNumber.trim();
      }
      return merged;
    } catch {
      // fall through
    }
  }
  const f = makeEmptyCoForm();
  f.projectName = projectName;
  if (defaultProjectNumber?.trim()) f.projectNumber = defaultProjectNumber.trim();
  f.date = todayIso();
  if (doc?.name) f.coNumber = doc.name;
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
  maxWidth: "60rem",
  width: "100%",
  margin: "1rem 0",
  fontFamily: "Montserrat, sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.15rem",
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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "3.5rem",
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

function normalizeCoRows(rows: CoLineItem[] | undefined): CoLineItem[] {
  if (!rows?.length) return [makeEmptyCoLine()];
  return rows.map((r) => ({
    description: r.description ?? "",
    reference: r.reference ?? "",
    internalCharge: r.internalCharge ?? "",
    externalCharge: r.externalCharge ?? (r as { changeAmount?: string }).changeAmount ?? "",
  }));
}

function resolveForm(
  existingDoc: Doc<"documents"> | null,
  projectName: string,
  initialForm?: CoFormData | null,
  defaultProjectNumber?: string,
): CoFormData {
  if (existingDoc) return parseExistingForm(existingDoc, projectName, defaultProjectNumber);
  if (initialForm) {
    const base = makeEmptyCoForm();
    const merged = {
      ...base,
      ...initialForm,
      rows: normalizeCoRows(initialForm.rows),
    };
    if (!merged.projectNumber?.trim() && defaultProjectNumber?.trim()) {
      merged.projectNumber = defaultProjectNumber.trim();
    }
    return merged;
  }
  return parseExistingForm(null, projectName, defaultProjectNumber);
}

export function CoFormModal({
  open,
  projectId,
  projectName,
  existingDoc,
  initialForm,
  sourceDocumentId,
  mandatory = false,
  readOnly = false,
  onClose,
  onSaved,
}: CoFormModalProps) {
  const project = useQuery(api.projects.getProjectById, open ? projectQueryArgs(projectId) : "skip");
  const defaultProjectNumber = project?.accountingJobCode?.trim() ?? "";
  const [form, setForm] = useState<CoFormData>(() =>
    resolveForm(existingDoc, projectName, initialForm, defaultProjectNumber),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convex = useConvex();
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const updateDocument = useMutation(api.documents.updateDocumentRecord);
  const formTemplate = useQuery(api.changeFormTemplates.getByType, { type: "co" });
  const currentUser = useQuery(api.users.current);
  const customFieldDefs: CustomFieldDef[] = (formTemplate?.fields ?? []) as CustomFieldDef[];
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const { markFieldDirty, clearDirtyFields, dialogFocusProps, fieldProps } = useLiveDocumentForm<CoFormData>({
    documentId: existingDoc?._id,
    open,
    enabled: !!existingDoc && !readOnly,
    setForm,
    parseRemoteFormData: parseJsonFormData,
    onConflict: (field) => setConflictMsg(`Another user changed "${field}". Your edit is kept.`),
  });

  useEffect(() => {
    if (open) {
      setForm(resolveForm(existingDoc, projectName, initialForm, defaultProjectNumber));
      setError(null);
      setConflictMsg(null);
    }
  }, [open, existingDoc, projectName, initialForm, defaultProjectNumber]);

  useEffect(() => {
    if (!open || (mandatory && !readOnly)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, mandatory, readOnly]);

  const totals = useMemo(() => computeCoTotals(form), [form]);
  const formDataJson = useMemo(() => JSON.stringify(form), [form]);
  const autosaveDraft = useMemo(
    () => ({
      formData: formDataJson,
      name: form.coNumber.trim() || existingDoc?.name,
      description: form.companyName.trim() || undefined,
      tradeName: form.companyName.trim() || undefined,
    }),
    [formDataJson, form.coNumber, form.companyName, existingDoc?.name],
  );
  const { saveStatus, lastSavedAt, error: autosaveError } = useDocumentAutosave({
    documentId: existingDoc?._id,
    enabled: open && !!existingDoc && !busy && !mandatory && !readOnly,
    payload: formDataJson,
    draft: autosaveDraft,
  });

  const inputsDisabled = busy || readOnly;

  useEffect(() => {
    if (saveStatus === "saved") clearDirtyFields();
  }, [saveStatus, clearDirtyFields]);

  if (!open || typeof document === "undefined") return null;

  function updateForm(patch: Partial<CoFormData>) {
    for (const key of Object.keys(patch)) markFieldDirty(key);
    setForm((f) => ({ ...f, ...patch }));
  }

  function updateRow(index: number, patch: Partial<CoLineItem>) {
    markFieldDirty("rows");
    setForm((f) => {
      const rows = f.rows.slice();
      rows[index] = { ...rows[index], ...patch };
      return { ...f, rows };
    });
  }

  function addRow() {
    markFieldDirty("rows");
    setForm((f) => ({ ...f, rows: [...f.rows, makeEmptyCoLine()] }));
  }

  function removeRow(index: number) {
    markFieldDirty("rows");
    setForm((f) => {
      const rows = f.rows.slice();
      rows.splice(index, 1);
      if (rows.length === 0) rows.push(makeEmptyCoLine());
      return { ...f, rows };
    });
  }

  function validate(): string | null {
    if (!form.date.trim()) return "Date is required.";
    if (!form.coNumber.trim()) return "C.O. # is required.";
    if (!form.projectNumber.trim()) return "Project # is required.";
    if (!form.companyName.trim()) return "Company Name is required.";
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
      const formForPdf: CoFormData = { ...form, date: formatDateForPdf(form.date) };
      const att = formForPdf.attachments;
      const ids: Id<"_storage">[] = [
        ...(att?.workSection?.map((a) => a.storageId) ?? []),
        ...(att?.end?.map((a) => a.storageId) ?? []),
      ];
      const urls = ids.length ? await convex.query(api.documents.getStorageUrlsForIds, { storageIds: ids }) : [];
      const idToUrl = new Map<string, string>();
      for (let i = 0; i < ids.length; i++) {
        const url = urls[i];
        if (url) idToUrl.set(String(ids[i]), url);
      }
      const fetchBytes = ids.length
        ? async (id: Id<"_storage">) => {
            const url = idToUrl.get(String(id));
            if (!url) throw new Error("Could not resolve file URL");
            const res = await fetch(url);
            if (!res.ok) throw new Error("Could not fetch attachment");
            return await res.arrayBuffer();
          }
        : undefined;

      const pdf = await buildCoPdf(formForPdf, customFieldDefs, fetchBytes);
      const filename = buildCoFilename(formForPdf);
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
      const docName = form.coNumber.trim();
      const docDescription = form.companyName.trim() || undefined;
      const formDataJson = JSON.stringify(form);

      if (existingDoc) {
        await updateDocument({
          documentId: existingDoc._id,
          name: docName,
          createdDate: createdMs,
          description: docDescription,
          tradeName: form.companyName.trim() || "",
          storageId,
          formData: formDataJson,
        });
      } else {
        await createDocument({
          projectId,
          type: "CO",
          name: docName,
          storageId,
          status: "unpaid",
          createdDate: createdMs,
          description: docDescription,
          tradeName: form.companyName.trim() || undefined,
          formData: formDataJson,
          ...(sourceDocumentId ? { sourceDocumentId } : {}),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the CO PDF.");
    } finally {
      setBusy(false);
    }
  }

  const modalTitle = readOnly
    ? "View change order"
    : mandatory
      ? existingDoc
        ? "Update Change Order from approved PCN/COR"
        : "Create Change Order from approved PCN/COR"
      : existingDoc
        ? "Edit Subcontract Change Order"
        : "New Subcontract Change Order";

  return createPortal(
    <div
      role="presentation"
      onClick={(e) => {
        if (busy || (mandatory && !readOnly)) return;
        if (e.target === e.currentTarget) onClose();
      }}
      style={overlayStyle}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="co-form-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
        {...dialogFocusProps}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 id="co-form-modal-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {modalTitle}
              {!readOnly ? (
                <DocumentSaveStatusChip saveStatus={saveStatus} lastSavedAt={lastSavedAt} error={autosaveError} />
              ) : null}
            </h2>
            {existingDoc && !readOnly ? (
              <div style={{ marginTop: "0.35rem" }}>
                <DocumentViewersChip
                  resourceKind="document"
                  resourceId={existingDoc._id}
                  currentUserId={currentUser?._id}
                />
              </div>
            ) : null}
          </div>
          {!mandatory || readOnly ? (
            <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>Close</button>
          ) : null}
        </div>

        {conflictMsg && (
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#b45309" }}>{conflictMsg}</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" {...fieldProps("date")} value={form.date} onChange={(e) => updateForm({ date: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div>
            <label style={labelStyle}>Subcontract #</label>
            <input type="text" {...fieldProps("subcontractNumber")} value={form.subcontractNumber} onChange={(e) => updateForm({ subcontractNumber: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div>
            <label style={labelStyle}>C.O. #</label>
            <input type="text" {...fieldProps("coNumber")} value={form.coNumber} onChange={(e) => updateForm({ coNumber: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div>
            <label style={labelStyle}>Project #</label>
            <input type="text" {...fieldProps("projectNumber")} value={form.projectNumber} onChange={(e) => updateForm({ projectNumber: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <label style={labelStyle}>Project Name</label>
            <input type="text" {...fieldProps("projectName")} value={form.projectName} onChange={(e) => updateForm({ projectName: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Company Name</label>
            <input type="text" {...fieldProps("companyName")} value={form.companyName} onChange={(e) => updateForm({ companyName: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Address</label>
            <textarea {...fieldProps("address")} value={form.address} onChange={(e) => updateForm({ address: e.target.value })} style={textareaStyle} rows={2} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.25rem 0 0.4rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>Description of Work</span>
            {!readOnly ? (
              <FormAttachmentUpload
                label="Attach files (work)"
                files={(form.attachments?.workSection ?? []) as FormAttachment[]}
                disabled={busy}
                onChange={(next) =>
                  updateForm({
                    attachments: {
                      workSection: next,
                      end: form.attachments?.end ?? [],
                    },
                  })
                }
              />
            ) : null}
            {!readOnly ? (
              <button type="button" style={ghostBtnStyle} onClick={addRow} disabled={busy}>+ Add row</button>
            ) : null}
          </div>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "40%" }}>Description</th>
                <th style={{ ...thStyle, width: "22%" }}>Reference</th>
                <th style={{ ...thStyle, width: "17%" }}>Internal Charge</th>
                <th style={{ ...thStyle, width: "17%" }}>External Charge</th>
                {!readOnly ? (
                  <th style={{ ...thStyle, width: "4%" }} aria-label="Remove row"></th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {form.rows.map((row, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <input type="text" value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} style={rowInputStyle} readOnly={readOnly} disabled={inputsDisabled} />
                  </td>
                  <td style={tdStyle}>
                    <input type="text" value={row.reference} onChange={(e) => updateRow(i, { reference: e.target.value })} style={rowInputStyle} readOnly={readOnly} disabled={inputsDisabled} />
                  </td>
                  <td style={tdStyle}>
                    <input type="text" inputMode="decimal" value={row.internalCharge} onChange={(e) => updateRow(i, { internalCharge: e.target.value })} style={{ ...rowInputStyle, textAlign: "right" }} readOnly={readOnly} disabled={inputsDisabled} />
                  </td>
                  <td style={tdStyle}>
                    <input type="text" inputMode="decimal" value={row.externalCharge} onChange={(e) => updateRow(i, { externalCharge: e.target.value })} style={{ ...rowInputStyle, textAlign: "right" }} readOnly={readOnly} disabled={inputsDisabled} />
                  </td>
                  {!readOnly ? (
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={busy}
                        title="Remove row"
                        aria-label="Remove row"
                        style={{ border: "none", background: "transparent", color: "#dc2626", fontSize: "0.9rem", cursor: "pointer", padding: "0 0.2rem" }}
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={labelStyle}>CCN #</label>
            <input type="text" value={form.ccnNumber} onChange={(e) => updateForm({ ccnNumber: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div>
            <label style={labelStyle}>Approval #</label>
            <input type="text" value={form.approvalNumber} onChange={(e) => updateForm({ approvalNumber: e.target.value })} style={inputStyle} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div>
            <label style={labelStyle}>Original Contract Amt ($)</label>
            <input type="text" inputMode="decimal" value={form.originalContract} onChange={(e) => updateForm({ originalContract: e.target.value })} style={{ ...inputStyle, textAlign: "right" }} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
          <div>
            <label style={labelStyle}>Previous Change Amount ($)</label>
            <input type="text" inputMode="decimal" value={form.previousChange} onChange={(e) => updateForm({ previousChange: e.target.value })} style={{ ...inputStyle, textAlign: "right" }} readOnly={readOnly} disabled={inputsDisabled} />
          </div>
        </div>

        <div style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "0.4rem", padding: "0.6rem 0.85rem", marginBottom: "0.75rem", display: "grid", gap: "0.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Internal Total:</span>
            <span>{fmtMoneyDisplay(totals.totalInternal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Total this C.O.:</span>
            <span style={{ fontWeight: 700 }}>{fmtMoneyDisplay(totals.totalThisCo)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Original Contract Amt:</span>
            <span>{fmtMoneyDisplay(totals.originalContract)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span>Previous Change Amount:</span>
            <span>{fmtMoneyDisplay(totals.previousChange)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem", fontWeight: 700, borderTop: "1px solid #d1d5db", paddingTop: "0.25rem", marginTop: "0.15rem" }}>
            <span>Revised Amount:</span>
            <span>{fmtMoneyDisplay(totals.revisedAmount)}</span>
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>Attachments</div>
            {!readOnly ? (
              <FormAttachmentUpload
                label="Attach files (end)"
                files={form.attachments?.end ?? []}
                disabled={busy}
                onChange={(next) =>
                  updateForm({
                    attachments: {
                      workSection: form.attachments?.workSection ?? [],
                      end: next,
                    },
                  })
                }
              />
            ) : null}
          </div>
        </div>

        <CustomFieldsSection
          fields={customFieldDefs}
          values={form.customFields ?? {}}
          onChange={(next: CustomFieldValues) => updateForm({ customFields: next })}
          disabled={inputsDisabled}
        />

        {error ? (
          <div style={{ color: "#dc2626", fontSize: "0.8rem", marginBottom: "0.5rem" }}>{error}</div>
        ) : null}

        {!readOnly ? (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            {!mandatory ? (
              <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy}
              style={{ ...primaryBtnStyle, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer" }}
            >
              {busy ? "Generating…" : existingDoc ? "Re-generate PDF" : "Generate PDF"}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
