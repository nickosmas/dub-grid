import type { MobileProfileSession } from "@dubgrid/contracts";

/**
 * The short platform tag shown in a session row's icon tile.
 *
 * Three characters at most, because the tile is a 36pt square and the tag has
 * to read at `micro` inside it.
 */
export function formatSessionPlatform(platform: string | null): string {
  if (platform === "ios") return "iOS";
  if (platform === "android") return "AND";
  if (platform === "web") return "WEB";
  return "?";
}

/**
 * One name for a device, shared by the list row, the detail sheet and the
 * revoke confirmation.
 *
 * The three used to re-derive this fallback chain separately, and the
 * confirmation's copy drifted ("this device" where the row said "Unknown
 * device") for a session with no label — so the dialog named something other
 * than the row that opened it.
 */
export function formatSessionDeviceLabel(session: MobileProfileSession): string {
  return session.deviceLabel || session.platform || "Unknown device";
}

/** "Last active" / "First seen" timestamps, in the device's own locale. */
export function formatSessionTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

/** The trailing value on the hub's Devices row. */
export function formatSessionCount(count: number): string {
  return count === 1 ? "1 device signed in" : `${count} devices signed in`;
}
