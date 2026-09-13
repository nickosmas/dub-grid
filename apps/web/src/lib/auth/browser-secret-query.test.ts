import { afterEach, describe, expect, it, vi } from "vitest";
import { scrubBrowserSecretQuery } from "./browser-secret-query";

describe("scrubBrowserSecretQuery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("captures requested values and removes them from browser history", () => {
    window.history.replaceState(
      null,
      "",
      "/auth/verify?token_hash=credential&type=recovery&next=%2Freset-password#continue",
    );
    const replace = vi.spyOn(window.history, "replaceState");

    const result = scrubBrowserSecretQuery(["token_hash", "type", "next"]);

    expect(result).toEqual({
      token_hash: "credential",
      type: "recovery",
      next: "/reset-password",
    });
    expect(replace).toHaveBeenCalledWith(null, "", "/auth/verify#continue");
  });

  it("preserves unrelated query values", () => {
    window.history.replaceState(null, "", "/accept-invite?token=secret&theme=dark");

    scrubBrowserSecretQuery(["token"]);

    expect(window.location.href).toContain("/accept-invite?theme=dark");
    expect(window.location.href).not.toContain("secret");
  });
});
