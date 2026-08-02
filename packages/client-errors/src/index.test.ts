import { describe, it, expect } from "vitest";
import {
  DEFAULT_ERROR_FALLBACK,
  NETWORK_ERROR_MESSAGE,
  formatClientErrorMessage,
  getErrorMessage,
  getOrgUnavailableMessage,
  isAuthorizationError,
  isNetworkConnectionError,
  isTechnicalErrorMessage,
  translateErrorMessage,
} from "./index";

// ── getErrorMessage ──────────────────────────────────────────────────────────

describe("getErrorMessage", () => {
  it("extracts the message from an Error instance", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("extracts the message from an object with a string message", () => {
    expect(getErrorMessage({ message: "obj error" })).toBe("obj error");
  });

  it("returns null for an object with a non-string message", () => {
    expect(getErrorMessage({ message: 42 })).toBeNull();
  });

  it("returns a plain string directly", () => {
    expect(getErrorMessage("plain error")).toBe("plain error");
  });

  it("trims surrounding whitespace and treats blank as null", () => {
    expect(getErrorMessage("  spaced  ")).toBe("spaced");
    expect(getErrorMessage("   ")).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(getErrorMessage(null)).toBeNull();
    expect(getErrorMessage(undefined)).toBeNull();
  });

  it("returns null for ZodError-shaped objects so the fallback wins", () => {
    const zodErrorByName = Object.assign(new Error("[{...}]"), {
      name: "ZodError",
      issues: [{ code: "invalid_type", path: ["foo"], message: "Required" }],
    });
    expect(getErrorMessage(zodErrorByName)).toBeNull();

    const duckTypedZodError = {
      message: "[{...}]",
      issues: [{ code: "invalid_type", path: ["foo"], message: "Required" }],
    };
    expect(getErrorMessage(duckTypedZodError)).toBeNull();
  });
});

// ── formatClientErrorMessage ─────────────────────────────────────────────────

describe("formatClientErrorMessage", () => {
  it("passes through a plain, non-technical raw message", () => {
    expect(formatClientErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("returns the fallback when there is no message to show", () => {
    expect(formatClientErrorMessage(null, "fallback")).toBe("fallback");
    expect(formatClientErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(formatClientErrorMessage({ message: 42 }, "fallback")).toBe("fallback");
  });

  it("uses the default fallback when none is provided", () => {
    expect(formatClientErrorMessage(null)).toBe(DEFAULT_ERROR_FALLBACK);
  });

  it("rewrites known auth errors into friendly copy", () => {
    expect(formatClientErrorMessage(new Error("Invalid login credentials"), "fallback")).toBe(
      "Check your email and password and try again.",
    );
  });

  it("rewrites duplicate open-shift volunteering into friendly copy", () => {
    expect(
      formatClientErrorMessage(
        new Error("You already volunteered for this open shift"),
        "fallback",
      ),
    ).toBe("You already volunteered for this open shift.");
  });

  it("rewrites invitation email delivery failures into friendly copy", () => {
    expect(
      formatClientErrorMessage(
        new Error("Invitation email could not be sent. Try again in a moment."),
        "fallback",
      ),
    ).toBe("We couldn't send that email. Please try again shortly.");
  });

  it("returns the canonical network message for connectivity failures", () => {
    expect(formatClientErrorMessage(new Error("Failed to fetch"), "fallback")).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(formatClientErrorMessage(new Error("Network request failed"), "fallback")).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });

  it("hides technical/backend leaks behind the fallback", () => {
    expect(
      formatClientErrorMessage(
        new Error("PGRST204 schema cache miss on column org_id"),
        "We couldn't load the schedule.",
      ),
    ).toBe("We couldn't load the schedule.");
    expect(
      formatClientErrorMessage(
        new Error("duplicate key value violates unique constraint"),
        "fallback",
      ),
    ).toBe("fallback");
  });

  it("hides ZodError dumps behind the fallback", () => {
    const zodError = Object.assign(
      new Error(
        '[{"code":"invalid_type","expected":"boolean","received":"undefined","path":["permissions","canEditScheduleIndicators"],"message":"Required"}]',
      ),
      {
        name: "ZodError",
        issues: [
          {
            code: "invalid_type",
            expected: "boolean",
            received: "undefined",
            path: ["permissions", "canEditScheduleIndicators"],
            message: "Required",
          },
        ],
      },
    );
    expect(formatClientErrorMessage(zodError, "We couldn't load the schedule.")).toBe(
      "We couldn't load the schedule.",
    );
  });

  it("hides raw JSON-issue strings carried by non-Error wrappers", () => {
    const rawIssueDump =
      '[{"code":"invalid_type","expected":"boolean","received":"undefined","path":["permissions","canEditScheduleIndicators"],"message":"Required"}]';
    expect(formatClientErrorMessage(rawIssueDump, "fallback")).toBe("fallback");
    expect(formatClientErrorMessage(new Error(rawIssueDump), "fallback")).toBe("fallback");
  });

  it("preserves intentional organization-unavailable gate copy", () => {
    const error = new Error(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );
    expect(formatClientErrorMessage(error, "fallback")).toBe(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );
  });
});

// ── detection helpers ────────────────────────────────────────────────────────

describe("isNetworkConnectionError", () => {
  it("detects connectivity failures across web and mobile phrasings", () => {
    expect(
      isNetworkConnectionError(
        new Error("We couldn't reach the mobile backend at https://dubgrid.com"),
      ),
    ).toBe(true);
    expect(isNetworkConnectionError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkConnectionError(new Error("connection refused"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isNetworkConnectionError(new Error("Invalid login credentials"))).toBe(false);
    expect(isNetworkConnectionError(null)).toBe(false);
  });
});

describe("isAuthorizationError", () => {
  it("detects permission failures", () => {
    expect(isAuthorizationError(new Error("Unauthorized"))).toBe(true);
    expect(isAuthorizationError(new Error("permission denied for table"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isAuthorizationError(new Error("boom"))).toBe(false);
    expect(isAuthorizationError(null)).toBe(false);
  });
});

describe("getOrgUnavailableMessage", () => {
  it("returns the verbatim message for organization-unavailable gates", () => {
    const error = new Error(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );
    expect(getOrgUnavailableMessage(error)).toBe(
      "Organization unavailable. Sign in on the web to finish organization setup.",
    );
  });

  it("returns null for any other error", () => {
    expect(getOrgUnavailableMessage(new Error("boom"))).toBeNull();
    expect(getOrgUnavailableMessage(null)).toBeNull();
  });
});

// ── translation primitives ───────────────────────────────────────────────────

describe("translateErrorMessage", () => {
  it("returns friendly copy for a known pattern", () => {
    expect(translateErrorMessage("Overlapping shift detected")).toBe(
      "You already have a shift during that time.",
    );
  });

  it("returns null for an unknown message", () => {
    expect(translateErrorMessage("totally novel error")).toBeNull();
  });
});

describe("isTechnicalErrorMessage", () => {
  it("flags backend/infra leaks", () => {
    expect(isTechnicalErrorMessage("PGRST301 row-level security violation")).toBe(true);
    expect(isTechnicalErrorMessage("invalid input syntax for type uuid")).toBe(true);
  });

  it("flags Postgres/driver connection and timeout failures", () => {
    expect(isTechnicalErrorMessage("canceling statement due to statement timeout")).toBe(true);
    expect(isTechnicalErrorMessage("Connection terminated unexpectedly")).toBe(true);
    expect(isTechnicalErrorMessage("server closed the connection unexpectedly")).toBe(true);
    expect(isTechnicalErrorMessage('too many connections for role "app_user"')).toBe(true);
    expect(isTechnicalErrorMessage("connect ECONNREFUSED 127.0.0.1:5432")).toBe(true);
  });

  it("does not flag plain human-readable messages", () => {
    expect(isTechnicalErrorMessage("That shift has already started")).toBe(false);
  });
});
