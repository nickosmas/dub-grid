import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/gridmaster/delete-org", () => {
  it("keeps permanent organization deletion disabled", async () => {
    const response = await POST();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
