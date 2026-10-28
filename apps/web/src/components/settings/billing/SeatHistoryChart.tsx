"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Button } from "@/components/Button";
import { SpanTabs } from "@/components/ui/span-tabs";
import { formatMoney } from "@/features/billing/overview";
import {
  describeSeatHistory,
  describeSeatHistoryMonth,
  monthLabel,
} from "@/features/billing/seat-history";
import { tdStyle, thStyle } from "@/lib/styles";
import type { SeatHistoryMonth } from "@/types";
import { EVEN_TABS, BillingCard, FooterActions, FooterNote, IconTile } from "./billing-ui";

type Range = "3" | "6" | "all";

const DEFAULT_WIDTH = 640;
const HEIGHT = 200;
const LEFT = 34;
const RIGHT = 12;
const TOP = 18;
const BOTTOM = 26;

function niceMax(value: number): number {
  const step = value <= 20 ? 5 : value <= 60 ? 10 : value <= 200 ? 25 : 100;
  return Math.max(step, Math.ceil((value * 1.1) / step) * step);
}

function Legend({ hatchId }: { hatchId: string }) {
  const item = (swatch: React.ReactNode, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {swatch}
      {label}
    </span>
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        margin: "0 0 8px",
        fontSize: "var(--dg-fs-caption)",
        color: "var(--dg-color-text-muted)",
      }}
    >
      {item(
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: "color-mix(in srgb, var(--dg-color-primary) 45%, transparent)",
          }}
        />,
        "Seats in use and paid for",
      )}
      {item(
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            border: "1.5px solid var(--dg-color-primary)",
          }}
        />,
        "Paid seats",
      )}
      {item(
        <svg width={10} height={10} aria-hidden="true">
          <rect width={10} height={10} rx={3} fill={`url(#${hatchId})`} />
        </svg>,
        "Seats in use, not paid for yet",
      )}
    </div>
  );
}

