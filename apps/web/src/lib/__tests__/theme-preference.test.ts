/**
 * The theme preference has to survive a hop between two separate browser
 * origins (apex ↔ org subdomain). These cover both transports: the
 * domain-scoped cookie and the `?theme=` param, plus the pre-paint script
 * that turns either back into the `localStorage` key next-themes reads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  isThemePreference,
  readThemeCookie,
  withThemeParam,
  writeThemeCookie,
} from "@/lib/theme-preference";

const themeSeedScript = readFileSync(resolve(process.cwd(), "public/dg-theme-seed.js"), "utf-8");

function clearCookies() {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe("isThemePreference", () => {
  it("accepts the three real preferences", () => {
    for (const value of ["light", "dark", "system"]) {
      expect(isThemePreference(value)).toBe(true);
    }
  });

  it("rejects anything else, including undefined from an unmounted useTheme()", () => {
    for (const value of [undefined, null, "", "Dark", "auto", 1, {}]) {
      expect(isThemePreference(value)).toBe(false);
    }
  });
});

describe("withThemeParam", () => {
  it("appends with & when the URL already has a query string", () => {
    expect(withThemeParam("https://acme.dubgrid.com/login?verified=1", "dark")).toBe(
      "https://acme.dubgrid.com/login?verified=1&theme=dark",
    );
  });

  it("appends with ? when the URL has no query string", () => {
    expect(withThemeParam("https://dubgrid.com/", "system")).toBe(
      "https://dubgrid.com/?theme=system",
    );
  });

  // next-themes reports `undefined` until it has mounted; a redirect must
  // never become malformed just because the hop happened early.
  it("returns the URL untouched for an unresolved or bogus preference", () => {
    expect(withThemeParam("https://dubgrid.com/", undefined)).toBe("https://dubgrid.com/");
    expect(withThemeParam("https://dubgrid.com/", "neon")).toBe("https://dubgrid.com/");
  });
});

describe("theme cookie", () => {
  beforeEach(clearCookies);
  afterEach(clearCookies);

  it("round-trips a preference", () => {
    writeThemeCookie("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE_NAME}=dark`);
    expect(readThemeCookie()).toBe("dark");
  });

  it("returns null when absent", () => {
    expect(readThemeCookie()).toBeNull();
  });

  it("returns null rather than a bad value when the cookie was tampered with", () => {
    document.cookie = `${THEME_COOKIE_NAME}=neon; path=/`;
    expect(readThemeCookie()).toBeNull();
  });
});

describe("external theme seed", () => {
  const run = (script: string) => new Function(script)();

  beforeEach(() => {
    clearCookies();
    localStorage.clear();
    window.history.replaceState(null, "", "/login");
  });
  afterEach(clearCookies);

  it("adopts the ?theme= param and strips only that key from the URL", () => {
    window.history.replaceState(null, "", "/login?verified=1&name=Acme%20Co&theme=dark");

    run(themeSeedScript);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    // OrgLogin reads `verified` and `name` off this same URL — they must survive.
    expect(window.location.search).toContain("verified=1");
    expect(window.location.search).toContain("name=Acme+Co");
    expect(window.location.search).not.toContain("theme=");
  });

  it("falls back to the cookie when there is no param", () => {
    document.cookie = `${THEME_COOKIE_NAME}=system; path=/`;

    run(themeSeedScript);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("lets the param win over a conflicting cookie", () => {
    document.cookie = `${THEME_COOKIE_NAME}=light; path=/`;
    window.history.replaceState(null, "", "/login?theme=dark");

    run(themeSeedScript);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("ignores an invalid param and an invalid cookie", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    document.cookie = `${THEME_COOKIE_NAME}=neon; path=/`;
    window.history.replaceState(null, "", "/login?theme=neon");

    run(themeSeedScript);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("leaves localStorage alone when nothing is handed over", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    run(themeSeedScript);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("never throws when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    document.cookie = `${THEME_COOKIE_NAME}=dark; path=/`;

    expect(() => run(themeSeedScript)).not.toThrow();
    spy.mockRestore();
  });
});
