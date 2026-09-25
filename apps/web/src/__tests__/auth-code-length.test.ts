import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_OTP_LENGTH } from "@dubgrid/domain";

// The mobile recovery screen used to hard-code 6, tied to `otp_length` only by
// a note in the push script (41d2).
describe("EMAIL_OTP_LENGTH", () => {
  it("matches the email otp_length Supabase is configured with", () => {
    const config = readFileSync(
      resolve(process.cwd(), "..", "..", "supabase", "config.toml"),
      "utf8",
    );
    const start = config.indexOf("[auth.email]\n");
    const section = config.slice(start, config.indexOf("\n[", start + 1));
    const match = /^otp_length\s*=\s*(\d+)/m.exec(section);

    expect(start).toBeGreaterThan(-1);
    expect(Number(match?.[1])).toBe(EMAIL_OTP_LENGTH);
  });
});
