import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export type DocumentResourceKind = "document" | "drawing" | "sitePhoto";

type UseDocumentPresenceArgs = {
  resourceKind: DocumentResourceKind;
  resourceId: string | null | undefined;
  enabled?: boolean;
  pageIndex?: number;
  heartbeatMs?: number;
};

export function useDocumentPresence({
  resourceKind,
  resourceId,
  enabled = true,
  pageIndex,
  heartbeatMs = 15_000,
}: UseDocumentPresenceArgs) {
  const touchPresence = useMutation(api.documentPresence.touchPresence);
  const leavePresence = useMutation(api.documentPresence.leavePresence);
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;

  useEffect(() => {
    if (!enabled || !resourceId) return;

    let cancelled = false;

    const touch = () => {
      if (cancelled) return;
      const args: {
        resourceKind: DocumentResourceKind;
        resourceId: string;
        pageIndex?: number;
      } = { resourceKind, resourceId };
      if (pageIndexRef.current !== undefined) {
        args.pageIndex = pageIndexRef.current;
      }
      void touchPresence(args).catch(() => {
        /* ignore transient network errors */
      });
    };

    touch();
    const interval = window.setInterval(touch, heartbeatMs);

    const onLeave = () => {
      void leavePresence({ resourceKind, resourceId }).catch(() => {});
    };
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("pagehide", onLeave);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("pagehide", onLeave);
      onLeave();
    };
  }, [enabled, resourceId, resourceKind, heartbeatMs, touchPresence, leavePresence]);

  // Push page changes without restarting the heartbeat interval.
  useEffect(() => {
    if (!enabled || !resourceId || pageIndex === undefined) return;
    void touchPresence({ resourceKind, resourceId, pageIndex }).catch(() => {});
  }, [enabled, resourceId, resourceKind, pageIndex, touchPresence]);
}
