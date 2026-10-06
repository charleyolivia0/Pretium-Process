import { useCallback, useEffect, useState } from "react";

function getOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Tracks browser/Electron online/offline state.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(getOnline);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(getOnline());
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

export function useIsOffline(): boolean {
  const online = useOnline();
  return !online;
}

export function useOnlineCallback(callback: () => void) {
  const online = useOnline();
  const cb = useCallback(() => {
    callback();
  }, [callback]);

  useEffect(() => {
    if (!online) return;
    cb();
  }, [online, cb]);
}
