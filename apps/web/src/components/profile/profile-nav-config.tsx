"use client";

import {
  ProfileIcon,
  ShieldIcon,
  NotificationsIcon,
  DashboardIcon,
  ScheduleIcon,
} from "@/components/icons/NavIcons";
import type { ShellNavGroup, ShellNavItem } from "@/components/settings/SettingsShell";

export type ProfileSectionId =
  | "profile"
  | "security"
  | "notifications"
  | "overview"
  | "schedule";

export const VALID_PROFILE_SECTIONS: ProfileSectionId[] = [
  "profile",
  "security",
  "notifications",
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
  /** Whether the user has a linked employee record (drives the My work group). */
  hasEmployee: boolean;
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
        "Choose how and when DubGrid contacts you, plus cookie preferences for this device.",
    },
  ];

  const groups: ShellNavGroup<ProfileSectionId>[] = [
    { id: "account", label: "Account", items: accountItems },
  ];

  if (ctx.hasEmployee) {
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

  return groups;
}

export function getDefaultProfileSection(): ProfileSectionId {
  return "profile";
}
