"use client";

import { Toaster, toast, type ExternalToast } from "sonner";

type ToastMethod = "success" | "error" | "info" | "warning" | "message" | "loading";

const TONES: ToastMethod[] = [
  "success",
  "error",
  "info",
  "warning",
  "message",
  "loading",
];

declare global {
  // eslint-disable-next-line no-var
  var __dubgridToastPatched: boolean | undefined;
}

if (typeof window !== "undefined" && !globalThis.__dubgridToastPatched) {
  globalThis.__dubgridToastPatched = true;

  // Tracks the currently-visible toast id for each (tone + title + description)
  // key, so a follow-up duplicate can dismiss the prior banner and re-enter
  // with a fresh React key (= entrance animation).
  const activeByKey = new Map<string, string | number>();

  const deriveKey = (
    tone: string,
    title: unknown,
    options?: ExternalToast,
  ): string | undefined => {
    if (typeof title !== "string") return undefined;
    const description =
      typeof options?.description === "string" ? options.description : "";
    return `${tone}:${title}:${description}`;
  };

  let counter = 0;

  type ToneFn = (title: unknown, options?: ExternalToast) => string | number;
  const target = toast as unknown as Record<string, ToneFn>;

  for (const tone of TONES) {
    const original = target[tone];
    if (typeof original !== "function") continue;

    target[tone] = function patched(title, options) {
      // If the caller passed an explicit id, forward unchanged — they own dedupe.
      if (options?.id !== undefined) return original.call(this, title, options);

      const key = deriveKey(tone, title, options);
      if (key === undefined) return original.call(this, title, options);

      // Drop the previous banner with this key so the new one mounts fresh
      // and replays the entrance animation.
      const prevId = activeByKey.get(key);
      if (prevId !== undefined) toast.dismiss(prevId);

      const freshId = `${key}#${++counter}`;
      activeByKey.set(key, freshId);

      const clearIfCurrent = () => {
        if (activeByKey.get(key) === freshId) activeByKey.delete(key);
      };

      const next: ExternalToast = {
        ...options,
        id: freshId,
        onDismiss: (t) => {
          clearIfCurrent();
          options?.onDismiss?.(t);
        },
        onAutoClose: (t) => {
          clearIfCurrent();
          options?.onAutoClose?.(t);
        },
      };

      return original.call(this, title, next);
    };
  }
}

export default function AppToaster() {
  return (
    <Toaster
      position="top-center"
      closeButton
      duration={6000}
      toastOptions={{
        className:
          "text-[15px] font-semibold rounded-[var(--dg-radius-lg)] w-[min(calc(100vw-48px),720px)] max-w-full",
      }}
    />
  );
}
