// Test shim for expo-network — defaults to a connected/online state.
export async function getNetworkStateAsync(): Promise<{
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
}> {
  return { isConnected: true, isInternetReachable: true, type: "WIFI" };
}

export function addNetworkStateListener(): { remove: () => void } {
  return { remove() {} };
}
