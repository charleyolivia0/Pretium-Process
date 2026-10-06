import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  CHANGE_FORM_TYPE_LABEL,
  CUSTOM_FIELD_KIND_LABEL,
  makeFieldId,
  type ChangeFormType,
  type CustomFieldDef,
  type CustomFieldKind,
} from "../lib/changeFormTemplate";

const MODAL_Z_INDEX = 16000;

type Props = {
  open: boolean;
  type: ChangeFormType;
  onClose: () => void;
  /** When true, only preview is available (no save / add field controls). */
  readOnly?: boolean;
  /** Start in preview mode when opening. */
  initialPreview?: boolean;
};

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

const dangerBtnStyle: React.CSSProperties = {
  padding: "0.3rem 0.6rem",
  borderRadius: "0.35rem",
  border: "1px solid #fecaca",
  backgroundColor: "transparent",
  color: "#b91c1c",
  fontFamily: "Montserrat, sans-serif",
  fontSize: "0.75rem",
  cursor: "pointer",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0.5rem 0 0.5rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "var(--text-primary)",
};

const fieldRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto auto",
  gap: "0.5rem",
  alignItems: "end",
  padding: "0.6rem",
  borderRadius: "0.5rem",
  border: "1px solid #e5e7eb",
  backgroundColor: "var(--surface-muted, #f9fafb)",
  marginBottom: "0.5rem",
};

const KIND_OPTIONS: { value: CustomFieldKind; label: string }[] = (
  Object.entries(CUSTOM_FIELD_KIND_LABEL) as [CustomFieldKind, string][]
).map(([value, label]) => ({ value, label }));

