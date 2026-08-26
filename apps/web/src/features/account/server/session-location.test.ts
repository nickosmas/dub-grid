import { describe, expect, it } from "vitest";
import { getSessionLocation } from "./session-location";

describe("getSessionLocation", () => {
  it("formats URL-encoded Vercel geo headers", () => {
    expect(
      getSessionLocation(
        new Headers({
          "x-vercel-ip-city": "Migori%20Town",
          "x-vercel-ip-country": "KE",
        }),
      ),
    ).toEqual({ city: "Migori Town", country: "Kenya" });
  });

  it("returns null location when geo headers are absent", () => {
    expect(getSessionLocation(new Headers())).toEqual({ city: null, country: null });
  });
});
