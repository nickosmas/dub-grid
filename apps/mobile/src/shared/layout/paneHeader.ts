import { createContext, useContext, useEffect } from "react";

/** What a pane's own navigation bar says: its title, large until the page scrolls. */
export type PaneHeader = { title: string; large?: boolean };

export const PaneHeaderContext = createContext<((header: PaneHeader | null) => void) | null>(null);

/**
 * Names the pane's own bar from the page inside it. Returns whether the page
 * sits in a pane with a bar, so it can leave its own heading out.
 */
export function usePaneHeader(header: PaneHeader | null): boolean {
  const setHeader = useContext(PaneHeaderContext);
  const title = header?.title;
  const large = header?.large;
  useEffect(() => {
    if (!setHeader || title == null) return;
    setHeader({ title, large });
    // A page that leaves takes its title with it.
    return () => setHeader(null);
  }, [setHeader, title, large]);
  return setHeader != null;
}

/** `usePaneHeader` as an element, for a page whose title is set where it renders. */
export function PaneBarTitle(header: PaneHeader) {
  usePaneHeader(header);
  return null;
}
