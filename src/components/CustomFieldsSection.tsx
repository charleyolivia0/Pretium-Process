import type { CustomFieldDef, CustomFieldValues } from "../lib/changeFormTemplate";

type Props = {
  fields: CustomFieldDef[];
  values: CustomFieldValues;
  onChange: (next: CustomFieldValues) => void;
  title?: string;
  disabled?: boolean;
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

const sectionTitleStyle: React.CSSProperties = {
  margin: "0.85rem 0 0.4rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  color: "var(--text-primary)",
};

/**
 * Renders the dynamic custom-fields portion of a change-creation pop-up,
 * driven by the per-type schema configured in the Template library.
 */
export function CustomFieldsSection({
  fields,
  values,
  onChange,
  title = "Additional fields",
  disabled = false,
}: Props) {
  if (!fields || fields.length === 0) return null;

  function setField(id: string, value: string | number | boolean) {
    onChange({ ...values, [id]: value });
  }

  return (
    <div>
      <div style={sectionTitleStyle}>{title}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "0.5rem",
          marginBottom: "0.5rem",
        }}
      >
        {fields.map((f) => {
          const value = values[f.id];
          const isLong = f.kind === "longtext";
          return (
            <div
              key={f.id}
              style={{ gridColumn: isLong ? "span 2" : "auto" }}
            >
              <label style={labelStyle}>
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.kind === "text" ? (
                <input
                  type="text"
                  value={typeof value === "string" ? value : value == null ? "" : String(value)}
                  onChange={(e) => setField(f.id, e.target.value)}
                  disabled={disabled}
                  style={inputStyle}
                />
              ) : null}
              {f.kind === "longtext" ? (
                <textarea
                  value={typeof value === "string" ? value : value == null ? "" : String(value)}
                  onChange={(e) => setField(f.id, e.target.value)}
                  rows={3}
                  disabled={disabled}
                  style={textareaStyle}
                />
              ) : null}
              {f.kind === "date" ? (
                <input
                  type="date"
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => setField(f.id, e.target.value)}
                  disabled={disabled}
                  style={inputStyle}
                />
              ) : null}
              {f.kind === "number" ? (
                <input
                  type="number"
                  value={
                    typeof value === "number"
                      ? String(value)
                      : typeof value === "string"
                        ? value
                        : ""
                  }
                  onChange={(e) => setField(f.id, e.target.value)}
                  disabled={disabled}
                  style={inputStyle}
                />
              ) : null}
              {f.kind === "select" ? (
                <select
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => setField(f.id, e.target.value)}
                  disabled={disabled}
                  style={inputStyle}
                >
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
                    padding: "0.35rem 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => setField(f.id, e.target.checked)}
                    disabled={disabled}
                  />
                  Yes
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
