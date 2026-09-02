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

async function requestOnboardingJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveClientUrl(input), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as Record<string, unknown>)
    : null;

  if (!response.ok) {
    throw new Error(formatClientErrorMessage(body?.error, "Onboarding request failed."));
  }

  return body as T;
}

export function fetchOnboardingStatus(orgId: string): Promise<OnboardingStatus> {
  const params = new URLSearchParams({ orgId });
  return requestOnboardingJson<OnboardingStatus>(`/api/onboarding?${params}`);
}

export interface OnboardingCompletion {
  success: true;
  completedAt: string;
}

export function completeOnboarding(orgId: string): Promise<OnboardingCompletion> {
  return requestOnboardingJson<OnboardingCompletion>("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
}

// ── Same-session completion guard ───────────────────────────────────────────
// The server `onboarding_completed_at` is the cross-session source of truth, but
// right after completing the wizard there's a window where the onboarding-status
// query can be re-read as `completed: false` (a refetch landing before the write
// is reflected), which briefly re-mounts a wizard. This sessionStorage marker is
// set the moment completion succeeds and short-circuits the gate for the rest of
// the session, so onboarding never re-appears after it's been completed here.
function onboardingDoneKey(userId: string, orgId: string): string {
  return `dg_onboarding_done:${userId}:${orgId}`;
}

export function markOnboardingComplete(userId: string, orgId: string): void {
  try {
    sessionStorage.setItem(onboardingDoneKey(userId, orgId), "1");
  } catch {
    // sessionStorage unavailable — fall back to the query cache / server status.
  }
}

export function isOnboardingComplete(userId: string, orgId: string): boolean {
  try {
    return sessionStorage.getItem(onboardingDoneKey(userId, orgId)) === "1";
  } catch {
    return false;
  }
}

// ── Same-session phase freeze ────────────────────────────────────────────────
// The gate picks the wizard variant from `setupStatus.isComplete`: "config"
// (org setup) when incomplete, "orientation" when complete. But a super_admin
// completes the org setup *during* the config wizard, so `isComplete` flips to
// true mid-flow — which would otherwise swap the config wizard out for the
// orientation wizard (the "two wizards in a row" bug). Freezing the phase the
// first time a wizard is shown keeps the user in the wizard they started until
// they actually finish it (which sets the completion guard above).
export type OnboardingPhase = "config" | "orientation";

function onboardingPhaseKey(userId: string, orgId: string): string {
  return `dg_onboarding_phase:${userId}:${orgId}`;
}

export function getOnboardingPhase(userId: string, orgId: string): OnboardingPhase | null {
  try {
    const v = sessionStorage.getItem(onboardingPhaseKey(userId, orgId));
    return v === "config" || v === "orientation" ? v : null;
  } catch {
    return null;
  }
}

/** Freeze the phase only if not already frozen (sticky for the session). */
export function freezeOnboardingPhase(userId: string, orgId: string, phase: OnboardingPhase): void {
  try {
    const key = onboardingPhaseKey(userId, orgId);
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, phase);
  } catch {
    // sessionStorage unavailable — fall back to live status.
  }
}

export function clearOnboardingPhase(userId: string, orgId: string): void {
  try {
    sessionStorage.removeItem(onboardingPhaseKey(userId, orgId));
  } catch {
    // Nothing to clear.
  }
}
