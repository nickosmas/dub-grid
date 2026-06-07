"use client";

import { SectionCard } from "@/components/settings/shared";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";

interface NotificationsPanelProps {
  /** Gridmasters only see the "system" category. */
  isGridmaster: boolean;
}

export function NotificationsPanel({ isGridmaster }: NotificationsPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <NotificationPreferences
          visibleCategories={isGridmaster ? ["system"] : undefined}
        />
      </SectionCard>
    </div>
  );
}
