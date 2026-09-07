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

export function formatSessionClient(session: MobileProfileSession): string {
  if (session.platform === "web") {
    return [session.browserName, session.browserVersion].filter(Boolean).join(" ") || "Web browser";
  }

  return ["Mobile app", session.appVersion].filter(Boolean).join(" ");
}

export function formatSessionLocation(session: MobileProfileSession): string {
  const ipAddress = session.ipAddress === "::1" ? "localhost" : (session.ipAddress ?? "Unknown IP");
  const location = [session.locationCity, session.locationCountry].filter(Boolean).join(", ");
  return location ? `${ipAddress} (${location})` : ipAddress;
}

/** "Last active" / "First seen" timestamps, in the device's own locale. */
export function formatSessionTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export function formatSessionLastActive(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    date,
  );
  const startOf = (candidate: Date) =>
    new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  const dayDifference = Math.round((startOf(now).getTime() - startOf(date).getTime()) / 86_400_000);

  if (dayDifference === 0) return `Today at ${time}`;
  if (dayDifference === 1) return `Yesterday at ${time}`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** The trailing value on the hub's Devices row. */
export function formatSessionCount(count: number): string {
  return count === 1 ? "1 device signed in" : `${count} devices signed in`;
}