/** The element's drawn width, so the chart's text stays its real size on a phone. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function Columns({ months, hatchId }: { months: SeatHistoryMonth[]; hatchId: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [wrapRef, WIDTH] = useWidth<HTMLDivElement>();
  const max = niceMax(
    Math.max(...months.map((entry) => Math.max(entry.paidSeats ?? 0, entry.seatsInUse ?? 0)), 1),
  );
  const slot = (WIDTH - LEFT - RIGHT) / months.length;
  const barWidth = Math.min(40, slot * 0.56);
  const y = (value: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - value / max);
  const base = y(0);
  const ticks = [0, max / 2, max];
  const active = hovered == null ? null : months[hovered];

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={describeSeatHistory(months) ?? "Seats in use and paid seats by month"}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <pattern
            id={hatchId}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill="var(--dg-color-warning-bg)" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="var(--dg-color-warning)" strokeWidth={2} />
          </pattern>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--dg-color-border-light)"
            />
            <text
              x={LEFT - 8}
              y={y(tick) + 4}
              textAnchor="end"
              style={{ fontSize: "var(--dg-fs-caption)", fill: "var(--dg-color-text-muted)" }}
            >
              {tick}
            </text>
          </g>
        ))}
        {months.map((entry, index) => {
          const center = LEFT + slot * (index + 0.5);
          const x = center - barWidth / 2;
          const paid = entry.paidSeats;
          const inUse = entry.seatsInUse;
          const covered = inUse == null ? 0 : paid == null ? inUse : Math.min(inUse, paid);
          const top = Math.min(y(paid ?? 0), y(inUse ?? 0));
          const dim = hovered != null && hovered !== index;
          return (
            <g key={entry.month} opacity={dim ? 0.5 : 1}>
              {paid != null && (
                <rect
                  x={x}
                  y={y(paid)}
                  width={barWidth}
                  height={base - y(paid)}
                  rx={5}
                  fill="var(--dg-color-surface)"
                  stroke="var(--dg-color-primary)"
                  strokeWidth={1.5}
                  strokeDasharray={inUse != null && inUse < paid ? "4 3" : undefined}
                />
              )}
              {covered > 0 && (
                <rect
                  x={x}
                  y={y(covered)}
                  width={barWidth}
                  height={base - y(covered)}
                  rx={5}
                  fill="var(--dg-color-primary)"
                  fillOpacity={entry.isCurrent ? 1 : 0.45}
                />
              )}
              {inUse != null && paid != null && inUse > paid && (
                <rect
                  x={x}
                  y={y(inUse)}
                  width={barWidth}
                  height={y(paid) - y(inUse)}
                  rx={3}
                  fill={`url(#${hatchId})`}
                  stroke="var(--dg-color-warning)"
                />
              )}
              <text
                x={center}
                y={top - 6}
                textAnchor="middle"
                className="dg-tabular-nums"
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  fill:
                    inUse == null ? "var(--dg-color-text-muted)" : "var(--dg-color-text-primary)",
                }}
              >
                {inUse ?? paid ?? ""}
              </text>
              <text
                x={center}
                y={HEIGHT - 6}
                textAnchor="middle"
                style={{
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: entry.isCurrent ? 600 : 400,
                  fill: entry.isCurrent
                    ? "var(--dg-color-text-primary)"
                    : "var(--dg-color-text-muted)",
                }}
              >
                {monthLabel(entry.month, "short")}
              </text>
              <rect
                x={LEFT + slot * index}
                y={0}
                width={slot}
                height={HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHovered(index)}
              />
            </g>
          );
        })}
      </svg>
      {active && hovered != null && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 4,
            left: `clamp(0px, calc(${((LEFT + slot * (hovered + 0.5)) / WIDTH) * 100}% - 120px), calc(100% - 240px))`,
            width: 240,
            pointerEvents: "none",
            background: "var(--dg-color-surface)",
            border: "1px solid var(--dg-color-border)",
            borderRadius: "var(--dg-radius-lg)",
            boxShadow: "0 6px 20px var(--dg-color-shadow)",
            padding: "10px 12px",
            fontSize: "var(--dg-fs-caption)",
            lineHeight: 1.45,
            color: "var(--dg-color-text-secondary)",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-primary)",
            }}
          >
            {monthLabel(active.month, "long")}
            {active.isCurrent ? ", so far" : ""}
          </div>
          {describeSeatHistoryMonth(active)}
          {active.paidCents > 0 && active.currency
            ? ` ${formatMoney(active.paidCents, active.currency)} was paid that month.`
            : ""}
        </div>
      )}
    </div>
  );
}

function HistoryTable({ months }: { months: SeatHistoryMonth[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Month</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Seats in use</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Paid seats</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Paid that month</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((entry) => (
            <tr key={entry.month}>
              <td style={tdStyle}>
                {monthLabel(entry.month, "long")}
                {entry.isCurrent ? " (so far)" : ""}
              </td>
              <td
                className="dg-tabular-nums"
                style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}
              >
                {entry.seatsInUse ?? "Not counted"}
              </td>
              <td className="dg-tabular-nums" style={{ ...tdStyle, textAlign: "right" }}>
                {entry.paidSeats ?? "None"}
              </td>
              <td className="dg-tabular-nums" style={{ ...tdStyle, textAlign: "right" }}>
                {entry.paidCents > 0 && entry.currency
                  ? formatMoney(entry.paidCents, entry.currency)
                  : "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SeatHistoryChart({ history }: { history: SeatHistoryMonth[] }) {
  const hatchId = `seat-hatch-${useId().replace(/:/g, "")}`;
  const [range, setRange] = useState<Range>("6");
  const [asTable, setAsTable] = useState(false);
  const months = range === "all" ? history : history.slice(-Number(range));
  const caption = describeSeatHistory(months);
  const starts = history[0] ? monthLabel(history[0].month, "long") : null;

  return (
    <BillingCard
      icon="seat"
      title="Seats over time"
      headingId="billing-seat-history-heading"
      aside={
        history.length > 3 ? (
          <SpanTabs<Range>
            aria-label="Months shown"
            className={EVEN_TABS}
            value={range}
            onChange={setRange}
            items={[
              { value: "3", label: "3 months" },
              { value: "6", label: "6 months" },
              { value: "all", label: "All months" },
            ]}
          />
        ) : null
      }
      footer={
        history.length > 0 ? (
          <>
            <FooterNote>
              Seat history starts in {starts}, when your subscription began. Hover over or tap a
              month to see its details.
            </FooterNote>
            <FooterActions>
              <Button
                type="button"
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => setAsTable(!asTable)}
              >
                {asTable ? (
                  <BarChart3 size={14} aria-hidden="true" />
                ) : (
                  <Table2 size={14} aria-hidden="true" />
                )}
                {asTable ? "View as chart" : "View as table"}
              </Button>
            </FooterActions>
          </>
        ) : null
      }
    >
      <div style={{ padding: 20 }}>
        {history.length === 0 ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <IconTile icon="seat" tone="neutral" />
            <span
              style={{
                fontSize: "var(--dg-fs-label)",
                color: "var(--dg-color-text-muted)",
                lineHeight: 1.5,
              }}
            >
              Seat history begins when your subscription starts. Each month will show how many seats
              were in use and how many were paid for.
            </span>
          </div>
        ) : (
          <>
            {caption && (
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: "var(--dg-fs-label)",
                  color: "var(--dg-color-text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {caption} Paid seats follow them when DubGrid Support updates your subscription, so
                the two can differ for a while after someone joins or leaves.
              </p>
            )}
            {asTable ? (
              <HistoryTable months={months} />
            ) : (
              <>
                <Legend hatchId={hatchId} />
                <Columns months={months} hatchId={hatchId} />
              </>
            )}
          </>
        )}
      </div>
    </BillingCard>
  );
}
