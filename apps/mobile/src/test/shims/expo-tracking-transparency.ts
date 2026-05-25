// Test shim for expo-tracking-transparency — defaults to granted so consent
// flows proceed without a native ATT prompt.
const granted = {
  status: "granted" as const,
  granted: true,
  canAskAgain: false,
  expires: "never" as const,
};

export async function getTrackingPermissionsAsync(): Promise<typeof granted> {
  return granted;
}
export async function requestTrackingPermissionsAsync(): Promise<typeof granted> {
  return granted;
}
