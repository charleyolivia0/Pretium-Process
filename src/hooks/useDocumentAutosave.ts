import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type DocumentSaveStatus = "idle" | "saving" | "saved" | "error";

type UseDocumentAutosaveArgs = {
  documentId: Id<"documents"> | null | undefined;
  enabled?: boolean;
  debounceMs?: number;
  /** Serialized form payload for change detection. */
  payload: string;
  /** Fields to persist on autosave. */
  draft: {
    formData?: string;
    name?: string;
    description?: string;
    tradeName?: string;
  };
};

export function useDocumentAutosave({
  documentId,
  enabled = true,
  debounceMs = 2000,
  payload,
  draft,
}: UseDocumentAutosaveArgs) {
  const saveDraft = useMutation(api.documentVersions.saveDocumentDraft);
  const [saveStatus, setSaveStatus] = useState<DocumentSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSentRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async () => {
    if (!documentId || !enabled) return;
    if (payload === lastSentRef.current) return;

    setSaveStatus("saving");
    setError(null);
    try {
      await saveDraft({
        documentId,
        ...draft,
      });
      lastSentRef.current = payload;
      setLastSavedAt(Date.now());
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }, [documentId, draft, enabled, payload, saveDraft]);

  useEffect(() => {
    if (!documentId || !enabled) return;
    if (payload === lastSentRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void persist();
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [documentId, enabled, debounceMs, payload, persist]);

  useEffect(() => {
    if (!documentId) {
      lastSentRef.current = "";
      setSaveStatus("idle");
      setLastSavedAt(null);
      setError(null);
    }
  }, [documentId]);

  return { saveStatus, lastSavedAt, error, flush: persist };
}
