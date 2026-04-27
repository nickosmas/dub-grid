"use client";

import { useState, useEffect } from "react";
import ExpandButton from "./ExpandButton";
import {
  chartTooltipContentStyle,
  chartTooltipWrapperStyle,
} from "./chartTooltipStyles";

interface TrendsCardProps {
  periodStats: Array<{
    week: string;
    coveragePct: number;
    staffScheduled: number;
    totalSlots: number;
  }>;
  onExpand?: () => void;
  isMobile?: boolean;
}

export default function TrendsCard({
  periodStats,
  onExpand,
  isMobile = false,
}: TrendsCardProps) {
  const [mod, setMod] = useState<typeof import("./RechartsComponents")>();

  useEffect(() => {
    import("./RechartsComponents").then(setMod);
  }, []);

  if (!mod) {
    return (
      <div className="dg-card" style={{ minHeight: 200 }}>
        <div className="dg-card-header">
          <h3 className="dg-card-title">Coverage Trend</h3>
        </div>
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--color-text-subtle)",
          }}
        >
          Loading chart...
        </div>
      </div>
    );
  }

  const {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
  } = mod;

  const data = periodStats.map((s) => ({
    week: s.week,
    coverage: s.coveragePct,
    staffed: s.staffScheduled,
    slots: s.totalSlots,
  }));

  const avgCoverage =
    data.length > 0
      ? Math.round(data.reduce((sum, d) => sum + d.coverage, 0) / data.length)
      : 0;

  const trend =
    data.length >= 2 ? data[data.length - 1].coverage - data[0].coverage : 0;

  const trendLabel = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";
  const trendColor =
    trend > 0
      ? "var(--color-success)"
      : trend < 0
        ? "var(--color-warning)"
        : "var(--color-text-secondary)";

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <h3 className="dg-card-title">Trends</h3>
          <p
            style={{
              fontSize: "var(--dg-fs-small)",
              color: "var(--color-text-secondary)",
              marginTop: 2,
            }}
          >
            Coverage trends over time
          </p>
        </div>
        {onExpand && <ExpandButton onClick={onExpand} />}
      </div>

      <div style={{ padding: `0 var(--dg-space-lg) var(--dg-space-lg)` }}>
        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--dg-space-md)",
            marginBottom: "var(--dg-space-lg)",
          }}
        >
          <div
            style={{
              padding: "var(--dg-space-sm)",
              background: "var(--color-bg-secondary)",
              borderRadius: "var(--dg-radius-sm)",
              fontSize: 12,
            }}
          >
            <div
              style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}
            >
              Average
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              {avgCoverage}%
            </div>
          </div>
          <div
            style={{
              padding: "var(--dg-space-sm)",
              background: "var(--color-bg-secondary)",
              borderRadius: "var(--dg-radius-sm)",
              fontSize: 12,
            }}
          >
            <div
              style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}
            >
              Trend
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: trendColor }}>
              {trendLabel} {Math.abs(trend).toFixed(1)}%
            </div>
          </div>
          <div
            style={{
              padding: "var(--dg-space-sm)",
              background: "var(--color-bg-secondary)",
              borderRadius: "var(--dg-radius-sm)",
              fontSize: 12,
            }}
          >
            <div
              style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}
            >
              Weeks
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              {data.length}
            </div>
          </div>
        </div>

        {data.length >= 2 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "1fr"
                : "minmax(0, 1.6fr) minmax(0, 1fr)",
              gap: "var(--dg-space-lg)",
              alignItems: "stretch",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={chartLabelStyle}>Coverage rate</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={data}
                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border-light)"
                  />
                  <XAxis
                    dataKey="week"
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-text-secondary)",
                    }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-text-secondary)",
                    }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value ?? 0).toFixed(1)}%`,
                    ]}
                    contentStyle={chartTooltipContentStyle}
                    wrapperStyle={chartTooltipWrapperStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="coverage"
                    stroke="var(--color-info)"
                    strokeWidth={2}
                    dot={{ fill: "var(--color-info)", r: 5 }}
                    activeDot={{ r: 7 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={chartLabelStyle}>Staffed vs required</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={data}
                  margin={{ top: 5, right: 0, left: -10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border-light)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="week"
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-text-secondary)",
                    }}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-text-secondary)",
                    }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      Number(value ?? 0),
                      name === "staffed" ? "Staffed" : "Required",
                    ]}
                    contentStyle={chartTooltipContentStyle}
                    wrapperStyle={chartTooltipWrapperStyle}
                  />
                  <Bar
                    dataKey="slots"
                    fill="var(--color-border)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="staffed"
                    fill="var(--color-brand)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div
            style={{
              minHeight: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-subtle)",
            }}
          >
            Not enough data to display trend
          </div>
        )}
      </div>
    </div>
  );
}

const chartLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-text-subtle)",
  marginBottom: 8,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};
