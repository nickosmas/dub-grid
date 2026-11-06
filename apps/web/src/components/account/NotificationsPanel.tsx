"use client";

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
    <div className="dg-card-body">
      <NotificationPreferences
        visibleCategories={notificationCategoriesForRole({ isGridmaster, isSuperAdmin })}
      />
    </div>
  );
}
