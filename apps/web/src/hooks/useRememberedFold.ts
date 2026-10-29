"use client";

import { useCallback, useState } from "react";

const KEY_PREFIX = "dg_fold_";

function readFolded(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

/**
 * A fold this browser remembers (item 54's Away all period group): open
 * until someone folds it, and the same after a reload. Storage that isn't
 * available leaves it working for the visit only.
 */
export function useRememberedFold(key: string): [boolean, (folded: boolean) => void] {
  const [folded, setFoldedState] = useState(() => readFolded(key));
  const setFolded = useCallback(
    (next: boolean) => {
      setFoldedState(next);
      try {
        if (next) window.localStorage.setItem(KEY_PREFIX + key, "1");
        else window.localStorage.removeItem(KEY_PREFIX + key);
      } catch {
        // Private mode or blocked storage: the fold lasts for this visit.
      }
    },
    [key],
  );
  return [folded, setFolded];
}
