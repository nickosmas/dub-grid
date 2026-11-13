import { describe, expect, it } from "vitest";
import { scrubServerEvent } from "./sentry-server-scrub";

describe("scrubServerEvent", () => {
  it("keeps the user's id and drops their email and address", () => {
    const event = scrubServerEvent({
      user: { id: "user-1", email: "nurse@example.com", ip_address: "203.0.113.8" },
    });
    expect(event.user).toEqual({ id: "user-1" });
  });

  it("drops a request body and keeps the rest of the request", () => {
    const event = scrubServerEvent({
      request: { url: "https://app.test/api/employees", data: { email: "nurse@example.com" } },
    });
    expect(event.request).toEqual({ url: "https://app.test/api/employees" });
  });

  it("leaves an event with neither alone", () => {
    expect(scrubServerEvent({ message: "boom" } as never)).toEqual({ message: "boom" });
  });
});
