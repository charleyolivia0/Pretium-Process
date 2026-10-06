import { useEffect, useMemo, useRef, useState } from "react";

type SearchableSelectOption<T extends string> = {
  id: T;
  label: string;
};

type SearchableSelectProps<T extends string> = {
  options: SearchableSelectOption<T>[];
  value: T | "";
  onChange: (id: T) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  noResultsMessage: string;
  disabled?: boolean;
};

export function SearchableSelect<T extends string>({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  noResultsMessage,
  disabled = false,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    searchInputRef.current?.focus();
  }, [open]);

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

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const triggerText = value ? (labelById.get(value) ?? placeholder) : placeholder;

  const selectOption = (id: T) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: "0.75rem" }}>
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
          color: value ? "var(--text-primary)" : "#6b7280",
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
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 0.3rem)",
            left: 0,
            right: 0,
            border: "1px solid #e5e7eb",
            borderRadius: "0.375rem",
            background: "var(--surface-panel)",
            boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "0.3rem", borderBottom: "1px solid #e5e7eb" }}>
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              onKeyDown={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                border: "1px solid #e5e7eb",
                borderRadius: "0.35rem",
                padding: "0.4rem 0.5rem",
                fontFamily: "Montserrat, sans-serif",
                fontSize: "0.85rem",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div role="listbox" style={{ maxHeight: "12rem", overflowY: "auto", padding: "0.3rem" }}>
            {options.length === 0 ? (
              <div style={{ padding: "0.35rem 0.45rem", color: "#6b7280", fontSize: "0.8rem" }}>{emptyMessage}</div>
            ) : filteredOptions.length === 0 ? (
              <div style={{ padding: "0.35rem 0.45rem", color: "#6b7280", fontSize: "0.8rem" }}>{noResultsMessage}</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={value === option.id}
                  onClick={() => selectOption(option.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: value === option.id ? "#ecfdf5" : "transparent",
                    padding: "0.35rem 0.45rem",
                    borderRadius: "0.35rem",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--text-primary)",
                    fontFamily: "Montserrat, sans-serif",
                  }}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}