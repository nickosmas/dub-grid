import { createContext, useContext, type PropsWithChildren } from "react";

const NativeTabBarPresenceContext = createContext(false);

export function NativeTabBarPresenceProvider({ children }: PropsWithChildren) {
  return (
    <NativeTabBarPresenceContext.Provider value>{children}</NativeTabBarPresenceContext.Provider>
  );
}

export function useNativeTabBarPresence(): boolean {
  return useContext(NativeTabBarPresenceContext);
}
