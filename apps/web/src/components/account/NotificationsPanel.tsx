"use client";

import { SectionCard } from "@/components/settings/shared";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";

interface NotificationsPanelProps {
  /** Gridmasters only see the "system" category. */
  isGridmaster: boolean;
}

export function NotificationsPanel({ isGridmaster }: NotificationsPanelProps) {
  return (
    <SectionCard>
      <NotificationPreferences
        visibleCategories={isGridmaster ? ["system"] : undefined}
      />
    </SectionCard>
  );
}
