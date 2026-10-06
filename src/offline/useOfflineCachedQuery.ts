import { useEffect, useMemo, useState } from "react";
import { useQuery, type OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionReference } from "convex/server";
import { getCachedQuery, makeCacheKey, setCachedQuery } from "./offlineCache";
import { useOnline } from "./useOffline";

/**
 * Like `useQuery`, but when offline skips the network and returns last cached value from IndexedDB.
 * When online, persists successful results for later offline use.
 */
export function useOfflineCachedQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: OptionalRestArgsOrSkip<Query>[0],
  queryName: string,
): Query["_returnType"] | undefined {
  const online = useOnline();
  const shouldFetch = online && args !== "skip";
  const convexResult = useQuery(
    query,
    ...(shouldFetch ? [args] : ["skip"]) as OptionalRestArgsOrSkip<Query>,
  );

  const cacheKey = useMemo(() => {
    if (args === "skip") return null;
    return makeCacheKey(queryName, args);
  }, [args, queryName]);

  const [cachedValue, setCachedValue] = useState<Query["_returnType"] | undefined>(undefined);

  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    void getCachedQuery(cacheKey).then((rec) => {
      if (!cancelled && rec?.value !== undefined) {
        setCachedValue(rec.value as Query["_returnType"]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    if (!shouldFetch || !cacheKey || convexResult === undefined) return;
    setCachedValue(convexResult);
    void setCachedQuery(cacheKey, convexResult);
  }, [shouldFetch, cacheKey, convexResult]);

  if (args === "skip") {
    return convexResult;
  }

  if (!online) {
    return cachedValue;
  }

  return convexResult;
}
