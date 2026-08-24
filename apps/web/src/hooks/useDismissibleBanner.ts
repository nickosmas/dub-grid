"use client";

import { useCallback, useState } from "react";

const KEY_PREFIX = "dg_banner_dismissed_";

const DEFAULT_SIGNATURE = "1";

function readDismissed(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(KEY_PREFIX + key);
  } catch {
    return null;
  }
}

function writeDismissed(key: string, signature: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (signature != null) {
      window.sessionStorage.setItem(KEY_PREFIX + key, signature);
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
 *
 * `signature` identifies *what* was dismissed. Dismissing stores it, and the
 * banner reappears on its own once the signature changes — so closing "4
 * changes published" doesn't also swallow tomorrow's 40-change notice. Omit it
 * for banners whose content never meaningfully changes.
 */
export function useDismissibleBanner(
  key: string,
  signature?: string | null,
): {
  isDismissed: boolean;
  dismiss: () => void;
  reset: () => void;
} {
  const token = signature ?? DEFAULT_SIGNATURE;
  const [dismissedToken, setDismissedToken] = useState<string | null>(() => readDismissed(key));

  const dismiss = useCallback(() => {
    writeDismissed(key, token);
    setDismissedToken(token);
  }, [key, token]);

  const reset = useCallback(() => {
    writeDismissed(key, null);
    setDismissedToken(null);
  }, [key]);

  return { isDismissed: dismissedToken != null && dismissedToken === token, dismiss, reset };
}
