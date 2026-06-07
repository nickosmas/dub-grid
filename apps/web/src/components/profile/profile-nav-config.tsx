"use client";

import {
  ProfileIcon,
  ShieldIcon,
  NotificationsIcon,
  DataPrivacyIcon,
  DashboardIcon,
  ScheduleIcon,
} from "@/components/icons/NavIcons";
import type { ShellNavGroup, ShellNavItem } from "@/components/settings/SettingsShell";

export type ProfileSectionId =
  | "profile"
  | "security"
  | "notifications"
  | "data-privacy"
  | "overview"
  | "schedule";

export const VALID_PROFILE_SECTIONS: ProfileSectionId[] = [
  "profile",
  "security",
  "notifications",
  "data-privacy",
  "overview",
  "schedule",
];

export function resolveProfileSection(raw: string | null): ProfileSectionId | null {
  if (!raw) return null;
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

export function buildProfileNavGroups(
  ctx: ProfileNavContext,
): ShellNavGroup<ProfileSectionId>[] {
  const accountItems: ShellNavItem<ProfileSectionId>[] = [
    {
      id: "profile",
      label: "Profile",
      Icon: ProfileIcon,
      description:
        "Your name, email, and phone — the basics about how you appear in DubGrid.",
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
      label: "Notifications",
      Icon: NotificationsIcon,
      description:
        "Choose how and when DubGrid contacts you.",
    },
  ];

  const groups: ShellNavGroup<ProfileSectionId>[] = [
    { id: "account", label: "Account", items: accountItems },
  ];

  if (ctx.isOnSchedule) {
    groups.push({
      id: "work",
      label: "My work",
      items: [
        {
          id: "overview",
          label: "Overview",
          Icon: DashboardIcon,
          description:
            "Your role, focus areas, certifications, and what you're working this week.",
        },
        {
          id: "schedule",
          label: "Schedule",
          Icon: ScheduleIcon,
          description:
            "Your upcoming shifts, recurring schedule, and a calendar subscription URL.",
        },
      ],
    });
  }

  // Pinned to the sidebar footer by ProfilePage via footerGroupIds.
  groups.push({
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
  });

  return groups;
}

/** Nav group IDs that ProfilePage pins to the sidebar footer. */
export const PROFILE_FOOTER_GROUP_IDS = ["legal"];

export function getDefaultProfileSection(): ProfileSectionId {
  return "profile";
}
