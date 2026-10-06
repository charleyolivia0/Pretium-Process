import { useEffect, useState } from "react";
import { getDayKeyCentral } from "../lib/centralTime";

/** CT calendar day key; refreshes every minute so attendance rolls over at midnight CT. */
export function useCentralDayKey() {
  const [dayKey, setDayKey] = useState(() => getDayKeyCentral(Date.now()));

  useEffect(() => {
    const tick = () => setDayKey(getDayKeyCentral(Date.now()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return dayKey;
}
