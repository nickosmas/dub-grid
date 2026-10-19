import { describe, expect, it } from "vitest";
import { ApiResponseError } from "@dubgrid/api-client";
import { shouldRetryMobileQuery } from "./query-client";

const refused = (status: number) => new ApiResponseError("Request failed", status, null);

describe("shouldRetryMobileQuery", () => {
  it.each([401, 403, 404])("does not retry HTTP %i", (status) => {
    expect(shouldRetryMobileQuery(0, refused(status))).toBe(false);
  });

  it("retries a server failure twice", () => {
    expect(shouldRetryMobileQuery(0, refused(503))).toBe(true);
    expect(shouldRetryMobileQuery(1, refused(503))).toBe(true);
    expect(shouldRetryMobileQuery(2, refused(503))).toBe(false);
  });

  it("leaves a network failure to the reconnect refetch", () => {
    expect(shouldRetryMobileQuery(0, new TypeError("Network request failed"))).toBe(false);
  });
});
