import { useCallback, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type UseLiveDocumentFormArgs<T extends Record<string, unknown>> = {
  documentId: Id<"documents"> | null | undefined;
  open: boolean;
  enabled?: boolean;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  parseRemoteFormData: (formData: string) => Partial<T> | null;
  onConflict?: (field: string) => void;
};

function fieldValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export function useLiveDocumentForm<T extends Record<string, unknown>>({
  documentId,
  open,
  enabled = true,
  setForm,
  parseRemoteFormData,
  onConflict,
}: UseLiveDocumentFormArgs<T>) {
  const remoteDoc = useQuery(
    api.documents.getDocumentById,
    documentId && open && enabled ? { documentId } : "skip",
  );
  const focusedFieldRef = useRef<string | null>(null);
  const dirtyFieldsRef = useRef<Set<string>>(new Set());
  const lastAppliedRemoteAtRef = useRef(0);
  const parseRemoteFormDataRef = useRef(parseRemoteFormData);
  const onConflictRef = useRef(onConflict);
  parseRemoteFormDataRef.current = parseRemoteFormData;
  onConflictRef.current = onConflict;

  useEffect(() => {
    if (!open || !documentId) {
      dirtyFieldsRef.current.clear();
      focusedFieldRef.current = null;
      lastAppliedRemoteAtRef.current = 0;
    }
  }, [open, documentId]);

  useEffect(() => {
    if (!open || !enabled || !remoteDoc) return;

    const remoteAt = remoteDoc.updatedAt ?? remoteDoc.uploadedAt;
    if (remoteAt <= lastAppliedRemoteAtRef.current) return;
    if (!remoteDoc.formData) return;

    const parsed = parseRemoteFormDataRef.current(remoteDoc.formData);
    if (!parsed) return;

    const conflicts: string[] = [];
    setForm((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [key, value] of Object.entries(parsed)) {
        if (key === focusedFieldRef.current) continue;
        if (dirtyFieldsRef.current.has(key)) {
          if (!fieldValuesEqual(prev[key as keyof T], value)) {
            conflicts.push(key);
          }
          continue;
        }
        if (!fieldValuesEqual(prev[key as keyof T], value)) {
          (next as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    for (const field of conflicts) {
      onConflictRef.current?.(field);
    }
    lastAppliedRemoteAtRef.current = remoteAt;
  }, [remoteDoc, open, enabled, setForm]);

  const markFieldDirty = useCallback((field: string) => {
    dirtyFieldsRef.current.add(field);
  }, []);

  const onFieldFocus = useCallback((field: string) => {
    focusedFieldRef.current = field;
    dirtyFieldsRef.current.add(field);
  }, []);

  const onFieldBlur = useCallback(() => {
    focusedFieldRef.current = null;
  }, []);

  const fieldProps = useCallback(
    (field: string) => ({
      "data-form-field": field,
      onFocus: () => onFieldFocus(field),
      onBlur: onFieldBlur,
    }),
    [onFieldFocus, onFieldBlur],
  );

  const dialogFocusProps = {
    onFocusCapture: (e: React.FocusEvent) => {
      const field = (e.target as HTMLElement).getAttribute("data-form-field");
      if (field) onFieldFocus(field);
    },
  };

  const clearDirtyFields = useCallback(() => {
    dirtyFieldsRef.current.clear();
    if (remoteDoc) {
      lastAppliedRemoteAtRef.current = remoteDoc.updatedAt ?? remoteDoc.uploadedAt;
    }
  }, [remoteDoc]);

  return {
    markFieldDirty,
    onFieldFocus,
    onFieldBlur,
    fieldProps,
    dialogFocusProps,
    clearDirtyFields,
    remoteDoc,
  };
};

/** Stable parser for JSON formData payloads. */
export function parseJsonFormData<T extends Record<string, unknown>>(formData: string): Partial<T> | null {
  try {
    return JSON.parse(formData) as Partial<T>;
  } catch {
    return null;
  }
}
