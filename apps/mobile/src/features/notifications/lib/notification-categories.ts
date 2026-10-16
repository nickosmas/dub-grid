import type Ionicons from "@expo/vector-icons/Ionicons";
import type { mobileNotificationCategorySchema } from "@dubgrid/contracts";

export type NotificationCategoryKey = (typeof mobileNotificationCategorySchema.options)[number];

/**
 * The notification categories, in the one order every surface lists them:
 * the schedule first, then requests about it, then the account. The tour's
 * permission step names them before the OS prompt and Profile > Notifications
 * lets the person tune them, so both read this list: the step promises
 * exactly what the settings control, under the same names and glyphs.
 */
export const NOTIFICATION_CATEGORIES = [
  {
    key: "schedule",
    icon: "calendar-outline",
    title: "Schedule updates",
    detail: "A schedule is published, or one of your shifts is added, moved, or removed.",
  },
  {
    key: "shift_requests",
    icon: "swap-horizontal-outline",
    title: "Shift requests",
    detail: "Your pickup, swap, or time-off request is answered, or a new one needs your approval.",
  },
  {
    key: "system",
    icon: "shield-checkmark-outline",
    title: "Account and sign-in",
    detail: "Your role or access changes, or a new device signs in to your account.",
  },
] as const satisfies ReadonlyArray<{
  key: NotificationCategoryKey;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
}>;
