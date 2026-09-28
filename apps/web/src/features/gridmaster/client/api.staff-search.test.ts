import { afterEach, describe, expect, it, vi } from "vitest";

import { searchGridmasterStaff } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("searchGridmasterStaff", () => {
  it("sends the search in the body, never the URL (F-94)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ staff: [] }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await searchGridmasterStaff("grace@example.com");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/gridmaster\/staff$/);
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ q: "grace@example.com" }),
    });
  });
});
