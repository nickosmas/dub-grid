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
import { subscribeToNetworkState, subscribeToServerReached } from "../lib/network-state-source";
import { getSupabaseClient } from "../lib/supabase";

const NETWORK_RECONNECT_STABILITY_MS = 1_500;
// iOS reports the network path as unavailable for a moment during a handover
// (Wi-Fi to cellular, between cells, waking from sleep) while requests still
// go through. Going offline on that blip showed "Network connection issue"
// and paused every page's loading, so an offline reading must last this long.
const NETWORK_OFFLINE_CONFIRM_MS = 3_000;
// This provider renders nothing until the first probe resolves, and it sits
// above the screen that hides the native splash — so a probe that never settles
// would strand the app on the splash forever. Assume online after this budget.
const NETWORK_PROBE_TIMEOUT_MS = 2_000;
// Focus waits for the session so foreground refetches carry a live token, but
// never longer than this: a refresh stuck on a bad network must not leave the
// app's queries unfocused.
const FOREGROUND_SESSION_SETTLE_TIMEOUT_MS = 5_000;

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
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOnlineRef = useRef<boolean | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const recheckOfflineRef = useRef<() => void>(() => {});
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

    function clearOfflineTimer() {
      if (offlineTimerRef.current != null) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    }

    function goOffline() {
      clearReconnectTimer();
      clearOfflineTimer();
      setIsOnline(false);
      isOnlineRef.current = false;
      onlineManager.setOnline(false);
    }

    function goOnline() {
      clearReconnectTimer();
      clearOfflineTimer();
      setIsOnline(true);
      isOnlineRef.current = true;
      onlineManager.setOnline(true);
    }

    function applyOnlineState(nextOnline: boolean) {
      if (cancelled) {
        return;
      }

      setHasResolvedState(true);

      if (!nextOnline) {
        // Already offline, or the first reading: nothing to confirm.
        if (isOnlineRef.current !== true) {
          goOffline();
          return;
        }
        clearReconnectTimer();
        if (offlineTimerRef.current == null) {
          offlineTimerRef.current = setTimeout(() => {
            offlineTimerRef.current = null;
            if (!cancelled) goOffline();
          }, NETWORK_OFFLINE_CONFIRM_MS);
        }
        return;
      }

      // Back before the offline reading was confirmed: it was a blip.
      clearOfflineTimer();

      if (isOnlineRef.current === null) {
        goOnline();
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
        goOnline();
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

    const unsubscribe = subscribeToNetworkState((networkState) => {
      receivedLiveEvent = true;
      applyOnlineState(toOnlineValue(networkState));
    });
    // The server answering settles it: online now, with no stability wait,
    // and any pending offline reading dropped.
    const unsubscribeServerReached = subscribeToServerReached(() => {
      if (cancelled) return;
      if (isOnlineRef.current === true && onlineManager.isOnline()) {
        clearOfflineTimer();
        return;
      }
      setHasResolvedState(true);
      goOnline();
    });

    // Events alone cannot undo a wrong offline flag: one that is missed leaves
    // it offline while requests still work, pausing every query. Only an online
    // reading is applied, since the native probe also reads offline when it
    // times out; going offline stays with the events.
    recheckOfflineRef.current = () => {
      if (onlineManager.isOnline()) return;
      Network.getNetworkStateAsync()
        .then((networkState) => {
          if (!toOnlineValue(networkState)) return;
          // React Query's flag is what pauses queries; recover it whatever
          // this provider last recorded.
          isOnlineRef.current = false;
          applyOnlineState(true);
        })
        .catch(() => undefined);
    };

    return () => {
      cancelled = true;
      clearTimeout(probeTimeout);
      clearReconnectTimer();
      clearOfflineTimer();
      recheckOfflineRef.current = () => {};
      unsubscribe();
      unsubscribeServerReached();
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

    // A token that expired in the background is refreshed by `getSession`.
    // Focusing first sent every refetch with the expired token, and each one
    // came back 401.
    let focusGeneration = 0;
    function focusOnceSessionSettles() {
      const generation = ++focusGeneration;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const sessionSettled = authRefreshOperation
        .then(() => auth.getSession())
        .then(
          () => undefined,
          () => undefined,
        );
      const deadline = new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, FOREGROUND_SESSION_SETTLE_TIMEOUT_MS);
      });
      void Promise.race([sessionSettled, deadline]).then(() => {
        if (timeout) clearTimeout(timeout);
        if (generation === focusGeneration && appStateRef.current === "active") {
          focusManager.setFocused(true);
        }
      });
    }

    function onAppStateChange(status: AppStateStatus) {
      if (Platform.OS === "web") return;

      const wasActive = appStateRef.current === "active";
      const isActive = status === "active";
      appStateRef.current = status;
      if (wasActive === isActive) return;

      setAuthRefreshActive(isActive);
      if (isActive) {
        focusOnceSessionSettles();
        recheckOfflineRef.current();
      } else {
        focusGeneration += 1;
        focusManager.setFocused(false);
      }
    }

    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => {
      focusGeneration += 1;
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
