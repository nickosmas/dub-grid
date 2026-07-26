import { describe, expect, it } from "vitest";
import {
  classifyRowAgainstExisting,
  findExactDuplicate,
  findSimilarDuplicate,
  levenshteinDistance,
  normalizeEmail,
  normalizeFullName,
  normalizeName,
  normalizePhone,
  type ExistingEmployeeLite,
} from "@/lib/employee-duplicate-detection";

const johnDoe: ExistingEmployeeLite = {
  id: "1",
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  phone: "555-0100",
};

const janeSmith: ExistingEmployeeLite = {
  id: "2",
  firstName: "Jane",
  lastName: "Smith",
  email: "",
  phone: "",
};

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  John@Example.com  ")).toBe("john@example.com");
  });
});

describe("normalizePhone", () => {
  it("strips everything but digits", () => {
    expect(normalizePhone("(555) 010-0")).toBe("5550100");
  });
});

describe("normalizeFullName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeFullName("  John  ", "Doe")).toBe("john doe");
  });
});

describe("normalizeName", () => {
  it("trims, lowercases, and collapses whitespace on a single field", () => {
    expect(normalizeName("  Marie  Lopez ")).toBe("marie lopez");
  });
});

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("john doe", "john doe")).toBe(0);
  });

  it("is 1 for a single substitution", () => {
    expect(levenshteinDistance("john doe", "john doe".replace("doe", "d0e"))).toBe(1);
  });

  it("is 1 for a single insertion or deletion", () => {
    expect(levenshteinDistance("jon doe", "john doe")).toBe(1);
    expect(levenshteinDistance("john doe", "jon doe")).toBe(1);
  });

  it("is the max length for completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
  });
});

describe("findExactDuplicate", () => {
  const existing = [johnDoe, janeSmith];

  it("matches by exact name (case/whitespace insensitive)", () => {
    const match = findExactDuplicate(
      { firstName: "john", lastName: "  doe ", email: "someone@else.com", phone: "" },
      existing,
    );
    expect(match).toEqual({ employee: johnDoe, reason: "name" });
  });

  it("matches by exact email when name differs", () => {
    const match = findExactDuplicate(
      { firstName: "Johnny", lastName: "Doeson", email: "John@Example.com", phone: "" },
      existing,
    );
    expect(match).toEqual({ employee: johnDoe, reason: "email" });
  });

  it("matches by exact phone when name and email differ", () => {
    const match = findExactDuplicate(
      { firstName: "Johnny", lastName: "Doeson", email: "", phone: "(555) 010-0" },
      existing,
    );
    expect(match).toEqual({ employee: johnDoe, reason: "phone" });
  });

  it("never matches blank email/phone against other blank email/phone", () => {
    const match = findExactDuplicate(
      { firstName: "Someone", lastName: "Else", email: "", phone: "" },
      existing,
    );
    expect(match).toBeNull();
  });

  it("returns null when nothing matches", () => {
    const match = findExactDuplicate(
      { firstName: "New", lastName: "Person", email: "new@example.com", phone: "555-9999" },
      existing,
    );
    expect(match).toBeNull();
  });

  it("does not conflate the first/last name boundary (tuple match, not concatenation)", () => {
    // Existing: first="Anna", last="Marie Lopez". A row split differently
    // (first="Anna Marie", last="Lopez") concatenates to the same full
    // string but is NOT the same (first, last) pair the DB actually
    // constrains on — must not be treated as an exact duplicate.
    const annaMarieLopez: ExistingEmployeeLite = {
      id: "4",
      firstName: "Anna",
      lastName: "Marie Lopez",
      email: "anna@example.com",
      phone: "555-4444",
    };
    const match = findExactDuplicate(
      { firstName: "Anna Marie", lastName: "Lopez", email: "different@example.com", phone: "" },
      [annaMarieLopez],
    );
    expect(match).toBeNull();
  });
});

describe("findSimilarDuplicate", () => {
  const existing = [johnDoe, janeSmith];

  it("flags a one-edit-away name", () => {
    const match = findSimilarDuplicate({ firstName: "Jon", lastName: "Doe" }, existing);
    expect(match).toEqual({ employee: johnDoe, reason: "similar_name" });
  });

  it("does not flag a name beyond the distance threshold", () => {
    const match = findSimilarDuplicate({ firstName: "Alex", lastName: "Rivera" }, existing);
    expect(match).toBeNull();
  });

  it("does not flag an exact match (distance 0)", () => {
    const match = findSimilarDuplicate({ firstName: "John", lastName: "Doe" }, existing);
    expect(match).toBeNull();
  });

  it("suppresses matches against very short existing names", () => {
    const shortName: ExistingEmployeeLite = {
      id: "3",
      firstName: "Al",
      lastName: "",
      email: "",
      phone: "",
    };
    const match = findSimilarDuplicate({ firstName: "Al", lastName: "x" }, [shortName]);
    expect(match).toBeNull();
  });

  it("suppresses matches when the incoming row's name is very short, even against a longer existing name", () => {
    // Previously the length guard only checked the existing side — a short
    // row name (below SIMILAR_NAME_MIN_LENGTH) must not be compared at all.
    const match = findSimilarDuplicate({ firstName: "A", lastName: "B" }, [johnDoe]);
    expect(match).toBeNull();
  });

  it("does not flag two clearly different short names as similar (relative threshold)", () => {
    // "Bo Wu" vs "Bo Li" are Levenshtein distance 2 apart on a 5-character
    // name — a flat distance-2 threshold used to flag this, but a 40%
    // difference on a short name is not a plausible typo.
    const boWu: ExistingEmployeeLite = {
      id: "5",
      firstName: "Bo",
      lastName: "Wu",
      email: "",
      phone: "",
    };
    const match = findSimilarDuplicate({ firstName: "Bo", lastName: "Li" }, [boWu]);
    expect(match).toBeNull();
  });
});

describe("classifyRowAgainstExisting", () => {
  const existing = [johnDoe, janeSmith];

  it("blocks an exact duplicate, even if it would also be a near match", () => {
    const result = classifyRowAgainstExisting(
      { firstName: "John", lastName: "Doe", email: "", phone: "" },
      existing,
    );
    expect(result.status).toBe("blocked");
    expect(result.match?.reason).toBe("name");
  });

  it("warns on a similar (non-exact) name with different contact info", () => {
    const result = classifyRowAgainstExisting(
      { firstName: "Jon", lastName: "Doe", email: "jon@other.com", phone: "555-1234" },
      existing,
    );
    expect(result.status).toBe("warning");
    expect(result.match?.reason).toBe("similar_name");
  });

  it("is ok for a genuinely new row", () => {
    const result = classifyRowAgainstExisting(
      { firstName: "Brand", lastName: "New", email: "brand.new@example.com", phone: "555-2222" },
      existing,
    );
    expect(result).toEqual({ status: "ok", match: null });
  });

  it("does not block a name that only concatenates the same as an existing employee's", () => {
    const annaMarieLopez: ExistingEmployeeLite = {
      id: "4",
      firstName: "Anna",
      lastName: "Marie Lopez",
      email: "anna@example.com",
      phone: "555-4444",
    };
    const result = classifyRowAgainstExisting(
      { firstName: "Anna Marie", lastName: "Lopez", email: "different@example.com", phone: "" },
      [annaMarieLopez],
    );
    expect(result.status).toBe("ok");
  });
});
