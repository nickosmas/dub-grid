import { describe, expect, it } from "vitest";
import { latestFunctionDefinition } from "./helpers/sql-inventory";

// The emails and the in-app notices describe one event (F-38).
describe("in-app impersonation notices read as the emails do (migration 057)", () => {
  it.each(["start_impersonation", "end_impersonation"])("%s names DubGrid support", (name) => {
    const { text } = latestFunctionDefinition(name);
    expect(text).toContain("DubGrid support");
    expect(text).not.toMatch(/platform administrator/i);
  });

  it("keeps the fresh-proof guard on the start (055)", () => {
    expect(latestFunctionDefinition("start_impersonation").text).toContain(
      "IF public.is_gridmaster() AND NOT public.caller_has_fresh_proof() THEN",
    );
  });
});
