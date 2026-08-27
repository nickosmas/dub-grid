import { describe, expect, it } from "vitest";
import { getApexLandingHref } from "./ApexLandingLink";

describe("getApexLandingHref", () => {
  it("returns the apex landing page from an Organization subdomain", () => {
    expect(getApexLandingHref("https:", "north.dubgrid.com")).toBe("https://dubgrid.com/");
  });

  it("preserves a local development port", () => {
    expect(getApexLandingHref("http:", "north.localhost:3000")).toBe("http://localhost:3000/");
  });
});
