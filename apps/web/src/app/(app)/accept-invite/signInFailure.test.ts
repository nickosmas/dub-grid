import { describe, expect, it } from "vitest";
import {
  ACCESS_SUSPENDED_BODY,
  ACCOUNT_DISABLED_MESSAGE,
  ACCOUNT_SUSPENDED_MESSAGE,
} from "@dubgrid/domain";
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
    expect(message).toMatch(/Try again in a moment/);
  });

  it("passes the disabled-account sentinel straight through", () => {
    expect(describeSignInFailure({ message: ACCOUNT_DISABLED_MESSAGE }, "created")).toBe(
      ACCOUNT_DISABLED_MESSAGE,
    );
  });

  it("says access is suspended for a suspended employee", () => {
    expect(describeSignInFailure({ message: ACCOUNT_SUSPENDED_MESSAGE }, "existing")).toBe(
      ACCESS_SUSPENDED_BODY,
    );
  });

  it("names a suspension's end when the hook gives one (51g3)", () => {
    expect(
      describeSignInFailure(
        { message: `${ACCOUNT_SUSPENDED_MESSAGE} Until 2026-11-20.` },
        "existing",
      ),
    ).toBe(
      "Your organization has suspended your access to the app until Fri, Nov 20. Contact an administrator there if you have questions.",
    );
  });

  it("keeps the generic wording for a freshly created account", () => {
    expect(describeSignInFailure({ status: 400 }, "created")).toBe(
      "We couldn't sign you in. Try again, or contact support.",
    );
  });
});
