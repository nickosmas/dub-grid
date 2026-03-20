"use client";

import { type ReactNode } from "react";

/** No-op stub — page transitions are now handled by cache + persistent layout. */
export function usePageTransition() {
  return { startNavigation: () => {}, setPageReady: () => {} };
}

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
