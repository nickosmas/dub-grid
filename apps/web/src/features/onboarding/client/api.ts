"use client";

import { formatClientErrorMessage } from "@/lib/client-facing";

export interface OnboardingStatus {
  completed: boolean;
  completedAt: string | null;
  tooltipToursCompleted: Record<string, string>;
}

function resolveClientUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

async function requestOnboardingJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(
      formatClientErrorMessage(body?.error, "Onboarding request failed."),
    );
  }

  return body as T;
}

export function fetchOnboardingStatus(orgId: string): Promise<OnboardingStatus> {
  const params = new URLSearchParams({ orgId });
  return requestOnboardingJson<OnboardingStatus>(`/api/onboarding?${params}`);
}

export function completeOnboarding(orgId: string): Promise<{ success: true }> {
  return requestOnboardingJson<{ success: true }>("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}
