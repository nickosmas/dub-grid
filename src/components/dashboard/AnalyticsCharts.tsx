"use client";

import { useState, useEffect, useCallback } from "react";
import * as Sentry from "@/lib/sentry";
import {
  fetchWeeklyShiftHours,
  fetchEmployeeUtilization,
  type WeeklyShiftHours,
  type EmployeeUtilization,
} from "@/lib/analytics";

type RechartsModule = typeof import("./RechartsComponents");

// Lazy-load all recharts components as a single chunk
function RechartsProvider({ children }: { children: (components: RechartsModule) => React.ReactNode }) {
  const [mod, setMod] = useState<RechartsModule | null>(null);
  useEffect(() => {
    import("./RechartsComponents").then(setMod);
  }, []);
  if (!mod) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>Loading charts...</div>
  );
  return <>{children(mod)}</>;
}

const RANGE_OPTIONS = [
  { label: "4 weeks", value: 4 },
  { label: "3 months", value: 13 },
  { label: "6 months", value: 26 },
  { label: "1 year", value: 52 },
] as const;

export default function AnalyticsCharts({ orgId }: { orgId: string }) {
  const [weeks, setWeeks] = useState(13);
  const [hoursData, setHoursData] = useState<WeeklyShiftHours[]>([]);
  const [utilData, setUtilData] = useState<EmployeeUtilization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hours, util] = await Promise.all([
        fetchWeeklyShiftHours(orgId, weeks),
        fetchEmployeeUtilization(orgId, weeks),
      ]);
      setHoursData(hours);
      setUtilData(util);
    } catch (err) {
      Sentry.captureException(err, {
        extra: { context: "dashboard-analytics-charts", orgId, weeks },
      });
      setHoursData([]);
      setUtilData([]);
      setError("Analytics are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [orgId, weeks]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = hoursData.map((w) => ({
    week: new Date(w.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    hours: Math.round(w.totalHours),
    shifts: w.shiftCount,
  }));

  const utilChartData = utilData.map((e) => ({
    name: e.employeeName.length > 15 ? e.employeeName.slice(0, 14) + "..." : e.employeeName,
    hours: e.totalHours,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Range selector */}
      <div style={{ display: "flex", gap: 6 }}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`dg-btn dg-btn-sm ${weeks === opt.value ? "dg-btn-primary" : "dg-btn-secondary"}`}
            onClick={() => setWeeks(opt.value)}
            style={{ fontSize: "var(--dg-fs-caption)" }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>
          Loading analytics...
        </div>
      ) : error ? (
        <div
          style={{
            padding: 24,
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-muted)",
          }}
        >
          {error}
        </div>
      ) : (
        <RechartsProvider>
          {({ LineChart, BarChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer }) => (
            <>
              {/* Shift Hours Trend */}
              <div style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--dg-radius-md)",
                padding: 20,
              }}>
                <h3 style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: "0 0 16px",
                }}>
                  Weekly Shift Hours
                </h3>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="var(--color-brand)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Hours"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>
                    No shift data for the selected period
                  </div>
                )}
              </div>

              {/* Employee Utilization */}
              <div style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--dg-radius-md)",
                padding: 20,
              }}>
                <h3 style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: "0 0 16px",
                }}>
                  Top Employee Utilization
                </h3>
                {utilChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(200, utilChartData.length * 32)}>
                    <BarChart data={utilChartData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={95} />
                      <Tooltip />
                      <Bar dataKey="hours" fill="var(--color-brand)" radius={[0, 4, 4, 0]} name="Hours" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>
                    No utilization data for the selected period
                  </div>
                )}
              </div>
            </>
          )}
        </RechartsProvider>
      )}
    </div>
  );
}
