"use client";

import { EmptyState } from "@/components/EmptyState";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { ChartPie } from "lucide-react";
import { Button } from "@/components/Button";
import type { WorkMixEntry } from "@/lib/staff-detail-stats";

// Categorical slots in fixed order, validated for color-vision deficiency on
// each theme's surface. Light-mode aqua, yellow and pink sit under 3:1 against
// white, so every slice is also named in the legend and the table view.
const SLOT_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
const OTHER_COLOR = "var(--dg-color-text-faint)";

const SIZE = 168;
const OUTER = 80;
const INNER = 54;
const GAP = 0.035;

function arcPath(start: number, end: number): string {
  const point = (radius: number, angle: number) =>
    `${SIZE / 2 + radius * Math.sin(angle)} ${SIZE / 2 - radius * Math.cos(angle)}`;
  // An arc that starts and ends on the same point draws nothing, so one
  // slice covering everything is two half rings.
  if (end - start >= Math.PI * 2 - 1e-6) {
    return [arcPath(0, Math.PI), arcPath(Math.PI, Math.PI * 2)].join(" ");
  }
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M ${point(OUTER, start)}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER, end)}`,
    `L ${point(INNER, end)}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${point(INNER, start)}`,
    "Z",
  ].join(" ");
}

interface WorkMixCardProps {
  mix: WorkMixEntry[];
  /** "between Sep 1 and Oct 15", as the rest of the tab words the period. */
  periodPhrase: string;
  /** "What they work", or "What you work" on your own profile. */
  title?: string;
}

/** What someone worked in the period, by shift and job. */
export function WorkMixCard({ mix, periodPhrase, title = "What they work" }: WorkMixCardProps) {
  const { resolvedTheme } = useTheme();
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const total = mix.reduce((sum, item) => sum + item.count, 0);
  // Shift names repeat across focus areas, so name the area once they differ.
  const showFocusArea = new Set(mix.map((item) => item.focusAreaName).filter(Boolean)).size > 1;

  // A pair keeps its color however the counts move: slots follow the pairs'
  // own order (shift, then job), never their rank.
  const colorByKey = useMemo(() => {
    const palette = SLOT_COLORS[resolvedTheme === "dark" ? "dark" : "light"];
    const keys = mix
      .map((item) => item.key)
      .filter((key) => key !== "other")
      .sort();
    return new Map<string, string>([
      ...keys.map((key, index) => [key, palette[index % palette.length]] as [string, string]),
      ["other", OTHER_COLOR],
    ]);
  }, [mix, resolvedTheme]);

  const slices = useMemo(() => {
    let angle = 0;
    return mix.map((item) => {
      const sweep = (item.count / Math.max(total, 1)) * Math.PI * 2;
      const gap = mix.length > 1 ? GAP / 2 : 0;
      const path = arcPath(angle + gap, angle + Math.max(sweep - gap, gap * 2));
      angle += sweep;
      return { item, path };
    });
  }, [mix, total]);

  const focused = mix.find((item) => item.key === active) ?? null;

  return (
    <section className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            <ChartPie className="h-[18px] w-[18px] text-[var(--dg-color-text-muted)]" aria-hidden />
            {title}
          </div>
          <div className="dg-card-subtitle">
            {total > 0
              ? `${total} ${total === 1 ? "shift" : "shifts"} ${periodPhrase}, by shift and job.`
              : `Shifts by shift and job, ${periodPhrase}.`}
          </div>
        </div>
        {total > 0 ? (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={() => setAsTable((value) => !value)}
          >
            {asTable ? "Show as chart" : "Show as table"}
          </Button>
        ) : null}
      </div>

      <div className="dg-card-body">
        {total === 0 ? (
          <EmptyState size="inline" title={`No shifts ${periodPhrase}`} />
        ) : asTable ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--dg-color-border)] text-left">
                <th className="dg-type-table-heading py-2 pr-2 font-medium">Shift</th>
                <th className="dg-type-table-heading py-2 pr-2 font-medium">Job</th>
                <th className="dg-type-table-heading py-2 pr-2 text-right font-medium">Shifts</th>
                <th className="dg-type-table-heading py-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {mix.map((item) => (
                <tr key={item.key} className="border-b border-[var(--dg-color-border-light)]">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-[var(--dg-color-text-primary)]">
                      {item.shiftName}
                      {showFocusArea && item.focusAreaName ? (
                        <span className="font-normal text-[var(--dg-color-text-muted)]">
                          {" "}
                          · {item.focusAreaName}
                        </span>
                      ) : null}
                    </div>
                    {item.time ? (
                      <div className="dg-tabular-nums text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        {item.time}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 text-[var(--dg-color-text-primary)]">
                    {item.jobName ?? <span className="text-[var(--dg-color-text-faint)]">-</span>}
                  </td>
                  <td className="dg-tabular-nums py-2 pr-2 text-right">{item.count}</td>
                  <td className="dg-tabular-nums py-2 text-right">{item.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              width={SIZE}
              height={SIZE}
              role="img"
              aria-label={`${title} ${periodPhrase}`}
              className="shrink-0"
              onMouseLeave={() => setActive(null)}
            >
              {slices.map(({ item, path }) => (
                <path
                  key={item.key}
                  d={path}
                  fill={colorByKey.get(item.key)}
                  opacity={active && active !== item.key ? 0.3 : 1}
                  onMouseEnter={() => setActive(item.key)}
                  className="transition-opacity duration-150"
                >
                  <title>{`${item.shiftName}${showFocusArea && item.focusAreaName ? ` in ${item.focusAreaName}` : ""}${item.jobName ? ` as ${item.jobName}` : ""}: ${item.count} shifts, ${item.share}%`}</title>
                </path>
              ))}
              <text
                x={SIZE / 2}
                y={SIZE / 2 - 2}
                textAnchor="middle"
                className="dg-tabular-nums fill-[var(--dg-color-text-primary)] text-[24px] font-bold"
              >
                {focused ? focused.count : total}
              </text>
              <text
                x={SIZE / 2}
                y={SIZE / 2 + 18}
                textAnchor="middle"
                className="fill-[var(--dg-color-text-subtle)] text-[12px] font-medium"
              >
                {focused ? `${focused.share}% of shifts` : "shifts"}
              </text>
            </svg>

            <ul className="m-0 flex min-w-[220px] flex-1 list-none flex-col gap-1 p-0">
              {mix.map((item) => (
                <li
                  key={item.key}
                  className={`grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--dg-radius-sm)] px-2 py-1.5 ${
                    active === item.key ? "bg-[var(--dg-color-bg-secondary)]" : ""
                  }`}
                  onMouseEnter={() => setActive(item.key)}
                  onMouseLeave={() => setActive(null)}
                >
                  <span
                    aria-hidden
                    className="mt-1 h-2.5 w-2.5 rounded-[2px]"
                    style={{ background: colorByKey.get(item.key) }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-[var(--dg-color-text-primary)]">
                      {item.shiftName}
                      {showFocusArea && item.focusAreaName ? (
                        <span className="font-normal text-[var(--dg-color-text-muted)]">
                          {" "}
                          · {item.focusAreaName}
                        </span>
                      ) : null}
                    </span>
                    {item.jobName ? (
                      <span className="block text-[13px] text-[var(--dg-color-text-muted)]">
                        {item.jobName}
                      </span>
                    ) : null}
                    {item.time ? (
                      <span className="dg-tabular-nums block text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                        {item.time}
                      </span>
                    ) : null}
                  </span>
                  <span className="dg-tabular-nums text-right">
                    <span className="block text-[13px] font-semibold text-[var(--dg-color-text-primary)]">
                      {item.share}%
                    </span>
                    <span className="block text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
                      {item.count} {item.count === 1 ? "shift" : "shifts"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
