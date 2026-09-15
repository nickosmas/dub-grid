import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { getSupabaseClient } from "../lib/supabase";

const NETWORK_RECONNECT_STABILITY_MS = 1_500;
// This provider renders nothing until the first probe resolves, and it sits
// above the screen that hides the native splash — so a probe that never settles
// would strand the app on the splash forever. Assume online after this budget.
const NETWORK_PROBE_TIMEOUT_MS = 2_000;

type NetworkStatusContextValue = {
  hasResolvedState: boolean;
  isOnline: boolean;
  isOffline: boolean;
};

const NetworkStatusContext = createContext<NetworkStatusContextValue | null>(null);

function toOnlineValue(
  state: Pick<Network.NetworkState, "isConnected" | "isInternetReachable">,
): boolean {
  return Boolean(state.isInternetReachable ?? state.isConnected);
}

export function NetworkStateProvider({ children }: PropsWithChildren) {
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOnlineRef = useRef<boolean | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [hasResolvedState, setHasResolvedState] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let receivedLiveEvent = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current != null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function applyOnlineState(nextOnline: boolean) {
      if (cancelled) {
        return;
      }

      setHasResolvedState(true);

      if (!nextOnline) {
        clearReconnectTimer();
        setIsOnline(false);
        isOnlineRef.current = false;
        onlineManager.setOnline(false);
        return;
      }

      if (isOnlineRef.current === null) {
        setIsOnline(true);
        isOnlineRef.current = true;
        onlineManager.setOnline(true);
        return;
      }

      if (reconnectTimerRef.current != null || isOnlineRef.current) {
        return;
      }

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (cancelled) {
          return;
        }
        setIsOnline(true);
        isOnlineRef.current = true;
        onlineManager.setOnline(true);
      }, NETWORK_RECONNECT_STABILITY_MS);
    }

    function assumeOnline() {
      if (cancelled) {
        return;
      }
      setHasResolvedState(true);
      setIsOnline(true);
      isOnlineRef.current = true;
      onlineManager.setOnline(true);
    }

    const probeTimeout = setTimeout(() => {
      if (!receivedLiveEvent) {
        assumeOnline();
      }
    }, NETWORK_PROBE_TIMEOUT_MS);

    Network.getNetworkStateAsync()
      .then((networkState) => {
        clearTimeout(probeTimeout);
        if (!receivedLiveEvent) {
          applyOnlineState(toOnlineValue(networkState));
        }
      })
      .catch(() => {
        clearTimeout(probeTimeout);
        assumeOnline();
      });

    const subscription = Network.addNetworkStateListener((networkState) => {
      receivedLiveEvent = true;
      applyOnlineState(toOnlineValue(networkState));
    });

    return () => {
      cancelled = true;
      clearTimeout(probeTimeout);
      clearReconnectTimer();
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const auth = getSupabaseClient().auth;
    let authRefreshOperation = Promise.resolve();

    function setAuthRefreshActive(active: boolean) {
      authRefreshOperation = authRefreshOperation
        .catch(() => undefined)
        .then(() => (active ? auth.startAutoRefresh() : auth.stopAutoRefresh()))
        .then(
          () => undefined,
          () => undefined,
        );
    }

    if (Platform.OS !== "web") {
      setAuthRefreshActive(appStateRef.current === "active");
    }

    function onAppStateChange(status: AppStateStatus) {
      if (Platform.OS === "web") return;

      const wasActive = appStateRef.current === "active";
      const isActive = status === "active";
      appStateRef.current = status;
      if (wasActive === isActive) return;

      focusManager.setFocused(isActive);
      setAuthRefreshActive(isActive);
    }

    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => {
      subscription.remove();
      if (Platform.OS !== "web") {
        setAuthRefreshActive(false);
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      hasResolvedState,
      isOnline,
      isOffline: hasResolvedState && !isOnline,
    }),
    [hasResolvedState, isOnline],
  );

  if (!hasResolvedState) {
    return null;
  }

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export function useNetworkStatus() {
  const context = useContext(NetworkStatusContext);

  if (!context) {
    throw new Error("useNetworkStatus must be used within a NetworkStateProvider.");
  }

  return context;
}

/**
 * For full-screen recovery UI that can also render in an isolated route error
 * boundary or test harness. Unknown connectivity is treated as online so the
 * UI stays actionable; the provider supplies the real state in the app tree.
 */
export function useOptionalNetworkStatus(): NetworkStatusContextValue {
  return (
    useContext(NetworkStatusContext) ?? {
      hasResolvedState: false,
      isOnline: true,
      isOffline: false,
    }
  );
}
