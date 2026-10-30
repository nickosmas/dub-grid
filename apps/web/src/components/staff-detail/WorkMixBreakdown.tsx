"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import type { WorkMixEntry } from "@/lib/staff-detail-stats";

// Categorical slots in fixed order, validated for color-vision deficiency on
// each theme's surface. Light-mode aqua, yellow and pink sit under 3:1 against
// white, so every segment is also named in its row.
const SLOT_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
const OTHER_COLOR = "var(--dg-color-text-faint)";

interface WorkMixBreakdownProps {
  mix: WorkMixEntry[];
  /** "in September", as the rest of the tab words the period. */
  periodPhrase: string;
  /** "What they work", or "What you work" on your own profile. */
  title?: string;
}

/**
 * What someone worked in the period, by shift and job: one bar split by share
 * when there's more than one kind, and a row for each.
 */
export function WorkMixBreakdown({
  mix,
  periodPhrase,
  title = "What they work",
}: WorkMixBreakdownProps) {
  const { resolvedTheme } = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const total = mix.reduce((sum, item) => sum + item.count, 0);
  const several = mix.length > 1;
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

  if (total === 0) return null;

  const details = (item: WorkMixEntry) =>
    [showFocusArea ? item.focusAreaName : null, item.jobName].filter(Boolean).join(" · ");
  const describe = (item: WorkMixEntry) =>
    `${item.shiftName}${showFocusArea && item.focusAreaName ? ` in ${item.focusAreaName}` : ""}${item.jobName ? ` as ${item.jobName}` : ""}: ${item.count} ${item.count === 1 ? "shift" : "shifts"}, ${item.share}%`;

  return (
    <div className="flex flex-col gap-3" aria-label={`${title} ${periodPhrase}`} role="group">
      <div className="text-[13px] font-medium text-[var(--dg-color-text-secondary)]">{title}</div>

      {several ? (
        <div
          role="img"
          aria-label={mix.map(describe).join("; ")}
          className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
          onMouseLeave={() => setActive(null)}
        >
          {mix.map((item) => (
            <div
              key={item.key}
              onMouseEnter={() => setActive(item.key)}
              className="h-full min-w-[4px] transition-opacity duration-150"
              style={{
                flexGrow: item.count,
                flexBasis: 0,
                background: colorByKey.get(item.key),
                opacity: active && active !== item.key ? 0.3 : 1,
              }}
            />
          ))}
        </div>
      ) : null}

      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-x-6 gap-y-1 p-0">
        {mix.map((item) => (
          <li
            key={item.key}
            className={`flex items-start gap-2.5 rounded-[var(--dg-radius-sm)] px-2 py-1.5 -mx-2 ${
              active === item.key ? "bg-[var(--dg-color-bg-secondary)]" : ""
            }`}
            onMouseEnter={() => setActive(item.key)}
            onMouseLeave={() => setActive(null)}
          >
            {several ? (
              <span
                aria-hidden
                className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: colorByKey.get(item.key) }}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                {item.shiftName}
              </span>
              {details(item) || item.time ? (
                <span className="dg-tabular-nums block text-[13px] text-[var(--dg-color-text-subtle)]">
                  {details(item)}
                  {details(item) && item.time ? " · " : null}
                  {item.time ? <span className="whitespace-nowrap">{item.time}</span> : null}
                </span>
              ) : null}
            </span>
            <span className="dg-tabular-nums shrink-0 text-right">
              <span className="block text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
                {item.count} {item.count === 1 ? "shift" : "shifts"}
              </span>
              {several ? (
                <span className="block text-[13px] text-[var(--dg-color-text-subtle)]">
                  {item.share}%
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
