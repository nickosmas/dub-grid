// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(process.cwd(), "src/app");
const privacyPolicy = readFileSync(resolve(appRoot, "privacy/page.tsx"), "utf8");
const cookiePolicy = readFileSync(resolve(appRoot, "cookie-policy/page.tsx"), "utf8");
const terms = readFileSync(resolve(appRoot, "terms/TermsContent.tsx"), "utf8");

describe("public legal-policy copy", () => {
  it("does not expose the registered-address placeholder", () => {
    expect(privacyPolicy).not.toContain("[REGISTERED ADDRESS]");
    expect(terms).not.toContain("[REGISTERED ADDRESS]");
  });

  it("describes consented analytics and Sentry user context accurately", () => {
    expect(privacyPolicy).toContain("user ID and email address");
    expect(privacyPolicy).not.toContain("anonymized usage data");
    expect(privacyPolicy).not.toContain("Personally identifiable information is not included");
    expect(cookiePolicy).toContain("enable Analytics in its Customize view");
    expect(cookiePolicy).toContain("Cookie-free page-view beacon");
    expect(cookiePolicy).toContain("Sentry receives the user ID and email address");
  });

  it("does not promise unverified retention, infrastructure, or historical practices", () => {
    expect(privacyPolicy).not.toContain("encrypted in transit and at rest");
    expect(privacyPolicy).not.toContain("before being purged");
    expect(privacyPolicy).not.toContain("not deleted with your account");
    expect(privacyPolicy).not.toContain("we have not done so in the past twelve months");
    expect(privacyPolicy).not.toContain("US-based service providers");
  });
});
