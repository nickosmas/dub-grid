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
    const parsed = parseHost("ardenwood.localhost:3000");
    expect(parsed.subdomain).toBe("ardenwood");
    expect(parsed.rootDomain).toBe("localhost");
    expect(parsed.port).toBe(":3000");
  });

  it("parses production tenant subdomains", () => {
    const parsed = parseHost("ardenwood.dubgrid.com");
    expect(parsed.subdomain).toBe("ardenwood");
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
    const parsed = parseHost("ardenwood.dub-grid.vercel.app");
    expect(parsed.subdomain).toBe("ardenwood");
    expect(parsed.rootDomain).toBe("dub-grid.vercel.app");
    expect(buildSubdomainHost("oak", parsed)).toBe("oak.dub-grid.vercel.app");
  });
});
