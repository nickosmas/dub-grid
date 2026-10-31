import { resolveToastDuration, type ToastTimingTone } from "@dubgrid/design-tokens";
import type { ExternalToast } from "sonner";

const TIMED_TONES: ReadonlySet<string> = new Set<ToastTimingTone>([
  "success",
  "info",
  "warning",
  "error",
]);

/** Gives a toast its type's default duration unless the caller chose one; loading and plain toasts are left to Sonner. */
export function withToastDuration(
  tone: string,
  options?: ExternalToast,
): ExternalToast | undefined {
  if (!TIMED_TONES.has(tone) || options?.duration !== undefined) return options;
  const duration = resolveToastDuration(tone as ToastTimingTone, {
    hasAction: options?.action !== undefined || options?.cancel !== undefined,
  });
  return { ...options, duration };
}
