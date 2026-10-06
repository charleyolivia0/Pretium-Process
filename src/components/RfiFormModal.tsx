import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  buildRfiFilename,
  buildRfiPdf,
  makeEmptyRfiForm,
  type RfiFormData,
  type RfiProceedVia,
} from "../lib/rfiPdf";
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

type RfiFormModalProps = {
  open: boolean;
  projectId: Id<"projects">;
  projectName: string;
  projectNumber?: string;
  existingDoc: Doc<"documents"> | null;
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
  return `${day}-${monthName}-${year}`;
}

function formatLongDate(isoDate: string): string {
  if (!isoDate) return "";
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = monthNames[Number(m[2]) - 1] ?? m[2];
  const day = Number(m[3]);
  const suffix = (() => {
    if (day >= 11 && day <= 13) return "th";
    const last = day % 10;
    return last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  })();
  return `${monthName} ${day}${suffix} ${m[1]}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseExistingForm(
  doc: Doc<"documents"> | null,
  projectName: string,
  projectNumber: string,
): RfiFormData {
  if (doc?.formData) {
    try {
      const parsed = JSON.parse(doc.formData) as Partial<RfiFormData>;
      const merged: RfiFormData = { ...makeEmptyRfiForm(), ...parsed };
      if (!merged.projectName) merged.projectName = projectName;
      if (!merged.projectNumber) merged.projectNumber = projectNumber;
      return merged;
    } catch {
      // fall through
    }
  }
  const f = makeEmptyRfiForm();
  f.projectName = projectName;
  f.projectNumber = projectNumber;
  f.date = todayIso();
  if (doc?.name) f.subject = doc.name;
  if (doc?.description) f.description = doc.description;
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
  maxWidth: "56rem",
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

const sectionTitleStyle: React.CSSProperties = {
  margin: "0.85rem 0 0.4rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const proceedOptions: { id: RfiProceedVia; label: string }[] = [
  { id: "change_order", label: "Change Order" },
  { id: "change_directive", label: "Change Directive" },
  { id: "pcn", label: "PCN" },
  { id: "si", label: "SI" },
];

export function RfiFormModal({
  open,
  projectId,
  projectName,
  projectNumber,
  existingDoc,
  onClose,
  onSaved,
}: RfiFormModalProps) {
  const [form, setForm] = useState<RfiFormData>(() =>
    parseExistingForm(existingDoc, projectName, projectNumber ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.createDocumentRecord);
  const updateDocument = useMutation(api.documents.updateDocumentRecord);
  const formTemplate = useQuery(api.changeFormTemplates.getByType, { type: "rfi" });
  const currentUser = useQuery(api.users.current);
  const customFieldDefs: CustomFieldDef[] = (formTemplate?.fields ?? []) as CustomFieldDef[];
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const { markFieldDirty, clearDirtyFields, dialogFocusProps, fieldProps } = useLiveDocumentForm<RfiFormData>({
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
      setSignaturePadOpen(false);
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

  useEffect(() => {
    if (!signaturePadOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (form.signatureDrawnDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = form.signatureDrawnDataUrl;
    }
  }, [signaturePadOpen, form.signatureDrawnDataUrl]);

  const formDataJson = useMemo(() => JSON.stringify(form), [form]);
  const autosaveDraft = useMemo(
    () => ({
      formData: formDataJson,
      name:
        form.rfiNumber.trim() && form.subject.trim()
          ? `RFI ${form.rfiNumber.trim()} - ${form.subject.trim()}`
          : existingDoc?.name,
      description: form.subject.trim() || undefined,
    }),
    [formDataJson, form.rfiNumber, form.subject, existingDoc?.name],
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

  function updateForm(patch: Partial<RfiFormData>) {
    for (const key of Object.keys(patch)) markFieldDirty(key);
    setForm((f) => ({ ...f, ...patch }));
  }

  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = getCanvasPoint(e);
    if (!p) return;
    isDrawing.current = true;
    lastPoint.current = p;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const p = getCanvasPoint(e);
    if (!canvas || !ctx || !p || !lastPoint.current) return;
    ctx.strokeStyle = "#c82026";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
  }

  function handlePointerUp() {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    updateForm({ signatureDrawnDataUrl: dataUrl });
  }

  function clearSignaturePad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateForm({ signatureDrawnDataUrl: "" });
  }

  function validate(): string | null {
    if (!form.rfiNumber.trim()) return "RFI # is required.";
    if (!form.subject.trim()) return "Subject is required.";
    if (!form.date.trim()) return "Date is required.";
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
      const formForPdf: RfiFormData = {
        ...form,
        date: formatDateForPdf(form.date),
        responseRequiredBy: formatDateForPdf(form.responseRequiredBy),
        signatureDate: form.signatureDate ? formatLongDate(form.signatureDate) : "",
      };
      const pdf = await buildRfiPdf(formForPdf, customFieldDefs);
      const filename = buildRfiFilename(formForPdf);
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
      const dueMs = isoToMs(form.responseRequiredBy);
      const docName = `RFI ${form.rfiNumber.trim()} - ${form.subject.trim()}`;
      const docDescription = form.description.trim() || undefined;
      const formDataJson = JSON.stringify(form);
      const hasResponse = form.responseDetails.trim().length > 0;
      const workflowStatus = hasResponse ? "closed" : "open";

      if (existingDoc) {
        await updateDocument({
          documentId: existingDoc._id,
          name: docName,
          createdDate: createdMs,
          description: docDescription,
          storageId,
          formData: formDataJson,
          workflowStatus,
          ...(dueMs !== undefined ? { workflowDueDate: dueMs } : {}),
        });
      } else {
        await createDocument({
          projectId,
          type: "RFI",
          name: docName,
          storageId,
          status: hasResponse ? "paid" : "unpaid",
          createdDate: createdMs,
          description: docDescription,
          formData: formDataJson,
          workflowStatus,
          ...(dueMs !== undefined ? { workflowDueDate: dueMs } : {}),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the RFI PDF.");
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
        aria-labelledby="rfi-form-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
        {...dialogFocusProps}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h2 id="rfi-form-modal-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {existingDoc ? "Edit Request for Information" : "New Request for Information"}
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

        <div style={sectionTitleStyle}>Project</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <div>
            <label style={labelStyle}>Project #</label>
            <input type="text" {...fieldProps("projectNumber")} value={form.projectNumber} onChange={(e) => updateForm({ projectNumber: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Project Name</label>
            <input type="text" {...fieldProps("projectName")} value={form.projectName} onChange={(e) => updateForm({ projectName: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>RFI #</label>
            <input type="text" {...fieldProps("rfiNumber")} value={form.rfiNumber} onChange={(e) => updateForm({ rfiNumber: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div style={sectionTitleStyle}>Request for Information</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" {...fieldProps("date")} value={form.date} onChange={(e) => updateForm({ date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Response required by</label>
            <input type="date" {...fieldProps("responseRequiredBy")} value={form.responseRequiredBy} onChange={(e) => updateForm({ responseRequiredBy: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input type="text" {...fieldProps("to")} value={form.to} onChange={(e) => updateForm({ to: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Attention</label>
            <input type="text" {...fieldProps("attention")} value={form.attention} onChange={(e) => updateForm({ attention: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>CC</label>
            <input type="text" {...fieldProps("cc")} value={form.cc} onChange={(e) => updateForm({ cc: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Subject</label>
            <input type="text" {...fieldProps("subject")} value={form.subject} onChange={(e) => updateForm({ subject: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Description</label>
            <textarea {...fieldProps("description")} value={form.description} onChange={(e) => updateForm({ description: e.target.value })} style={{ ...textareaStyle, minHeight: "5rem" }} rows={4} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label style={labelStyle}>Proposed Solution</label>
            <textarea {...fieldProps("proposedSolution")} value={form.proposedSolution} onChange={(e) => updateForm({ proposedSolution: e.target.value })} style={textareaStyle} rows={3} />
          </div>
          <div>
            <label style={labelStyle}>Change to Contract</label>
            <select
              {...fieldProps("changeToContract")}
              value={form.changeToContract}
              onChange={(e) => updateForm({ changeToContract: e.target.value as RfiFormData["changeToContract"] })}
              style={inputStyle}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <div style={sectionTitleStyle}>Response</div>
        <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <div>
            <label style={labelStyle}>Response Details</label>
            <textarea
              {...fieldProps("responseDetails")}
              value={form.responseDetails}
              onChange={(e) => updateForm({ responseDetails: e.target.value })}
              style={{ ...textareaStyle, minHeight: "5rem" }}
              rows={4}
            />
          </div>
          <div>
            <label style={labelStyle}>Proceed via</label>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", padding: "0.25rem 0" }}>
              {proceedOptions.map((opt) => (
                <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="rfi-proceed-via"
                    value={opt.id}
                    checked={form.proceedVia === opt.id}
                    onChange={() => updateForm({ proceedVia: opt.id })}
                  />
                  {opt.label}
                </label>
              ))}
              {form.proceedVia ? (
                <button
                  type="button"
                  onClick={() => updateForm({ proceedVia: "" })}
                  style={{ ...secondaryBtnStyle, padding: "0.15rem 0.5rem", fontSize: "0.72rem" }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
            <div>
              <label style={labelStyle}>Signature Date</label>
              <input type="date" {...fieldProps("signatureDate")} value={form.signatureDate} onChange={(e) => updateForm({ signatureDate: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" {...fieldProps("signatureName")} value={form.signatureName} onChange={(e) => updateForm({ signatureName: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Signature</label>
            {form.signatureName.trim() && !form.signatureDrawnDataUrl ? (
              <div
                style={{
                  border: "1px dashed #d1d5db",
                  borderRadius: "0.35rem",
                  padding: "0.5rem 0.75rem",
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "3rem",
                }}
              >
                <span style={{ fontFamily: "'Brush Script MT', 'Snell Roundhand', cursive", fontSize: "1.75rem", color: "#c82026" }}>
                  {form.signatureName}
                </span>
              </div>
            ) : null}

            {form.signatureDrawnDataUrl ? (
              <div
                style={{
                  border: "1px dashed #d1d5db",
                  borderRadius: "0.35rem",
                  padding: "0.25rem",
                  background: "#fff",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <img
                  src={form.signatureDrawnDataUrl}
                  alt="Drawn signature"
                  style={{ maxHeight: "5rem", maxWidth: "100%" }}
                />
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSignaturePadOpen((v) => !v)}
                style={{ ...secondaryBtnStyle, fontSize: "0.75rem", padding: "0.3rem 0.7rem" }}
              >
                {signaturePadOpen ? "Hide signature pad" : form.signatureDrawnDataUrl ? "Edit drawn signature" : "Draw signature"}
              </button>
              {form.signatureDrawnDataUrl ? (
                <button
                  type="button"
                  onClick={() => updateForm({ signatureDrawnDataUrl: "" })}
                  style={{ ...secondaryBtnStyle, fontSize: "0.75rem", padding: "0.3rem 0.7rem" }}
                >
                  Use typed name instead
                </button>
              ) : null}
            </div>

            {signaturePadOpen ? (
              <div style={{ marginTop: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.4rem", padding: "0.5rem", background: "#fff" }}>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={140}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  style={{
                    width: "100%",
                    height: "9rem",
                    touchAction: "none",
                    background: "#fff",
                    border: "1px dashed #d1d5db",
                    borderRadius: "0.35rem",
                    cursor: "crosshair",
                    display: "block",
                  }}
                />
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                  <button
                    type="button"
                    onClick={clearSignaturePad}
                    style={{ ...secondaryBtnStyle, fontSize: "0.75rem", padding: "0.3rem 0.7rem" }}
                  >
                    Clear
                  </button>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", alignSelf: "center" }}>
                    Draw with mouse or finger. The drawn signature overrides the typed name on the PDF.
                  </span>
                </div>
              </div>
            ) : null}
          </div>
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
