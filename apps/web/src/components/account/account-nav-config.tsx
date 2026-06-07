"use client";

import {
  ProfileIcon,
  ShieldIcon,
  NotificationsIcon,
  PrivacyIcon,
  OrganizationsIcon,
} from "@/components/icons/NavIcons";
import type { ShellNavGroup, ShellNavItem } from "@/components/settings/SettingsShell";

export type AccountSectionId =
  | "profile"
  | "security"
  | "notifications"
  | "privacy"
  | "organizations";

export const VALID_ACCOUNT_SECTIONS: AccountSectionId[] = [
  "profile",
  "security",
  "notifications",
  "privacy",
  "organizations",
];

export function resolveAccountSection(raw: string | null): AccountSectionId | null {
  if (!raw) return null;
  return VALID_ACCOUNT_SECTIONS.includes(raw as AccountSectionId)
    ? (raw as AccountSectionId)
    : null;
}

export interface AccountNavContext {
  /** When true, render the Organizations section (only when the user has 2+ orgs). */
  hasMultipleOrganizations: boolean;
}

export function buildAccountNavGroups(
  ctx: AccountNavContext = { hasMultipleOrganizations: false },
): ShellNavGroup<AccountSectionId>[] {
  const account: ShellNavItem<AccountSectionId>[] = [
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
        "Choose how and when DubGrid contacts you across email, push, and in-app.",
    },
    {
      id: "privacy",
      label: "Privacy & data",
      Icon: PrivacyIcon,
      description:
        "Review policies, manage cookie preferences, and request account deletion.",
    },
  ];

  const groups: ShellNavGroup<AccountSectionId>[] = [
    { id: "account", label: "Account", items: account },
  ];

  if (ctx.hasMultipleOrganizations) {
    groups.push({
      id: "memberships",
      label: "Memberships",
      items: [
        {
          id: "organizations",
          label: "Organizations",
          Icon: OrganizationsIcon,
          description:
            "Switch between the organizations you belong to or leave one.",
        },
      ],
    });
  }

  return groups;
}

export function getDefaultAccountSection(): AccountSectionId {
  return "profile";
}
