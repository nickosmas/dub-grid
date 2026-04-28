import { useCallback, useState } from "react";

export function useManualRefresh(
  onRefresh: () => Promise<unknown> | unknown,
) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(() => {
    if (isRefreshing) {
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
        setIsRefreshing(false);
      });
  }, [isRefreshing, onRefresh]);

  return {
    isRefreshing,
    refresh,
  };
}
