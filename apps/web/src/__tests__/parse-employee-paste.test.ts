import { describe, expect, it } from "vitest";
import { parseEmployeePaste } from "@/components/gridmaster/organization-setup/parseEmployeePaste";

describe("parseEmployeePaste", () => {
  it("parses tab-separated rows", () => {
    const out = parseEmployeePaste("Jane\tDoe\tjane@acme.test\t4155550100");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@acme.test",
      phone: "4155550100",
    });
  });

  it("parses comma-separated rows", () => {
    const out = parseEmployeePaste("Bob, Ross, bob@acme.test, 415.555.0102");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      firstName: "Bob",
      lastName: "Ross",
      email: "bob@acme.test",
      phone: "415.555.0102",
    });
  });

  it("parses space-separated rows where email and phone embed", () => {
    const out = parseEmployeePaste("John Smith john@acme.test (415) 555-0101");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      firstName: "John",
      lastName: "Smith",
      email: "john@acme.test",
      phone: "(415) 555-0101",
    });
  });

  it("ignores blank lines and trims whitespace", () => {
    const out = parseEmployeePaste(
      "\n  \nJane\tDoe\tjane@acme.test\t4155550100\n\nAlice Liddell alice@acme.test\n",
    );
    expect(out).toHaveLength(2);
    expect(out[1].firstName).toBe("Alice");
    expect(out[1].lastName).toBe("Liddell");
    expect(out[1].email).toBe("alice@acme.test");
    expect(out[1].phone).toBe("");
  });

  it("handles single-name rows", () => {
    const out = parseEmployeePaste("Madonna\tmadonna@acme.test");
    expect(out[0]).toMatchObject({
      firstName: "Madonna",
      lastName: "",
      email: "madonna@acme.test",
    });
  });

  it("skips rows with no usable content", () => {
    const out = parseEmployeePaste("   ,  , \n");
    expect(out).toHaveLength(0);
  });
});
