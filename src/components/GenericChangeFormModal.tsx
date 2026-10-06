import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  CHANGE_FORM_TYPE_LABEL,
  validateCustomFields,
  type ChangeFormType,
  type CustomFieldDef,
  type CustomFieldValues,
} from "../lib/changeFormTemplate";
import {
  buildGenericChangeFilename,
  buildGenericChangePdf,
  makeEmptyGenericForm,
  type GenericChangeFormData,
} from "../lib/genericChangePdf";
import { CustomFieldsSection } from "./CustomFieldsSection";
import { useDocumentAutosave } from "../hooks/useDocumentAutosave";
import { useLiveDocumentForm, parseJsonFormData } from "../hooks/useLiveDocumentForm";
import { DocumentSaveStatusChip } from "./DocumentSaveStatusChip";
import { DocumentViewersChip } from "./DocumentViewersChip";

const MODAL_Z_INDEX = 15000;

/** Map from our internal type to the canonical documents.type string used in the docs table. */
const TYPE_TO_DOC_TYPE: Record<Extract<ChangeFormType, "si" | "submittal" | "po">, string> = {
  si: "SI",
  submittal: "SUBMITTAL",
  po: "PO",
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateForPdf(isoDate: string): string {
  if (!isoDate) return "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const monthName = MONTH_SHORT[Number(m[2]) - 1] ?? m[2];
  const day = String(Number(m[3]));
  const year = m[1].slice(2);
  return `${day}-${monthName}-${year}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseExistingForm(
  doc: Doc<"documents"> | null,
  projectName: string,
  projectNumber: string,
): GenericChangeFormData {
  const empty = makeEmptyGenericForm(projectName, projectNumber);
  if (doc?.formData) {
    try {
      const parsed = JSON.parse(doc.formData) as Partial<GenericChangeFormData>;
      return { ...empty, ...parsed };
    } catch {
      // fall through
    }
  }
  empty.date = todayIso();
  return empty;
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
  maxWidth: "48rem",
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

type Props = {
  open: boolean;
  type: Extract<ChangeFormType, "si" | "submittal" | "po">;
  projectId: Id<"projects">;
  projectName: string;
  projectNumber?: string;
  existingDoc: Doc<"documents"> | null;
  onClose: () => void;
  onSaved: () => void;
  /** Used for the empty-state link to the template library. */
  templatesHref?: string;
};

export function GenericChangeFormModal({
  open,
  type,
  projectId,
  projectName,
  projectNumber,
  existingDoc,
  onClose,
  onSaved,
  templatesHref,
}: Props) {
  const [form, setForm] = useState<GenericChangeFormData>(() =>
    parseExistingForm(existingDoc, projectName, projectNumber ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const updateDocument = useMutation(api.documents.updateDocumentRecord);
  const formTemplate = useQuery(
    api.changeFormTemplates.getByType,
    open ? { type } : "skip",
  );
  const currentUser = useQuery(api.users.current);
  const customFieldDefs: CustomFieldDef[] = (formTemplate?.fields ?? []) as CustomFieldDef[];
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const { markFieldDirty, clearDirtyFields, dialogFocusProps, fieldProps } = useLiveDocumentForm<GenericChangeFormData>({
    documentId: existingDoc?._id,
    open,
    enabled: !!existingDoc,
    setForm,
    parseRemoteFormData: parseJsonFormData,
    onConflict: (field) => setConflictMsg(`Another user changed "${field}". Your edit is kept.`),
  });

  useEffect(() => {
    if (open) {
      setForm(parseExistingForm(existingDoc, projectName, projectNumber ?? ""));
      setError(null);
      setConflictMsg(null);
    }
  }, [open, existingDoc, projectName, projectNumber]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const typeLabel = CHANGE_FORM_TYPE_LABEL[type];
  const formDataJson = useMemo(() => JSON.stringify(form), [form]);
  const autosaveDraft = useMemo(
    () => ({
      formData: formDataJson,
      name: form.documentNumber.trim() ? `${typeLabel} ${form.documentNumber.trim()}` : existingDoc?.name,
    }),
    [formDataJson, form.documentNumber, typeLabel, existingDoc?.name],
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

  function updateForm(patch: Partial<GenericChangeFormData>) {
    for (const key of Object.keys(patch)) markFieldDirty(key);
    setForm((f) => ({ ...f, ...patch }));
  }

  function validate(): string | null {
    if (!form.documentNumber.trim()) return `${typeLabel} # is required.`;
    if (!form.date.trim()) return "Date is required.";
    return validateCustomFields(customFieldDefs, form.customFields);
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
      const formForPdf: GenericChangeFormData = {
        ...form,
        date: formatDateForPdf(form.date),
      };
      const pdf = await buildGenericChangePdf(type, formForPdf, customFieldDefs);
      const filename = buildGenericChangeFilename(type, formForPdf);
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
      const docName = `${typeLabel} ${form.documentNumber.trim()}`;
      const formDataJson = JSON.stringify(form);

      if (existingDoc) {
        await updateDocument({
          documentId: existingDoc._id,
          name: docName,
          createdDate: createdMs,
          storageId,
          formData: formDataJson,
        });
      } else {
        await createDocument({
          projectId,
          type: TYPE_TO_DOC_TYPE[type],
          name: docName,
          storageId,
          status: "unpaid",
          createdDate: createdMs,
          formData: formDataJson,
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not generate the ${typeLabel} PDF.`);
    } finally {
      setBusy(false);
    }
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
        aria-labelledby="generic-change-form-title"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
        {...dialogFocusProps}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "0.5rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div>
            <h2
              id="generic-change-form-title"
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {existingDoc ? `Edit ${typeLabel}` : `New ${typeLabel}`}
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
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>
            Close
          </button>
        </div>

        {conflictMsg && (
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#b45309" }}>{conflictMsg}</p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "0.5rem",
            marginBottom: "0.5rem",
          }}
        >
          <div>
            <label style={labelStyle}>Project #</label>
            <input
              type="text"
              {...fieldProps("projectNumber")}
              value={form.projectNumber}
              onChange={(e) => updateForm({ projectNumber: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Project Name</label>
            <input
              type="text"
              {...fieldProps("projectName")}
              value={form.projectName}
              onChange={(e) => updateForm({ projectName: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{typeLabel} #</label>
            <input
              type="text"
              {...fieldProps("documentNumber")}
              value={form.documentNumber}
              onChange={(e) => updateForm({ documentNumber: e.target.value })}
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
        </div>

        {customFieldDefs.length === 0 ? (
          <div
            style={{
              padding: "0.75rem",
              border: "1px dashed #d1d5db",
              borderRadius: "0.5rem",
              backgroundColor: "var(--surface-muted, #f9fafb)",
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              marginTop: "0.5rem",
            }}
          >
            No custom fields configured for {typeLabel}.{" "}
            {templatesHref ? (
              <>
                Use the{" "}
                <Link
                  to={templatesHref}
                  style={{ color: "#047857", fontWeight: 600 }}
                >
                  Template library
                </Link>{" "}
                to add some.
              </>
            ) : (
              "Use the Template library to add some."
            )}
          </div>
        ) : (
          <CustomFieldsSection
            fields={customFieldDefs}
            values={form.customFields ?? {}}
            onChange={(next: CustomFieldValues) => updateForm({ customFields: next })}
            disabled={busy}
            title="Details"
          />
        )}

        {error ? (
          <div
            style={{
              color: "#dc2626",
              fontSize: "0.8rem",
              marginTop: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "0.75rem",
          }}
        >
          <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy}
            style={{
              ...primaryBtnStyle,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Generating…" : existingDoc ? "Re-generate PDF" : "Generate PDF"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
