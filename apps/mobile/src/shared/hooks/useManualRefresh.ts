import { useCallback, useRef, useState } from "react";

const REFRESH_COOLDOWN_MS = 500;

export function useManualRefresh(onRefresh: () => Promise<unknown> | unknown) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Track the last completion time to suppress rapid back-to-back pulls.
  const lastCompletedAtRef = useRef(0);

  const refresh = useCallback(() => {
    if (isRefreshing) {
      return;
    }
    if (
      lastCompletedAtRef.current > 0 &&
      Date.now() - lastCompletedAtRef.current < REFRESH_COOLDOWN_MS
    ) {
      return;
    }

    setIsRefreshing(true);
    let refreshPromise: Promise<unknown>;

    try {
      refreshPromise = Promise.resolve(onRefresh());
    } catch (error) {
      refreshPromise = Promise.reject(error);
    }

    void refreshPromise
      .catch(() => undefined)
      .finally(() => {
        lastCompletedAtRef.current = Date.now();
        setIsRefreshing(false);
      });
  }, [isRefreshing, onRefresh]);

  return {
    isRefreshing,
    refresh,
  };
}
