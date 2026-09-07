"use client";

import type { ReactNode } from "react";
import { CalendarDays, Layers, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ActivityCategoryCount } from "@/lib/activity-log-utils";

interface ActivityPeriodStatsProps {
  total: number;
  dayCount: number;
  actorCount: number;
  categories: ActivityCategoryCount[];
  /** "this week", "in August 2026". Names the period the counts cover. */
  periodPhrase: string;
  /** The period held more events than one page. */
  truncated?: boolean;
  pageSize?: number;
}

export function ActivityPeriodStats({
  total,
  dayCount,
  actorCount,
  categories,
  periodPhrase,
  truncated = false,
  pageSize,
}: ActivityPeriodStatsProps) {
  const topCategory = categories[0] ?? null;

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatBox
        label={truncated && pageSize ? `Latest ${pageSize} events` : "Events"}
        value={total}
        caption={periodPhrase}
        icon={<TrendingUp size={18} />}
        tone="brand"
      />
      <StatBox
        label="Days with activity"
        value={dayCount}
        caption={dayCount === 1 ? "1 day" : `${dayCount} days`}
        icon={<CalendarDays size={18} />}
      />
      <StatBox
        label="People involved"
        value={actorCount}
        caption={actorCount === 1 ? "1 person" : `${actorCount} people`}
        icon={<Users size={18} />}
      />
      <StatBox
        label="Most common"
        value={topCategory?.count ?? 0}
        caption={topCategory?.label ?? "Nothing recorded"}
        icon={<Layers size={18} />}
      />
    </div>
  );
}

function StatBox({
  label,
  value,
  caption,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  caption: string;
  icon: ReactNode;
  tone?: "brand" | "neutral";
}) {
  const isBrand = tone === "brand";

  return (
    <Card
      size="sm"
      data-stat-card
      className={`h-full ${
        isBrand ? "border-[var(--dg-color-brand-border)]" : "border-[var(--dg-color-border-light)]"
      }`}
      aria-label={`${label}: ${value}, ${caption}`}
    >
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="dg-type-field-title">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="truncate text-[length:var(--dg-fs-footnote)] text-[var(--dg-color-text-muted)]">
            {caption}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isBrand
              ? "bg-[var(--dg-color-brand-bg)] text-[var(--dg-color-brand)]"
              : "bg-[var(--dg-color-bg-secondary)] text-[var(--dg-color-text-subtle)]"
          }`}
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
