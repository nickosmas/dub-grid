"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/Button";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";

/** A banner holds at most this many buttons, besides its close or Cancel. */
export const MAX_BANNER_BUTTONS = 2;

export interface BannerPeriod {
  key: string;
  /** "10/25 - 10/31": the period only, never who or why. */
  label: string;
  count: number;
  onSelect: () => void;
}

/**
 * Every period gets a button while they fit; past that, the first keeps its
 * button and the rest share one "N more" menu, so the banner never holds more
 * than two.
 */
export function splitBannerPeriods<T>(
  periods: readonly T[],
  max: number = MAX_BANNER_BUTTONS,
): { shown: T[]; more: T[] } {
  if (periods.length <= max) return { shown: [...periods], more: [] };
  return { shown: periods.slice(0, max - 1), more: periods.slice(max - 1) };
}

/**
 * When every period has a button they read in date order. When some go into
 * the menu, the nearest to the period on screen keeps the button and the menu
 * lists the rest nearest first, earlier before later at a tie.
 */
export function orderBannerPeriods<T extends { start: Date }>(
  periods: readonly T[],
  anchor: Date,
  max: number = MAX_BANNER_BUTTONS,
): T[] {
  if (periods.length <= max) {
    return [...periods].sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  // In whole days, so a daylight-saving change in between never breaks a tie.
  const distance = (period: T) =>
    Math.abs(Math.round((period.start.getTime() - anchor.getTime()) / 86_400_000));
  return [...periods].sort(
    (a, b) => distance(a) - distance(b) || a.start.getTime() - b.start.getTime(),
  );
}

/** "Drafts in another week", "Drafts in 3 other pay periods". */
export function otherPeriodsTitle(prefix: string, count: number, noun: string): string {
  return count === 1 ? `${prefix} another ${noun}` : `${prefix} ${count} other ${noun}s`;
}

export function BannerPeriodButtons({
  periods,
  countNoun,
  buttonHint,
}: {
  periods: readonly BannerPeriod[];
  /** What a count counts, for the menu: "draft", "change". */
  countNoun: string;
  buttonHint: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const { shown, more } = splitBannerPeriods(periods);

  return (
    <>
      {shown.map((period) => (
        <Hint key={period.key} content={hint(buttonHint)} side="bottom">
          <Button
            type="button"
            onClick={period.onSelect}
            className="dg-btn dg-btn-secondary dg-btn-sm"
            data-banner-period={period.key}
          >
            <span className="dg-draft-banner-label">
              {period.label} <span className="dg-tabular-nums">({period.count})</span>
            </span>
          </Button>
        </Hint>
      ))}
      {more.length > 0 ? (
        <>
          <Button
            ref={moreRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="dg-btn dg-btn-secondary dg-btn-sm"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-banner-more={more.length}
          >
            <span className="dg-draft-banner-label">{more.length} more</span>
            <ChevronDown aria-hidden size={14} />
          </Button>
          {menuOpen ? (
            <Menu
              open
              onOpenChange={(nextOpen) => {
                if (!nextOpen) setMenuOpen(false);
              }}
            >
              <MenuContent
                anchor={moreRef}
                side="bottom"
                align="end"
                sideOffset={6}
                positionMethod="fixed"
                collisionPadding={8}
                collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
                finalFocus={moreRef}
                style={{ minWidth: 220 }}
              >
                {more.map((period) => (
                  <MenuItem
                    key={period.key}
                    data-banner-period={period.key}
                    onClick={() => {
                      setMenuOpen(false);
                      period.onSelect();
                    }}
                  >
                    <span style={{ flex: 1 }}>{period.label}</span>
                    <span
                      className="dg-tabular-nums"
                      style={{ color: "var(--dg-color-text-secondary)" }}
                    >
                      {period.count} {countNoun}
                      {period.count === 1 ? "" : "s"}
                    </span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          ) : null}
        </>
      ) : null}
    </>
  );
}
