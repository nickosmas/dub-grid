import * as Network from "expo-network";

type NetworkStateListener = (state: Network.NetworkState) => void;

const listeners = new Set<NetworkStateListener>();
let subscribed = false;

/**
 * Network state changes for the life of the process. expo-network cancels its
 * native path monitor when its last listener goes and, on iOS, restarts that
 * same monitor when one returns, and a cancelled monitor never reports again.
 * So the native subscription is made once and never removed; callers come and
 * go as plain JS listeners.
 */
export function subscribeToNetworkState(listener: NetworkStateListener): () => void {
  if (!subscribed) {
    subscribed = true;
    Network.addNetworkStateListener((state) => {
      for (const current of listeners) current(state);
    });
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
