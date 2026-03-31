import { useState, useEffect } from "react";
import { getFeatureFlag, posthog } from "@/lib/posthog";

/**
 * React hook for evaluating a PostHog feature flag.
 * Returns `undefined` while loading, then the flag value.
 */
export function useFeatureFlag(flag: string): boolean | string | undefined {
  const [value, setValue] = useState<boolean | string | undefined>(() => getFeatureFlag(flag));

  useEffect(() => {
    // Re-evaluate when flags are loaded/updated
    function onFlagsLoaded() {
      setValue(getFeatureFlag(flag));
    }

    if (typeof window !== "undefined" && posthog.__loaded) {
      posthog.onFeatureFlags(onFlagsLoaded);
    }
  }, [flag]);

  return value;
}
