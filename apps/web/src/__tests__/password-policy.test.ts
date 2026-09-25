import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPasswordAcceptable } from "@dubgrid/domain";

const config = readFileSync(resolve(process.cwd(), "..", "..", "supabase", "config.toml"), "utf8");
const auth = config.slice(
  config.indexOf("[auth]\n"),
  config.indexOf("\n[", config.indexOf("[auth]\n") + 1),
);
const setting = (key: string) => new RegExp(`^${key}\\s*=\\s*"?([^"\\n]*)"?`, "m").exec(auth)?.[1];

const SAMPLES = [
  "Abcdefghij!",
  "1234567890!",
  "abcdefghij1",
  "Abcdefghi1",
  "abcdefgh1!",
  "ABCDEFGHI1",
  "Short1!",
  "aaaaaaaaaa",
  "Aaaaaaaaa1",
];

// The app used to accept passwords Supabase's own rule then refused at
// sign-up (41d3, F-47). Every password the app accepts must pass Supabase too.
describe("the app's password rule against Supabase's", () => {
  it("never accepts a password Supabase would refuse", () => {
    const minimum = Number(setting("minimum_password_length"));
    const requirements = setting("password_requirements");

    expect(minimum).toBeGreaterThan(0);
    expect(requirements).toBe("letters_digits");
    for (const password of SAMPLES.filter(isPasswordAcceptable)) {
      expect(password.length, password).toBeGreaterThanOrEqual(minimum);
      expect(/[A-Za-z]/.test(password) && /[0-9]/.test(password), password).toBe(true);
    }
    expect(SAMPLES.filter(isPasswordAcceptable).length).toBeGreaterThan(0);
  });
});
