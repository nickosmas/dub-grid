"use client";

import { CalendarCog, Repeat } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import type { ShiftSeriesPattern } from "@/types";
import {
  buildSeriesCalendar,
  describeSeriesPattern,
  formatSeriesSpan,
  seriesDayPosition,
} from "@/lib/series-summary";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

interface SeriesSummaryCardProps {
  /** The day the panel is open on ("YYYY-MM-DD"). */
  date: string;
  pattern: ShiftSeriesPattern | null;
  status: "loading" | "failed" | "ready" | "unavailable";
  /** What every day of the series holds, for a day changed on its own. */
  seriesItemText: string | null;
}

const card: React.CSSProperties = {
  background: "var(--dg-color-surface)",
  border: "1px solid var(--dg-color-border)",
  borderRadius: "var(--dg-radius-lg)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

function Heading({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: "var(--dg-radius-md)",
          background: "var(--dg-color-primary-bg)",
          color: "var(--dg-color-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Repeat size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--dg-fs-body)",
            fontWeight: 600,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            className="dg-tabular-nums"
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "var(--dg-color-text-muted)",
              marginTop: 2,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
      {badge ? (
        <div
          className="dg-tabular-nums"
          style={{
            flexShrink: 0,
            fontSize: "var(--dg-fs-footnote)",
            fontWeight: 600,
            color: "var(--dg-color-text-muted)",
            background: "var(--dg-color-surface-alt)",
            borderRadius: "var(--dg-radius-sm)",
            padding: "4px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {badge}
        </div>
      ) : null}
    </div>
  );
}

function LegendSwatch({
  background,
  size = 10,
  outlined = false,
}: {
  background: string;
  size?: number;
  outlined?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        background,
        flexShrink: 0,
        boxSizing: "border-box",
        border: outlined ? "1px solid var(--dg-color-border-strong)" : undefined,
      }}
    />
  );
}

/** How often a repeating item repeats, its days, and where this day sits in it. */
export function SeriesSummaryCard({
  date,
  pattern,
  status,
  seriesItemText,
}: SeriesSummaryCardProps) {
  if (status !== "ready" || !pattern) {
    return (
      <div style={card}>
        <Heading
          title="Repeating"
          subtitle={
            status === "loading"
              ? "Loading its dates…"
              : status === "failed"
                ? "We couldn't load its dates."
                : null
          }
        />
      </div>
    );
  }

  const position = seriesDayPosition(pattern.occurrenceDates, date);
  const calendar = buildSeriesCalendar(pattern.occurrenceDates, date, pattern.changedDates);
  const changedHere = pattern.changedDates.includes(date);
  const changedCount = pattern.changedDates.length;

  return (
    <div style={card}>
      <Heading
        title={describeSeriesPattern(pattern)}
        subtitle={formatSeriesSpan(pattern.occurrenceDates)}
        badge={position ? `Day ${position.index} of ${position.total}` : null}
      />

      {changedHere ? (
        <Banner tone="warning" icon={CalendarCog}>
          <span>
            Changed on this day only.
            {seriesItemText ? ` The series is ${seriesItemText}.` : null}
          </span>
        </Banner>
      ) : null}

      <div
        role="table"
        aria-label="Days in the series"
        className="dg-tabular-nums"
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        <div
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 4,
            fontSize: "var(--dg-fs-badge)",
            fontWeight: 600,
            color: "var(--dg-color-text-subtle)",
            textAlign: "center",
          }}
        >
          {WEEKDAY_LETTERS.map((letter, index) => (
            <div key={index} role="columnheader">
              {letter}
            </div>
          ))}
        </div>
        {calendar.weeks.map((week) => (
          <div
            key={week[0].date}
            role="row"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 4,
              fontSize: "var(--dg-fs-caption)",
              textAlign: "center",
            }}
          >
            {week.map((day) => (
              <div
                key={day.date}
                role="cell"
                aria-label={`${day.date}${day.isThisDay ? ", this day" : ""}${day.inSeries ? ", in the series" : ""}${day.changedOnItsOwn ? ", changed on its own" : ""}`}
                style={{
                  height: 34,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  lineHeight: 1.1,
                  borderRadius: "var(--dg-radius-md)",
                  background: day.isThisDay
                    ? "var(--dg-color-primary)"
                    : day.inSeries
                      ? "var(--dg-color-primary-bg)"
                      : "transparent",
                  color: day.isThisDay
                    ? "var(--dg-color-text-inverse)"
                    : day.inSeries
                      ? "var(--dg-color-accent-text)"
                      : "var(--dg-color-text-subtle)",
                  fontWeight: day.isThisDay ? 700 : day.inSeries ? 600 : 400,
                }}
              >
                {day.monthLabel ? (
                  <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 600 }}>
                    {day.monthLabel}
                  </span>
                ) : null}
                <span>{day.day}</span>
                {day.changedOnItsOwn ? (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: day.isThisDay
                        ? "var(--dg-color-warning-border)"
                        : "var(--dg-color-warning-text)",
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 14px",
          fontSize: "var(--dg-fs-footnote)",
          color: "var(--dg-color-text-muted)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <LegendSwatch background="var(--dg-color-primary)" />
          This day
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <LegendSwatch background="var(--dg-color-primary-bg)" outlined />
          In the series
        </span>
        {changedCount > 0 ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <LegendSwatch background="var(--dg-color-warning-text)" size={6} />
            Changed on its own ({changedCount})
          </span>
        ) : null}
        {calendar.clipped ? <span>Showing the weeks around this day</span> : null}
      </div>
    </div>
  );
}
