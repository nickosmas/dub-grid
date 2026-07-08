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
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "./NetworkStateProvider";
import { mobileColors, mobileRadii, mobileText } from "../theme/tokens";

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
const OFFLINE_TOAST_TITLE = "Network connection issue";
const OFFLINE_TOAST_MESSAGE = "Check your internet connection and try again.";
const TOAST_MESSAGE_COLOR = "rgba(255, 255, 255, 0.82)";
const TOAST_SWIPE_DISMISS_THRESHOLD = 32;

const TOAST_TONE = {
  error: {
    backgroundColor: "#DC2626",
    borderColor: "#B91C1C",
    iconColor: mobileColors.textInverse,
    iconName: "alert-circle" as const,
  },
  success: {
    backgroundColor: "#16A34A",
    borderColor: "#166534",
    iconColor: mobileColors.textInverse,
    iconName: "checkmark-circle" as const,
  },
  info: {
    backgroundColor: "#1D4ED8",
    borderColor: "#1E3A8A",
    iconColor: mobileColors.textInverse,
    iconName: "information-circle" as const,
  },
  warning: {
    backgroundColor: "#D97706",
    borderColor: "#92400E",
    iconColor: mobileColors.textInverse,
    iconName: "warning" as const,
  },
} as const;

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
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const idRef = useRef(0);
  const swipeStartYRef = useRef<number | null>(null);
  const [queue, setQueue] = useState<ToastDescriptor[]>([]);
  const [activeToast, setActiveToast] = useState<ToastDescriptor | null>(null);

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
      setQueue((current) => {
        if (isOffline) {
          return current;
        }

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
  }, [isOffline]);

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

  const value = useMemo(
    () => ({
      pushToast,
    }),
    [pushToast],
  );

  const palette = activeToast ? TOAST_TONE[activeToast.tone] : null;
  const offlinePalette = TOAST_TONE.error;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {isOffline ? (
        <View pointerEvents="none" style={styles.host}>
          <View
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
                <Text style={styles.toastTitle}>{OFFLINE_TOAST_TITLE}</Text>
                <Text style={styles.toastMessage}>{OFFLINE_TOAST_MESSAGE}</Text>
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

const styles = StyleSheet.create({
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
    ...mobileText.meta,
    color: TOAST_MESSAGE_COLOR,
    fontWeight: "500",
  },
});
