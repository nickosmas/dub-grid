import { describe, expect, it } from "vitest";
import { formatUsPhone } from "@/components/forms/PhoneInput";
import { formatUsPostalCode } from "@/components/forms/PostalCodeInput";

describe("formatUsPhone", () => {
  it("formats a 10-digit number progressively", () => {
    expect(formatUsPhone("")).toBe("");
    expect(formatUsPhone("4")).toBe("(4");
    expect(formatUsPhone("415")).toBe("(415");
    expect(formatUsPhone("4155")).toBe("(415) 5");
    expect(formatUsPhone("415555")).toBe("(415) 555");
    expect(formatUsPhone("4155550100")).toBe("(415) 555-0100");
  });

  it("strips non-digit characters and country code 1", () => {
    expect(formatUsPhone("(415) 555-0100")).toBe("(415) 555-0100");
    expect(formatUsPhone("+1 415 555 0100")).toBe("(415) 555-0100");
    expect(formatUsPhone("415.555.0100")).toBe("(415) 555-0100");
  });

  it("truncates extra digits", () => {
    expect(formatUsPhone("41555501009999")).toBe("(415) 555-0100");
  });
});

describe("formatUsPostalCode", () => {
  it("formats a 5-digit ZIP", () => {
    expect(formatUsPostalCode("94103")).toBe("94103");
  });

  it("adds a hyphen for ZIP+4", () => {
    expect(formatUsPostalCode("941030001")).toBe("94103-0001");
    expect(formatUsPostalCode("94103-0001")).toBe("94103-0001");
  });

  it("strips letters and other characters", () => {
    expect(formatUsPostalCode("ABC94103XX")).toBe("94103");
    expect(formatUsPostalCode("9-41-03-0001")).toBe("94103-0001");
  });

  it("clamps to 9 digits", () => {
    expect(formatUsPostalCode("9410300012345")).toBe("94103-0001");
  });
});
