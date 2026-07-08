import { describe, it, expect } from "vitest";

import { indefiniteArticle } from "./text";

describe("indefiniteArticle", () => {
  it("uses 'an' before a vowel sound", () => {
    expect(indefiniteArticle("organization")).toBe("an");
    expect(indefiniteArticle("email")).toBe("an");
    expect(indefiniteArticle("emergency")).toBe("an");
    expect(indefiniteArticle("engineer")).toBe("an");
    expect(indefiniteArticle("address")).toBe("an");
  });

  it("uses 'an' before a silent-h consonant", () => {
    expect(indefiniteArticle("hour")).toBe("an");
    expect(indefiniteArticle("honest")).toBe("an");
    expect(indefiniteArticle("honor")).toBe("an");
  });

  it("uses 'a' before a consonant sound", () => {
    expect(indefiniteArticle("vacation")).toBe("a");
    expect(indefiniteArticle("shift")).toBe("a");
    expect(indefiniteArticle("role")).toBe("a");
  });

  it("uses 'a' before a 'you'-sound vowel letter", () => {
    expect(indefiniteArticle("user")).toBe("a");
    expect(indefiniteArticle("unique")).toBe("a");
    expect(indefiniteArticle("university")).toBe("a");
    expect(indefiniteArticle("utility")).toBe("a");
    expect(indefiniteArticle("European")).toBe("a");
    expect(indefiniteArticle("one-time")).toBe("a");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(indefiniteArticle("  Email  ")).toBe("an");
    expect(indefiniteArticle("VACATION")).toBe("a");
  });

  it("defaults to 'a' for empty input", () => {
    expect(indefiniteArticle("")).toBe("a");
    expect(indefiniteArticle("   ")).toBe("a");
  });
});
