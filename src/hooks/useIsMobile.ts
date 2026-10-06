import { useEffect, useState } from "react";

export function useIsMobile(maxWidth: number = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);

    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    // Initial sync and listener
    handleChange(query);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handleChange);
      return () => query.removeEventListener("change", handleChange);
    } else {
      // Safari < 14 fallback
      // @ts-ignore
      query.addListener(handleChange);
      // @ts-ignore
      return () => query.removeListener(handleChange);
    }
  }, [maxWidth]);

  return isMobile;
}

