/**
 * The domain suffix is the whole point of this module: get it wrong and a
 * preference silently splits in two between the apex and an org subdomain.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCookieDomain, isLocalhost, isSecure, readCookie, writeCookie } from "@/lib/cookies";

const originalLocation = window.location;

function setLocation(href: string) {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

describe("getCookieDomain", () => {
  it("scopes to the registrable domain so every org subdomain can read it", () => {
    setLocation("https://acme.dubgrid.com/dashboard");
    expect(getCookieDomain()).toBe("; domain=.dubgrid.com");

    setLocation("https://dubgrid.com/");
    expect(getCookieDomain()).toBe("; domain=.dubgrid.com");
  });

  // Browsers accept `domain=localhost` but then refuse to send the cookie to
  // `sub.localhost`, so emitting one would be worse than useless — it would
  // look like sharing works in dev when it does not.
  it("emits no domain on localhost, including subdomains", () => {
    setLocation("http://localhost:3000/");
    expect(getCookieDomain()).toBe("");

    setLocation("http://acme.localhost:3000/");
    expect(getCookieDomain()).toBe("");
  });
});

describe("isLocalhost / isSecure", () => {
  it("treats localhost and its subdomains as local", () => {
    setLocation("http://localhost:3000/");
    expect(isLocalhost()).toBe(true);
    setLocation("http://acme.localhost:3000/");
    expect(isLocalhost()).toBe(true);
    setLocation("https://acme.dubgrid.com/");
    expect(isLocalhost()).toBe(false);
  });

  it("reports Secure only over https", () => {
    setLocation("https://dubgrid.com/");
    expect(isSecure()).toBe(true);
    setLocation("http://localhost:3000/");
    expect(isSecure()).toBe(false);
  });
});

describe("readCookie / writeCookie", () => {
  beforeEach(() => {
    for (const entry of document.cookie.split("; ")) {
      const name = entry.split("=")[0];
      if (name) document.cookie = `${name}=; path=/; max-age=0`;
    }
  });

  it("round-trips a value and url-encodes it", () => {
    writeCookie("dg-test", "a b", 60);
    expect(document.cookie).toContain("dg-test=a%20b");
    expect(readCookie("dg-test")).toBe("a b");
  });

  it("returns null for a missing cookie", () => {
    expect(readCookie("dg-absent")).toBeNull();
  });

  it("does not confuse a cookie whose name is a suffix of another", () => {
    writeCookie("theme", "dark", 60);
    expect(readCookie("dg-theme")).toBeNull();
  });
});
