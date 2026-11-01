import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { NETWORK_ERROR_MESSAGE, NETWORK_ERROR_TITLE } from "@dubgrid/client-errors";
import { ToastSurface } from "../components/ToastSurface";
import { useNetworkStatus } from "./NetworkStateProvider";
import { useNetworkRecovery } from "./NetworkRecoveryProvider";

export type ToastTone = "error" | "success" | "info" | "warning";

export type ToastInput = {
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs?: number | null;
  dedupeKey?: string;
};

type ToastDescriptor = ToastInput & {
  id: number;
};

const DEFAULT_TOAST_DURATION_MS = 4500;

const ToastContext = createContext<{
  pushToast: (toast: ToastInput) => void;
} | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const { isOffline } = useNetworkStatus();
  const { isNetworkRecoveryActive } = useNetworkRecovery();
  const idRef = useRef(0);
  const [queue, setQueue] = useState<ToastDescriptor[]>([]);
  const [activeToast, setActiveToast] = useState<ToastDescriptor | null>(null);
  const [isOfflineBannerDismissed, setIsOfflineBannerDismissed] = useState(false);
  // `pushToast` reads both of these, and it must never change identity: nearly
  // every consumer calls it from an effect that lists it as a dependency, next
  // to an error condition that stays true until the query recovers. With
  // `activeToast` in the dependency array below, pushing a toast changed
  // `pushToast`, which re-ran those effects, which pushed the same toast again —
  // a permanent stream of the same error. Only network errors escaped it, by
  // carrying a `dedupeKey`.
  const activeToastRef = useRef<ToastDescriptor | null>(null);
  const isOfflineRef = useRef(isOffline);

  useEffect(() => {
    activeToastRef.current = activeToast;
  }, [activeToast]);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  const dismissToast = useCallback((targetToastId?: number) => {
    setActiveToast((current) => {
      if (!current) {
        return current;
      }

      if (targetToastId !== undefined && current.id !== targetToastId) {
        return current;
      }

      return null;
    });
  }, []);

  const pushToast = useCallback((toast: ToastInput) => {
    if (isOfflineRef.current) {
      // Anything failing right now is failing for one reason, and the banner
      // already names it, so queueing these would only flood the user with
      // stale errors on reconnect. Re-assert the banner instead: it
      // auto-dismisses after a few seconds, and without this a mutation
      // attempted later in an offline session produced no feedback at all.
      setIsOfflineBannerDismissed(false);
      return;
    }

    setQueue((current) => {
      if (
        toast.dedupeKey &&
        (activeToastRef.current?.dedupeKey === toast.dedupeKey ||
          current.some((queuedToast) => queuedToast.dedupeKey === toast.dedupeKey))
      ) {
        return current;
      }

      idRef.current += 1;
      return [...current, { ...toast, id: idRef.current }];
    });
  }, []);

  useEffect(() => {
    if (activeToast || queue.length === 0) {
      return;
    }

    setActiveToast(queue[0]);
    setQueue((current) => current.slice(1));
  }, [activeToast, queue]);

  useEffect(() => {
    if (!activeToast || activeToast.durationMs === null) {
      return;
    }

    const timeout = setTimeout(
      () => dismissToast(activeToast.id),
      activeToast.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    );

    return () => {
      clearTimeout(timeout);
    };
  }, [activeToast, dismissToast]);

  useEffect(() => {
    if (!isOffline) {
      return;
    }

    setActiveToast(null);
    setQueue([]);
    setIsOfflineBannerDismissed(false);
  }, [isOffline]);

  useEffect(() => {
    if (!isOffline || isOfflineBannerDismissed) {
      return;
    }

    const timeout = setTimeout(() => setIsOfflineBannerDismissed(true), DEFAULT_TOAST_DURATION_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [isOffline, isOfflineBannerDismissed]);

  const value = useMemo(
    () => ({
      pushToast,
    }),
    [pushToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {isOffline && !isNetworkRecoveryActive && !isOfflineBannerDismissed ? (
        <ToastSurface
          isOfflineNotice
          message={NETWORK_ERROR_MESSAGE}
          onDismiss={() => setIsOfflineBannerDismissed(true)}
          testID="offline-toast"
          title={NETWORK_ERROR_TITLE}
          tone="error"
        />
      ) : null}
      {activeToast ? (
        <ToastSurface
          key={activeToast.id}
          message={activeToast.message}
          onDismiss={() => dismissToast(activeToast.id)}
          testID="toast-notification"
          title={activeToast.title}
          tone={activeToast.tone}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }

  return context;
}
