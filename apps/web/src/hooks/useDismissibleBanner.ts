"use client";

import { useCallback, useState } from "react";

const KEY_PREFIX = "dg_banner_dismissed_";

function readDismissed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(KEY_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.sessionStorage.setItem(KEY_PREFIX + key, "1");
    } else {
      window.sessionStorage.removeItem(KEY_PREFIX + key);
    }
  } catch {
    // storage unavailable (private mode) — fall back to in-memory state.
  }
}

/**
 * Session-persistent banner dismissal. Once the user clicks the banner's
 * dismiss control, it stays hidden for the rest of the tab session — surviving
 * data-change re-renders and route navigations. Wiped on sign-out by the
 * `dg_*` sweep in clearDubgridSessionState.
 *
 * Pass a stable, banner-specific key (e.g. "draft", "publish-history"). Avoid
 * encoding org/user ids; the storage is already scoped to the tab session.
 */
export function useDismissibleBanner(key: string): {
  isDismissed: boolean;
  dismiss: () => void;
  reset: () => void;
} {
  const [isDismissed, setDismissed] = useState<boolean>(() => readDismissed(key));

  const dismiss = useCallback(() => {
    writeDismissed(key, true);
    setDismissed(true);
  }, [key]);

  const reset = useCallback(() => {
    writeDismissed(key, false);
    setDismissed(false);
  }, [key]);

  return { isDismissed, dismiss, reset };
}
