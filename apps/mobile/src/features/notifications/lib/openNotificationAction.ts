import { Linking } from "react-native";
import { router } from "expo-router";
import { resolveAlertDestination, type AlertLike } from "@dubgrid/domain";

/** Shown when an alert's subject only exists on the web, e.g. billing. */
export const WEB_ONLY_ALERT_MESSAGE = "Open this on the web to see more.";

/** A native route the app can push, or `null` when the href only exists on the web. */
export type NativeRoute = { pathname: string; params?: Record<string, string> };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function parseHref(href: string): { segments: string[]; query: URLSearchParams } {
  const [path, search = ""] = href.split("?");
  return {
    segments: path.split("/").filter(Boolean),
    query: new URLSearchParams(search),
  };
}

/**
 * The native route for a web href the alert contract or an `actionUrl`
 * carries. The web app is the source of truth for where an alert goes; this
 * only translates its paths into the tabs and screens the app has.
 */
export function resolveNativeRoute(href: string): NativeRoute | null {
  if (isExternalUrl(href)) return null;
  const { segments, query } = parseHref(href);
  const [head, second] = segments;

  switch (head) {
    case "schedule": {
      if (query.has("requests")) return { pathname: "/(tabs)/requests" };
      const date = query.get("date");
      return date && DATE_KEY.test(date)
        ? { pathname: "/(tabs)/team", params: { date } }
        : { pathname: "/(tabs)/team" };
    }
    case "requests":
      return { pathname: "/(tabs)/requests" };
    case "people":
      return second && UUID.test(second)
        ? { pathname: "/(tabs)/people/[id]", params: { id: second } }
        : { pathname: "/(tabs)/people" };
    case "profile":
      return query.get("section") === "security" || second === "security"
        ? { pathname: "/(tabs)/profile/security" }
        : { pathname: "/(tabs)/profile" };
    case "alerts":
      return { pathname: "/alerts" };
    default:
      return null;
  }
}

/**
 * Whether tapping this href can actually be completed in the mobile app
 * (an external URL, or one of the known in-app routes). Screens use this to
 * decide whether to render an actionable CTA or a "complete on web" hint.
 */
export function isNotificationActionSupportedOnMobile(href: string): boolean {
  return isExternalUrl(href) || resolveNativeRoute(href) !== null;
}

function isCalendarDate(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Where an alert opens in the app, or `null` when only the web can show it.
 * A schedule note is about the reader's own shift, so it opens that shift
 * (the web, which has no shift screen, opens the day); every other alert,
 * and a note alert that names a link or another person, follows the shared
 * destination.
 */
export function resolveAlertNativeRoute(
  alert: AlertLike,
  linkedEmployeeId: string | null,
): NativeRoute | null {
  const destination = resolveAlertDestination(alert);
  if (!destination) return null;
  const empId = alert.metadata?.empId;
  const isOwnShiftNote =
    alert.type === "schedule_note_published" &&
    linkedEmployeeId !== null &&
    !alert.metadata?.actionUrl &&
    (empId === undefined || empId === linkedEmployeeId);
  if (isOwnShiftNote) {
    const date = alert.metadata?.date;
    if (typeof date === "string" && isCalendarDate(date)) {
      return {
        pathname: "/shift/[employeeId]/[date]",
        params: {
          employeeId: linkedEmployeeId,
          date,
          rangeStart: date,
          rangeEnd: date,
          source: "mine",
        },
      };
    }
  }
  return resolveNativeRoute(destination.href);
}

export function openNativeRoute(route: NativeRoute, mode: "push" | "replace" = "push") {
  const target = (route.params ? route : route.pathname) as Parameters<typeof router.push>[0];
  if (mode === "replace") router.replace(target);
  else router.push(target);
}

export function openNotificationAction(href: string, mode: "push" | "replace" = "push") {
  if (isExternalUrl(href)) {
    void Linking.openURL(href);
    return;
  }
  const route = resolveNativeRoute(href);
  if (route) openNativeRoute(route, mode);
}
