"use client";

import {
  DashboardIcon,
  ScheduleIcon,
} from "@/components/icons/NavIcons";
import type { ShellNavGroup, ShellNavItem } from "@/components/settings/SettingsShell";

export type ProfileSectionId = "overview" | "schedule";

export const VALID_PROFILE_SECTIONS: ProfileSectionId[] = ["overview", "schedule"];

export function resolveProfileSection(raw: string | null): ProfileSectionId | null {
  if (!raw) return null;
  return VALID_PROFILE_SECTIONS.includes(raw as ProfileSectionId)
    ? (raw as ProfileSectionId)
    : null;
}

export function buildProfileNavGroups(): ShellNavGroup<ProfileSectionId>[] {
  const items: ShellNavItem<ProfileSectionId>[] = [
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
  ];

  return [{ id: "work", label: "My work", items }];
}

export function getDefaultProfileSection(): ProfileSectionId {
  return "overview";
}
