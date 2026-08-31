import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";

type NetworkRecoveryContextValue = {
  isNetworkRecoveryActive: boolean;
  setNetworkRecoveryActive: (active: boolean) => void;
};

const NetworkRecoveryContext = createContext<NetworkRecoveryContextValue>({
  isNetworkRecoveryActive: false,
  setNetworkRecoveryActive: () => undefined,
});

/**
 * Lets a blocking, retryable connection screen take ownership of the network
 * message. The global offline banner remains available everywhere else, but
 * must not duplicate the explanation over this full-screen recovery state.
 */
export function NetworkRecoveryProvider({ children }: PropsWithChildren) {
  const [isNetworkRecoveryActive, setNetworkRecoveryActive] = useState(false);
  const value = useMemo(
    () => ({ isNetworkRecoveryActive, setNetworkRecoveryActive }),
    [isNetworkRecoveryActive],
  );

  return (
    <NetworkRecoveryContext.Provider value={value}>{children}</NetworkRecoveryContext.Provider>
  );
}

export function useNetworkRecovery() {
  return useContext(NetworkRecoveryContext);
}
