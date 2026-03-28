"use client";

import { createContext, useContext, useState, useEffect } from "react";

export interface SubNavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

interface MobileSubNavContextValue {
  items: SubNavItem[];
  setItems: (items: SubNavItem[]) => void;
}

const MobileSubNavContext = createContext<MobileSubNavContextValue>({
  items: [],
  setItems: () => {},
});

export function MobileSubNavProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SubNavItem[]>([]);
  return (
    <MobileSubNavContext.Provider value={{ items, setItems }}>
      {children}
    </MobileSubNavContext.Provider>
  );
}

export function useMobileSubNav() {
  return useContext(MobileSubNavContext);
}

/**
 * Registers sub-nav items for the current page.
 * Clears them on unmount.
 */
export function useSetMobileSubNav(items: SubNavItem[]) {
  const { setItems } = useMobileSubNav();
  useEffect(() => {
    setItems(items);
    return () => setItems([]);
  }, [items, setItems]);
}
