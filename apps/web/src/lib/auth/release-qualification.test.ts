import { describe, expect, it } from "vitest";
import {
  AUTH_RELEASE_BROWSER_ENGINES,
  AUTH_RELEASE_MATRIX,
  AUTH_RELEASE_NATIVE_TARGETS,
  AUTH_RELEASE_ROLES,
  AUTH_RELEASE_STATES,
} from "./release-qualification";

describe("authentication release qualification matrix", () => {
  it("covers every required role and authentication state exactly through named rows", () => {
    expect(new Set(AUTH_RELEASE_MATRIX.map((row) => row.id)).size).toBe(AUTH_RELEASE_MATRIX.length);

    for (const role of AUTH_RELEASE_ROLES) {
      expect(
        AUTH_RELEASE_MATRIX.some((row) => row.role === role),
        role,
      ).toBe(true);
    }
    for (const state of AUTH_RELEASE_STATES) {
      expect(
        AUTH_RELEASE_MATRIX.some((row) => row.state === state),
        state,
      ).toBe(true);
    }
  });

  it("names complete browser and native target coverage", () => {
    const browserCoverage = new Set(AUTH_RELEASE_MATRIX.flatMap((row) => row.browserEngines ?? []));
    const nativeCoverage = new Set(AUTH_RELEASE_MATRIX.flatMap((row) => row.nativeTargets ?? []));

    expect([...browserCoverage].sort()).toEqual([...AUTH_RELEASE_BROWSER_ENGINES].sort());
    expect([...nativeCoverage].sort()).toEqual([...AUTH_RELEASE_NATIVE_TARGETS].sort());
  });

  it("requires explicit evidence ownership and never embeds credentials", () => {
    const serialized = JSON.stringify(AUTH_RELEASE_MATRIX);

    for (const row of AUTH_RELEASE_MATRIX) {
      expect(row.evidenceOwner.trim(), row.id).not.toBe("");
      expect(row.surface === "web" ? row.browserEngines?.length : row.nativeTargets?.length).toBe(
        row.surface === "web" ? 3 : 1,
      );
    }

    expect(serialized).not.toMatch(
      /password|access[_-]?token|refresh[_-]?token|token_hash|totp[_-]?(?:secret|code)|recovery[_-]?token|invitation[_-]?token/i,
    );
  });

  it("records direct evidence for every required physical-device result", () => {
    const physicalRows = AUTH_RELEASE_MATRIX.filter((row) =>
      row.nativeTargets?.includes("physical_device"),
    );

    expect(physicalRows.length).toBeGreaterThan(0);
    expect(physicalRows.every((row) => row.evidenceStatus === "observed")).toBe(true);
    expect(physicalRows.every((row) => row.evidenceOwner.startsWith("manual:physical-ios:"))).toBe(
      true,
    );
  });

  it("records every native qualification scenario separately for each target", () => {
    const requiredScenarios = ["mfa_enabled", "restored", "organization_switch"] as const;

    for (const state of requiredScenarios) {
      const targets = new Set(
        AUTH_RELEASE_MATRIX.filter(
          (row) => row.surface === "native" && row.state === state,
        ).flatMap((row) => row.nativeTargets ?? []),
      );

      expect([...targets].sort(), state).toEqual([...AUTH_RELEASE_NATIVE_TARGETS].sort());
    }
  });
});
