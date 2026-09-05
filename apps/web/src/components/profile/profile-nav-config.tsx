"use client";

import {
  ProfileIcon,
  ShieldIcon,
  NotificationsIcon,
  DataPrivacyIcon,
  DashboardIcon,
  DisplayIcon,
} from "@/components/icons/NavIcons";
import type { ShellNavGroup, ShellNavItem } from "@/components/settings/SettingsShell";

export type ProfileSectionId =
  "profile" | "security" | "notifications" | "appearance" | "data-privacy" | "overview";

export const VALID_PROFILE_SECTIONS: ProfileSectionId[] = [
  "profile",
  "security",
  "notifications",
  "appearance",
  "data-privacy",
  "overview",
];

export function resolveProfileSection(raw: string | null): ProfileSectionId | null {
  if (!raw) return null;
  if (raw === "schedule") return "overview";
  return VALID_PROFILE_SECTIONS.includes(raw as ProfileSectionId)
    ? (raw as ProfileSectionId)
    : null;
}

export interface ProfileNavContext {
  /**
   * Whether the user is an on-schedule employee (has at least one focus
   * area). Management-only employees have an `employees` row but no
   * focus areas and so have no schedule of their own to view here.
   */
  isOnSchedule: boolean;
}

export function buildProfileNavGroups(ctx: ProfileNavContext): ShellNavGroup<ProfileSectionId>[] {
  const primaryItems: ShellNavItem<ProfileSectionId>[] = [
    {
      id: "profile",
      label: "Profile",
      Icon: ProfileIcon,
    },
    {
      id: "security",
      label: "Security",
      Icon: ShieldIcon,
      description:
        "Change your password, manage two-factor authentication, and review active sessions.",
    },
    {
      id: "notifications",
      label: "Alerts",
      Icon: NotificationsIcon,
      description: "Choose how and when DubGrid contacts you.",
    },
    {
      id: "appearance",
      label: "Appearance",
      Icon: DisplayIcon,
      description: "Follow your device's appearance, or choose light or dark.",
    },
  ];

  if (ctx.isOnSchedule) {
    primaryItems.push({
      id: "overview",
      label: "Overview",
      Icon: DashboardIcon,
      description:
        "Your role, focus areas, certifications, recurring schedule, and calendar subscription.",
    });
  }

  return [
    { id: "primary", label: "Profile", items: primaryItems },
    {
      id: "legal",
      label: "Data & privacy",
      items: [
        {
          id: "data-privacy",
          label: "Data & privacy",
          Icon: DataPrivacyIcon,
          description:
            "Cookie preferences for this device, plus our privacy, terms, and cookie policies.",
        },
      ],
    },
  ];
}

/** Nav group IDs that ProfilePage pins to the sidebar footer. */
export const PROFILE_FOOTER_GROUP_IDS = ["legal"];

export function getDefaultProfileSection(): ProfileSectionId {
  return "profile";
}
