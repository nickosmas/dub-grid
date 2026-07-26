"use client";

import { SectionCard } from "@/components/settings/shared";
import {
  NotificationPreferences,
  notificationCategoriesForRole,
} from "@/components/profile/NotificationPreferences";

interface NotificationsPanelProps {
  /** Gridmasters only see the "system" category. */
  isGridmaster: boolean;
  /** Billing & Payments is only shown to super_admins — billing events only target them. */
  isSuperAdmin: boolean;
}

export function NotificationsPanel({ isGridmaster, isSuperAdmin }: NotificationsPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <NotificationPreferences
          visibleCategories={notificationCategoriesForRole({ isGridmaster, isSuperAdmin })}
        />
      </SectionCard>
    </div>
  );
}
