import { describe, expect, it } from "vitest";
import { buildSubdomainHost, isApexHost, parseHost } from "@/lib/subdomain";

describe("parseHost", () => {
  it("treats localhost as apex", () => {
    const parsed = parseHost("localhost:3000");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("localhost");
    expect(parsed.port).toBe(":3000");
  });

  it("parses localhost tenant subdomains", () => {
    const parsed = parseHost("calmhaven.localhost:3000");
    expect(parsed.subdomain).toBe("calmhaven");
    expect(parsed.rootDomain).toBe("localhost");
    expect(parsed.port).toBe(":3000");
  });

  it("treats login.localhost as apex (reserved)", () => {
    const parsed = parseHost("login.localhost:3000");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("localhost");
    expect(parsed.port).toBe(":3000");
    expect(isApexHost(parsed)).toBe(true);
  });

  it("parses production tenant subdomains", () => {
    const parsed = parseHost("calmhaven.dubgrid.com");
    expect(parsed.subdomain).toBe("calmhaven");
    expect(parsed.rootDomain).toBe("dubgrid.com");
  });

  it("treats www.dubgrid.com as apex with clean rootDomain", () => {
    const parsed = parseHost("www.dubgrid.com");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("dubgrid.com");
    expect(isApexHost(parsed)).toBe(true);
  });

  it("treats project.vercel.app as apex", () => {
    const parsed = parseHost("dub-grid.vercel.app");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("dub-grid.vercel.app");
    expect(isApexHost(parsed)).toBe(true);
  });

  it("parses tenant.project.vercel.app as subdomain host", () => {
    const parsed = parseHost("calmhaven.dub-grid.vercel.app");
    expect(parsed.subdomain).toBe("calmhaven");
    expect(parsed.rootDomain).toBe("dub-grid.vercel.app");
    expect(buildSubdomainHost("oak", parsed)).toBe("oak.dub-grid.vercel.app");
  });
});

describe("parseHost with NEXT_PUBLIC_BASE_DOMAIN anchor", () => {
  const originalBaseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN;

  it("treats app.dubgrid.com as apex when it is the base domain", () => {
    process.env.NEXT_PUBLIC_BASE_DOMAIN = "app.dubgrid.com";
    const parsed = parseHost("app.dubgrid.com");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("app.dubgrid.com");
    expect(isApexHost(parsed)).toBe(true);
    process.env.NEXT_PUBLIC_BASE_DOMAIN = originalBaseDomain;
  });

  it("parses tenant.app.dubgrid.com correctly", () => {
    process.env.NEXT_PUBLIC_BASE_DOMAIN = "app.dubgrid.com";
    const parsed = parseHost("calmhaven.app.dubgrid.com");
    expect(parsed.subdomain).toBe("calmhaven");
    expect(parsed.rootDomain).toBe("app.dubgrid.com");
    process.env.NEXT_PUBLIC_BASE_DOMAIN = originalBaseDomain;
  });

  it("treats www.app.dubgrid.com as apex (reserved)", () => {
    process.env.NEXT_PUBLIC_BASE_DOMAIN = "app.dubgrid.com";
    const parsed = parseHost("www.app.dubgrid.com");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("app.dubgrid.com");
    expect(isApexHost(parsed)).toBe(true);
    process.env.NEXT_PUBLIC_BASE_DOMAIN = originalBaseDomain;
  });

  it("treats xxx.onrender.com as apex when it is the base domain", () => {
    process.env.NEXT_PUBLIC_BASE_DOMAIN = "dub-grid.onrender.com";
    const parsed = parseHost("dub-grid.onrender.com");
    expect(parsed.subdomain).toBeNull();
    expect(parsed.rootDomain).toBe("dub-grid.onrender.com");
    process.env.NEXT_PUBLIC_BASE_DOMAIN = originalBaseDomain;
  });
});
