import { describe, expect, it } from "vitest";
import { ACCOUNT_DISABLED_MESSAGE } from "@dubgrid/domain";
import { describeSignInFailure, EXISTING_ACCOUNT_MESSAGE } from "./signInFailure";

describe("describeSignInFailure", () => {
  it("blames the password only when the credential was actually rejected", () => {
    expect(describeSignInFailure({ status: 400, code: "invalid_credentials" }, "existing")).toBe(
      EXISTING_ACCOUNT_MESSAGE,
    );
  });

  it("does not claim the address is taken when the request was throttled", () => {
    // The regression this guards: an earlier attempt had already created the
    // account, so registerStatus is "existing" — but a throttle says nothing
    // about who owns the address.
    expect(describeSignInFailure({ status: 429 }, "existing")).not.toBe(EXISTING_ACCOUNT_MESSAGE);
    expect(describeSignInFailure({ code: "over_request_rate_limit" }, "existing")).toMatch(
      /Too many attempts/,
    );
  });

  it("does not claim the address is taken when GoTrue or the JWT hook 5xx'd", () => {
    const message = describeSignInFailure({ status: 500 }, "existing");
    expect(message).not.toBe(EXISTING_ACCOUNT_MESSAGE);
    expect(message).toMatch(/try again in a moment/);
  });

  it("passes the disabled-account sentinel straight through", () => {
    expect(describeSignInFailure({ message: ACCOUNT_DISABLED_MESSAGE }, "created")).toBe(
      ACCOUNT_DISABLED_MESSAGE,
    );
  });

  it("keeps the generic wording for a freshly created account", () => {
    expect(describeSignInFailure({ status: 400 }, "created")).toBe(
      "Unable to sign in. Please try again or contact support.",
    );
  });
});
