"use client";

import type { DashboardAnalyticsResponse } from "../shared/analytics";

async function requestJson<T>(input: string): Promise<T> {
  const response = await fetch(input);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Dashboard request failed.",
    );
  }

  return body as T;
}

export function fetchDashboardAnalytics(input: {
  orgId: string;
  weeks: number;
}): Promise<DashboardAnalyticsResponse> {
  const params = new URLSearchParams({
    orgId: input.orgId,
    weeks: String(input.weeks),
  });

  return requestJson<DashboardAnalyticsResponse>(
    `/api/dashboard/analytics?${params.toString()}`,
  );
}
