"use client";

import { useEffect, useState, type ComponentProps } from "react";
import type { default as ShiftEditPanelComponent } from "@/components/ShiftEditPanel";
import { LazyProgressFallback } from "@/components/ui/lazy-fallback";

type ShiftEditPanelType = typeof ShiftEditPanelComponent;
type Props = ComponentProps<ShiftEditPanelType>;

let loaded: ShiftEditPanelType | null = null;
let loading: Promise<ShiftEditPanelType> | null = null;

function load() {
  loading ??= import("@/components/ShiftEditPanel").then((mod) => {
    loaded = mod.default;
    return mod.default;
  });
  return loading;
}

// Kick the download as soon as the schedule bundle evaluates in the browser,
// so the editor is normally in hand before the first cell click.
if (typeof window !== "undefined") {
  void load();
}

/**
 * Code-splits the shift editor without a Suspense boundary on the click path.
 * `next/dynamic` always suspends once per page load, even with the chunk
 * cached, which costs a fallback commit plus a deferred retry render before
 * the panel appears. Once the module is loaded this renders it synchronously
 * in the same commit as the click.
 */
export default function ShiftEditPanelLazy(props: Props) {
  // Initializer form: a component is a function, and useState would otherwise
  // call it as a lazy initializer.
  const [Panel, setPanel] = useState<ShiftEditPanelType | null>(() => loaded);

  useEffect(() => {
    if (Panel) return;
    let cancelled = false;
    void load().then((component) => {
      if (!cancelled) setPanel(() => component);
    });
    return () => {
      cancelled = true;
    };
  }, [Panel]);

  if (!Panel) return <LazyProgressFallback />;
  return <Panel {...props} />;
}
