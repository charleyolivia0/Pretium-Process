import { useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FORM_ATTACHMENT_ACCEPT, type FormAttachment } from "../lib/formAttachments";

type Props = {
  label: string;
  files: FormAttachment[];
  onChange: (next: FormAttachment[]) => void;
  disabled?: boolean;
};

export function FormAttachmentUpload({ label, files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<FormAttachment> {
    const uploadUrl = await generateUploadUrl();
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: file.type ? { "Content-Type": file.type } : {},
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed");
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
    return {
      storageId,
      fileName: file.name,
      mimeType: file.type || "",
    };
  }

  async function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (!picked.length || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: FormAttachment[] = [];
      for (const f of picked) uploaded.push(await uploadOne(f));
      onChange([...files, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function removeAt(idx: number) {
    const next = files.slice();
    next.splice(idx, 1);
    onChange(next);
  }

  return (
    <div style={{ display: "grid", gap: "0.25rem", minWidth: "16rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{label}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111827",
            padding: "0.25rem 0.55rem",
            borderRadius: "0.35rem",
            fontSize: "0.78rem",
            cursor: disabled || busy ? "not-allowed" : "pointer",
            opacity: disabled || busy ? 0.65 : 1,
          }}
        >
          {busy ? "Uploading…" : "+ Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FORM_ATTACHMENT_ACCEPT}
          onChange={onFileInputChange}
          disabled={disabled || busy}
          style={{ display: "none" }}
        />
      </div>

      {files.length ? (
        <div style={{ display: "grid", gap: "0.25rem" }}>
          {files.map((f, i) => (
            <div
              key={`${String(f.storageId)}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "0.35rem",
                padding: "0.25rem 0.4rem",
              }}
            >
              <div
                title={f.fileName}
                style={{ fontSize: "0.78rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {f.fileName}
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled || busy}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#dc2626",
                  cursor: disabled || busy ? "not-allowed" : "pointer",
                  fontSize: "0.85rem",
                  padding: "0 0.25rem",
                }}
                aria-label={`Remove ${f.fileName}`}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <div style={{ color: "#dc2626", fontSize: "0.78rem" }}>{error}</div> : null}
    </div>
  );
}

