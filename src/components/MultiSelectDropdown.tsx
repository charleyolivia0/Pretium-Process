import { useEffect, useMemo, useRef, useState } from "react";

type MultiSelectOption<T extends string> = {
  id: T;
  label: string;
};

type MultiSelectDropdownProps<T extends string> = {
  options: MultiSelectOption<T>[];
  selectedIds: T[];
  onChange: (next: T[]) => void;
  placeholder: string;
  emptyMessage: string;
  disabled?: boolean;
};

export function MultiSelectDropdown<T extends string>({
  options,
  selectedIds,
  onChange,
  placeholder,
  emptyMessage,
  disabled = false,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const labelById = useMemo(() => {
    const map = new Map<T, string>();
    for (const option of options) map.set(option.id, option.label);
    return map;
  }, [options]);

  const triggerText = useMemo(() => {
    if (selectedIds.length === 0) return placeholder;
    if (selectedIds.length === 1) return labelById.get(selectedIds[0]) ?? "1 selected";
    const firstLabel = labelById.get(selectedIds[0]) ?? "Selected";
    return `${firstLabel} +${selectedIds.length - 1} more`;
  }, [selectedIds, placeholder, labelById]);

  const toggleOption = (id: T) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          textAlign: "left",
          border: "1px solid #e5e7eb",
          borderRadius: "0.375rem",
          padding: "0.5rem 0.6rem",
          background: disabled ? "#f9fafb" : "var(--surface-panel)",
          color: selectedIds.length > 0 ? "var(--text-primary)" : "#6b7280",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "Montserrat, sans-serif",
          fontSize: "0.85rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerText}</span>
        <span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 0.3rem)",
            left: 0,
            right: 0,
            maxHeight: "12rem",
            overflowY: "auto",
            border: "1px solid #e5e7eb",
            borderRadius: "0.375rem",
            background: "var(--surface-panel)",
            boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
            padding: "0.3rem",
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "0.35rem 0.45rem", color: "#6b7280", fontSize: "0.8rem" }}>{emptyMessage}</div>
          ) : (
            options.map((option) => {
              const checked = selectedIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.35rem 0.45rem",
                    borderRadius: "0.35rem",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--text-primary)",
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleOption(option.id)} />
                  {option.label}
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
