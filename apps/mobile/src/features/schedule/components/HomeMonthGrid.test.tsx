import { describe, expect, it } from "vitest";
import { dropZeroMinutes } from "./HomeMonthGrid";

describe("dropZeroMinutes", () => {
  it("writes a time on the hour without its minutes", () => {
    expect(dropZeroMinutes("7:00 AM - 3:30 PM")).toBe("7 AM - 3:30 PM");
    expect(dropZeroMinutes("11:00 PM - 7:00 AM")).toBe("11 PM - 7 AM");
    expect(dropZeroMinutes("12:15 PM - 4:45 PM")).toBe("12:15 PM - 4:45 PM");
  });
});
