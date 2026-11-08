import {
  GRIDMASTER_POST_LOGIN_DESTINATION,
  parseInternalDestination,
  POST_LOGIN_DESTINATION,
} from "@/lib/auth/integrity-contract";

/**
 * The page someone was on when they were signed out for inactivity, so signing
 * back in returns them there. Per tab and per host (sessionStorage), and only
 * for the same person. Not `dg_`: the sign-out sweep on /goodbye clears those.
 */
const KEY = "dg-return-after-sign-in";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const DESTINATION_BASE = "https://destination.invalid";

const AUTH_PAGES = [
  "/login",
  "/goodbye",
  "/accept-terms",
  "/accept-invite",
  "/forgot-password",
  "/reset-password",
  "/auth",
];

interface StoredReturnPage {
  page: string;
  userId: string;
  at: number;
}

function pathnameOf(destination: string): string {
  return new URL(destination, DESTINATION_BASE).pathname;
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((prefix) => isUnder(pathname, prefix));
}

export function rememberPageForSignIn(userId: string, page: string, now = Date.now()): void {
  const safePage = parseInternalDestination(page, "");
  if (!userId || !safePage || isAuthPage(pathnameOf(safePage))) return;
  try {
    const stored: StoredReturnPage = { page: safePage, userId, at: now };
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage unavailable: they land on the usual home instead.
  }
}

function takeStored(): StoredReturnPage | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredReturnPage>;
    if (
      typeof value.page !== "string" ||
      typeof value.userId !== "string" ||
      typeof value.at !== "number"
    ) {
      return null;
    }
    return { page: value.page, userId: value.userId, at: value.at };
  } catch {
    return null;
  }
}

/**
 * Where a sign-in should go: the remembered page in place of the home page,
 * through the terms page when it is in the way. Always consumes the entry, so
 * someone else signing in here clears it.
 */
export function takeReturnDestination(
  destination: string,
  userId: string | null | undefined,
  now = Date.now(),
): string {
  const stored = takeStored();
  if (!stored || !userId || stored.userId !== userId) return destination;
  if (now - stored.at > MAX_AGE_MS || now < stored.at) return destination;

  const page = parseInternalDestination(stored.page, "");
  if (!page) return destination;
  const pagePath = pathnameOf(page);
  if (isAuthPage(pagePath)) return destination;

  const target = new URL(destination, DESTINATION_BASE);
  const viaTerms = target.pathname === "/accept-terms";
  const home = viaTerms ? target.searchParams.get("next") : destination;
  if (home !== POST_LOGIN_DESTINATION && home !== GRIDMASTER_POST_LOGIN_DESTINATION) {
    return destination;
  }
  // A Gridmaster returns only within the portal, and anyone else only outside it.
  const inPortal = isUnder(pagePath, GRIDMASTER_POST_LOGIN_DESTINATION);
  if (inPortal !== (home === GRIDMASTER_POST_LOGIN_DESTINATION)) return destination;

  return viaTerms ? `/accept-terms?next=${encodeURIComponent(page)}` : page;
}
