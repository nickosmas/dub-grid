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
import Ionicons from "@expo/vector-icons/Ionicons";
import { NETWORK_ERROR_MESSAGE, NETWORK_ERROR_TITLE } from "@dubgrid/client-errors";
import { toastToneTokens } from "@dubgrid/design-tokens";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "./NetworkStateProvider";
import { useNetworkRecovery } from "./NetworkRecoveryProvider";
import { useMobileColors } from "./ThemeModeProvider";
import { mobileRadii, mobileText, mobileTextWeighted, type MobileColors } from "../theme/tokens";

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
const TOAST_MESSAGE_COLOR = "rgba(255, 255, 255, 0.82)";
const TOAST_SWIPE_DISMISS_THRESHOLD = 32;

const createToastTone = (mobileColors: MobileColors) =>
  ({
    error: {
      backgroundColor: toastToneTokens.error.background,
      borderColor: toastToneTokens.error.border,
      iconColor: mobileColors.textInverse,
      iconName: "alert-circle" as const,
    },
    success: {
      backgroundColor: toastToneTokens.success.background,
      borderColor: toastToneTokens.success.border,
      iconColor: mobileColors.textInverse,
      iconName: "checkmark-circle" as const,
    },
    info: {
      backgroundColor: toastToneTokens.info.background,
      borderColor: toastToneTokens.info.border,
      iconColor: mobileColors.textInverse,
      iconName: "information-circle" as const,
    },
    warning: {
      backgroundColor: toastToneTokens.warning.background,
      borderColor: toastToneTokens.warning.border,
      iconColor: mobileColors.textInverse,
      iconName: "warning" as const,
    },
  }) as const;

const ToastContext = createContext<{
  pushToast: (toast: ToastInput) => void;
} | null>(null);

function getTouchEventY(event: GestureResponderEvent): number | null {
  const nativeEvent = event.nativeEvent;
  const webNativeEvent = nativeEvent as typeof nativeEvent & {
    changedTouches?: Array<{ pageY?: number }>;
    touches?: Array<{ pageY?: number }>;
  };

  if (typeof nativeEvent.pageY === "number") {
    return nativeEvent.pageY;
  }

  const changedTouchY = webNativeEvent.changedTouches?.[0]?.pageY;
  if (typeof changedTouchY === "number") {
    return changedTouchY;
  }

  const touchY = webNativeEvent.touches?.[0]?.pageY;
  if (typeof touchY === "number") {
    return touchY;
  }

  return null;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const mobileColors = useMobileColors();
  const styles = useMemo(() => createStyles(mobileColors), [mobileColors]);
  const toastTone = useMemo(() => createToastTone(mobileColors), [mobileColors]);
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const { isNetworkRecoveryActive } = useNetworkRecovery();
  const idRef = useRef(0);
  const swipeStartYRef = useRef<number | null>(null);
  const [queue, setQueue] = useState<ToastDescriptor[]>([]);
  const [activeToast, setActiveToast] = useState<ToastDescriptor | null>(null);
  const [isOfflineBannerDismissed, setIsOfflineBannerDismissed] = useState(false);

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

  const pushToast = useCallback(
    (toast: ToastInput) => {
      if (isOffline) {
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
          (activeToast?.dedupeKey === toast.dedupeKey ||
            current.some((queuedToast) => queuedToast.dedupeKey === toast.dedupeKey))
        ) {
          return current;
        }

        idRef.current += 1;
        return [...current, { ...toast, id: idRef.current }];
      });
    },
    [activeToast, isOffline],
  );

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

    swipeStartYRef.current = null;
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

  function handleToastTouchStart(event: GestureResponderEvent) {
    swipeStartYRef.current = getTouchEventY(event);
  }

  function handleToastTouchCancel() {
    swipeStartYRef.current = null;
  }

  function handleToastTouchEnd(event: GestureResponderEvent) {
    const startY = swipeStartYRef.current;
    swipeStartYRef.current = null;

    if (startY == null || !activeToast) {
      return;
    }

    const endY = getTouchEventY(event);
    if (endY == null) {
      return;
    }

    if (endY - startY <= -TOAST_SWIPE_DISMISS_THRESHOLD) {
      dismissToast(activeToast.id);
    }
  }

  function handleOfflineBannerTouchStart(event: GestureResponderEvent) {
    swipeStartYRef.current = getTouchEventY(event);
  }

  function handleOfflineBannerTouchCancel() {
    swipeStartYRef.current = null;
  }

  function handleOfflineBannerTouchEnd(event: GestureResponderEvent) {
    const startY = swipeStartYRef.current;
    swipeStartYRef.current = null;

    if (startY == null) {
      return;
    }

    const endY = getTouchEventY(event);
    if (endY == null) {
      return;
    }

    if (endY - startY <= -TOAST_SWIPE_DISMISS_THRESHOLD) {
      setIsOfflineBannerDismissed(true);
    }
  }

  const value = useMemo(
    () => ({
      pushToast,
    }),
    [pushToast],
  );

  const palette = activeToast ? toastTone[activeToast.tone] : null;
  const offlinePalette = toastTone.error;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {isOffline && !isNetworkRecoveryActive && !isOfflineBannerDismissed ? (
        <View pointerEvents="box-none" style={styles.host}>
          <View
            testID="offline-toast"
            onTouchCancel={handleOfflineBannerTouchCancel}
            onTouchEnd={handleOfflineBannerTouchEnd}
            onTouchStart={handleOfflineBannerTouchStart}
            style={[
              styles.toast,
              {
                marginTop: insets.top + 12,
                backgroundColor: offlinePalette.backgroundColor,
                borderColor: offlinePalette.borderColor,
              },
            ]}
          >
            <View style={styles.toastMain}>
              <Ionicons color={offlinePalette.iconColor} name={offlinePalette.iconName} size={20} />
              <View style={styles.toastCopy}>
                <Text style={styles.toastTitle}>{NETWORK_ERROR_TITLE}</Text>
                <Text style={styles.toastMessage}>{NETWORK_ERROR_MESSAGE}</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {activeToast && palette ? (
        <View pointerEvents="box-none" style={styles.host}>
          <View
            testID="toast-notification"
            onTouchCancel={handleToastTouchCancel}
            onTouchEnd={handleToastTouchEnd}
            onTouchStart={handleToastTouchStart}
            style={[
              styles.toast,
              {
                marginTop: insets.top + 12,
                backgroundColor: palette.backgroundColor,
                borderColor: palette.borderColor,
              },
            ]}
          >
            <View style={styles.toastMain}>
              <Ionicons color={palette.iconColor} name={palette.iconName} size={20} />
              <View style={styles.toastCopy}>
                {activeToast.title ? (
                  <Text style={styles.toastTitle}>{activeToast.title}</Text>
                ) : null}
                <Text style={styles.toastMessage}>{activeToast.message}</Text>
              </View>
            </View>
          </View>
        </View>
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

const createStyles = (mobileColors: MobileColors) =>
  StyleSheet.create({
    host: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      paddingHorizontal: 20,
      zIndex: 100,
      elevation: 100,
    },
    toast: {
      width: "100%",
      maxWidth: 520,
      borderRadius: mobileRadii.card,
      borderWidth: 1,
      paddingVertical: 14,
      paddingLeft: 20,
      paddingRight: 20,
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    toastMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    toastCopy: {
      flex: 1,
      gap: 2,
    },
    toastTitle: {
      ...mobileText.bodyStrong,
      color: mobileColors.textInverse,
    },
    toastMessage: {
      ...mobileTextWeighted("meta", "medium"),
      color: TOAST_MESSAGE_COLOR,
    },
  });
