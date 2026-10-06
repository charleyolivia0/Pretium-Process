import { useCallback, useEffect, useRef, useState } from "react";
import { recordFromPayload, type InkPath } from "./types";

type MarkupRow = {
  payload?: { pages: { pageIndex: number; paths: InkPath[] }[] };
  updatedAt?: number;
  updatedByName?: string;
} | null;

type PendingRemote = {
  paths: Record<number, InkPath[]>;
  authorName: string;
  remoteAt: number;
};

export function useLiveMarkupSync(
  markup: MarkupRow | undefined,
  resourceId: string | undefined,
) {
  const [pagePaths, setPagePaths] = useState<Record<number, InkPath[]>>({});
  const [localDirty, setLocalDirty] = useState(false);
  const [pendingRemote, setPendingRemote] = useState<PendingRemote | null>(null);
  const lastAppliedRemoteAtRef = useRef(0);
  const dismissedRemoteAtRef = useRef(0);

  useEffect(() => {
    lastAppliedRemoteAtRef.current = 0;
    dismissedRemoteAtRef.current = 0;
    setLocalDirty(false);
    setPendingRemote(null);
    setPagePaths({});
  }, [resourceId]);

  useEffect(() => {
    if (markup === undefined) return;

    const remoteAt = markup?.updatedAt ?? 0;
    if (remoteAt <= lastAppliedRemoteAtRef.current) return;
    if (remoteAt <= dismissedRemoteAtRef.current) return;

    const paths = markup?.payload ? recordFromPayload(markup.payload.pages) : {};
    const authorName = markup?.updatedByName ?? "Another user";

    if (!localDirty) {
      setPagePaths(paths);
      lastAppliedRemoteAtRef.current = remoteAt;
      setPendingRemote(null);
    } else {
      setPendingRemote({ paths, authorName, remoteAt });
    }
  }, [markup, localDirty]);

  const markLocalEdit = useCallback(() => {
    setLocalDirty(true);
  }, []);

  const onPersistSuccess = useCallback((savedAt?: number) => {
    const ts = savedAt ?? Date.now();
    setLocalDirty(false);
    lastAppliedRemoteAtRef.current = Math.max(lastAppliedRemoteAtRef.current, ts);
    setPendingRemote((prev) => {
      if (!prev) return null;
      return prev.remoteAt > ts ? prev : null;
    });
  }, []);

  const applyPendingRemote = useCallback(() => {
    if (!pendingRemote) return;
    setPagePaths(pendingRemote.paths);
    lastAppliedRemoteAtRef.current = pendingRemote.remoteAt;
    dismissedRemoteAtRef.current = 0;
    setLocalDirty(false);
    setPendingRemote(null);
  }, [pendingRemote]);

  const dismissPendingRemote = useCallback(() => {
    if (pendingRemote) {
      dismissedRemoteAtRef.current = pendingRemote.remoteAt;
    }
    setPendingRemote(null);
  }, [pendingRemote]);

  return {
    pagePaths,
    setPagePaths,
    markLocalEdit,
    onPersistSuccess,
    pendingRemote,
    applyPendingRemote,
    dismissPendingRemote,
  };
};
