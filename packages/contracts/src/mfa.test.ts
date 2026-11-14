import { describe, expect, it } from "vitest";
import { mfaLifecycleRequestSchema } from "./mfa";

// zod 4's `.uuid()` accepts only RFC 9562 UUIDs; ids are checked with `z.guid()`
// so any id Postgres stores (seeded and test ids included) still validates.
describe("id fields", () => {
  it("accepts an id with no RFC version or variant", () => {
    const parsed = mfaLifecycleRequestSchema.safeParse({
      action: "remove",
      factorId: "00000000-0000-0000-0000-000000000001",
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses text that isn't an id", () => {
    const parsed = mfaLifecycleRequestSchema.safeParse({
      action: "remove",
      factorId: "not-an-id",
    });
    expect(parsed.success).toBe(false);
  });
});