export function EditFormTemplateModal({ open, type, onClose, readOnly = false, initialPreview = false }: Props) {
  const remote = useQuery(
    api.changeFormTemplates.getByType,
    open ? { type } : "skip",
  );
  const saveTemplate = useMutation(api.changeFormTemplates.setForType);

  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [optionsDraft, setOptionsDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && remote) {
      setFields(remote.fields ?? []);
      const draft: Record<string, string> = {};
      for (const f of remote.fields ?? []) {
        if (f.kind === "select") {
          draft[f.id] = (f.options ?? []).join("\n");
        }
      }
      setOptionsDraft(draft);
      setError(null);
      setShowPreview(readOnly || initialPreview);
    }
  }, [open, remote, readOnly, initialPreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const typeLabel = CHANGE_FORM_TYPE_LABEL[type];

  const fieldsWithOptionsApplied = useMemo(
    () =>
      fields.map((f) => {
        if (f.kind !== "select") return f;
        const draft = optionsDraft[f.id] ?? "";
        const opts = draft
          .split("\n")
          .map((o) => o.trim())
          .filter((o) => o.length > 0);
        return { ...f, options: opts };
      }),
    [fields, optionsDraft],
  );

  if (!open || typeof document === "undefined") return null;

  function addField() {
    const id = makeFieldId();
    setFields((prev) => [
      ...prev,
      { id, label: "", kind: "text", required: false },
    ]);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setOptionsDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function moveField(id: string, direction: -1 | 1) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function updateField(id: string, patch: Partial<CustomFieldDef>) {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const cleaned: CustomFieldDef[] = fieldsWithOptionsApplied.map((f) => {
        const label = f.label.trim();
        const base: CustomFieldDef = {
          id: f.id,
          label,
          kind: f.kind,
          required: f.required,
        };
        if (f.kind === "select") {
          base.options = f.options ?? [];
        }
        return base;
      });
      for (const f of cleaned) {
        if (!f.label) throw new Error("Every field needs a label.");
        if (f.kind === "select" && (!f.options || f.options.length === 0)) {
          throw new Error(`Dropdown "${f.label}" needs at least one option.`);
        }
      }
      await saveTemplate({ type, fields: cleaned });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save template.");
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
        aria-labelledby="edit-form-template-title"
        onClick={(e) => e.stopPropagation()}
        style={dialogStyle}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "0.5rem",
            gap: "0.5rem",
          }}
        >
          <div>
            <h2
              id="edit-form-template-title"
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {readOnly ? `${typeLabel} pop-up preview` : `Edit ${typeLabel} form template`}
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
              }}
            >
              {readOnly
                ? `How the ${typeLabel} pop-up will look when creating a new item.`
                : `Custom fields configured here appear in the ${typeLabel} pop-up and on the generated PDF.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={secondaryBtnStyle}
          >
            Close
          </button>
        </div>

        {!readOnly ? (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              style={secondaryBtnStyle}
            >
              {showPreview ? "Back to editor" : "Preview"}
            </button>
            <button type="button" onClick={addField} style={primaryBtnStyle}>
              + Add field
            </button>
          </div>
        ) : null}

        {!readOnly && !showPreview ? (
          <div>
            <div style={sectionTitleStyle}>
              Custom fields ({fields.length})
            </div>
            {fields.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  padding: "0.75rem",
                  border: "1px dashed #d1d5db",
                  borderRadius: "0.5rem",
                  backgroundColor: "var(--surface-muted, #f9fafb)",
                }}
              >
                No custom fields yet. Click "Add field" to add one.
              </p>
            ) : null}
            {fields.map((f, idx) => (
              <div key={f.id} style={fieldRowStyle}>
                <div>
                  <label style={labelStyle}>Label</label>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) =>
                      updateField(f.id, { label: e.target.value })
                    }
                    placeholder="e.g. Owner reference #"
                    style={inputStyle}
                  />
                  {f.kind === "select" ? (
                    <div style={{ marginTop: "0.4rem" }}>
                      <label style={labelStyle}>
                        Dropdown options (one per line)
                      </label>
                      <textarea
                        value={optionsDraft[f.id] ?? ""}
                        onChange={(e) =>
                          setOptionsDraft((prev) => ({
                            ...prev,
                            [f.id]: e.target.value,
                          }))
                        }
                        rows={3}
                        placeholder={"Option A\nOption B"}
                        style={{
                          ...inputStyle,
                          resize: "vertical",
                          minHeight: "3rem",
                          fontFamily: "Montserrat, sans-serif",
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select
                    value={f.kind}
                    onChange={(e) =>
                      updateField(f.id, {
                        kind: e.target.value as CustomFieldKind,
                      })
                    }
                    style={inputStyle}
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      marginTop: "0.45rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        updateField(f.id, { required: e.target.checked })
                      }
                    />
                    Required
                  </label>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => moveField(f.id, -1)}
                    disabled={idx === 0}
                    aria-label="Move up"
                    title="Move up"
                    style={{
                      ...secondaryBtnStyle,
                      padding: "0.2rem 0.45rem",
                      opacity: idx === 0 ? 0.5 : 1,
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(f.id, 1)}
                    disabled={idx === fields.length - 1}
                    aria-label="Move down"
                    title="Move down"
                    style={{
                      ...secondaryBtnStyle,
                      padding: "0.2rem 0.45rem",
                      opacity: idx === fields.length - 1 ? 0.5 : 1,
                    }}
                  >
                    ↓
                  </button>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => removeField(f.id)}
                    style={dangerBtnStyle}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {readOnly || showPreview ? (
          <PreviewSection fields={fieldsWithOptionsApplied} type={type} />
        ) : null}

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

        {!readOnly ? (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
              marginTop: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={secondaryBtnStyle}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              style={{
                ...primaryBtnStyle,
                opacity: busy ? 0.7 : 1,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Saving…" : "Save template"}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function PreviewSection({ fields, type }: { fields: CustomFieldDef[]; type: ChangeFormType }) {
  const typeLabel = CHANGE_FORM_TYPE_LABEL[type];
  const hasBuiltIn = type === "rfi" || type === "pcn" || type === "co" || type === "cor";
  return (
    <div
      style={{
        padding: "0.75rem",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
        backgroundColor: "var(--surface-muted, #f9fafb)",
      }}
    >
      {hasBuiltIn ? (
        <p
          style={{
            margin: "0 0 0.75rem 0",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          The standard {typeLabel} pop-up includes built-in fields (project info, dates, line items,
          etc.). Custom fields below are appended at the end of that form and on the PDF.
        </p>
      ) : (
        <p
          style={{
            margin: "0 0 0.75rem 0",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          The {typeLabel} pop-up is built entirely from the custom fields configured here.
        </p>
      )}
      <div style={sectionTitleStyle}>
        {fields.length === 0 ? "No custom fields yet" : `Custom fields (${fields.length})`}
      </div>
      {fields.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            padding: "0.5rem 0",
          }}
        >
          {hasBuiltIn
            ? "The pop-up will still work with its built-in fields only."
            : "Add fields in the editor to define this pop-up."}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.5rem",
          }}
        >
          {fields.map((f) => (
            <div
              key={f.id}
              style={{
                gridColumn: f.kind === "longtext" ? "span 2" : "auto",
              }}
            >
              <label style={labelStyle}>
                {f.label || "(unnamed field)"}
                {f.required ? " *" : ""}
              </label>
              {f.kind === "text" ? (
                <input type="text" disabled style={inputStyle} />
              ) : null}
              {f.kind === "longtext" ? (
                <textarea
                  disabled
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    minHeight: "3.5rem",
                  }}
                />
              ) : null}
              {f.kind === "date" ? (
                <input type="date" disabled style={inputStyle} />
              ) : null}
              {f.kind === "number" ? (
                <input type="number" disabled style={inputStyle} />
              ) : null}
              {f.kind === "select" ? (
                <select disabled style={inputStyle}>
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : null}
              {f.kind === "checkbox" ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-primary)",
                  }}
                >
                  <input type="checkbox" disabled />
                  Yes
                </label>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
