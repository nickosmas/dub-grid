import { describe, expect, it } from "vitest";
import {
  buildStaffImportTemplate,
  checkStaffImportRows,
  isCsvFileName,
  parseCsvRecords,
  parseImportDate,
  parseStaffCsv,
  staffCsvField,
  staffCsvHeaders,
  STAFF_IMPORT_MAX_ROWS,
  toStaffCsv,
  type StaffImportRow,
} from "./staff-import";

const labels = { focusArea: "Schedule Areas", certification: "Certifications", role: "Roles" };
const references = {
  focusAreas: [
    { id: 1, name: "Skilled Nursing" },
    { id: 2, name: "Memory Care" },
  ],
  certifications: [{ id: 10, name: "Registered Nurse", abbr: "RN" }],
  roles: [{ id: 20, name: "Charge Nurse" }],
};
const TODAY = "2026-11-10";

function row(overrides: Partial<StaffImportRow> = {}): StaffImportRow {
  return {
    rowNumber: 1,
    firstName: "Maria",
    lastName: "Lopez",
    email: "",
    phone: "",
    focusAreaNames: "Skilled Nursing",
    certificationName: "",
    roleNames: "",
    employment: "",
    firstDay: "",
    contactNotes: "",
    ...overrides,
  };
}

function check(
  rows: StaffImportRow[],
  existing = [] as {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }[],
) {
  return checkStaffImportRows(rows, { ...references, labels, existing, today: TODAY });
}

describe("parseCsvRecords", () => {
  it("keeps quoted commas, doubled quotes and line breaks inside one field", () => {
    expect(parseCsvRecords('a,"b, c","say ""hi""","two\nlines"\r\nnext,row')).toEqual([
      ["a", "b, c", 'say "hi"', "two\nlines"],
      ["next", "row"],
    ]);
  });

  it("drops a byte-order mark", () => {
    expect(parseCsvRecords("﻿first_name,last_name")).toEqual([["first_name", "last_name"]]);
  });
});

describe("parseStaffCsv", () => {
  it("reads the import's own headers, in any order and case", () => {
    const result = parseStaffCsv(
      "Last_Name,first_name,FOCUS_AREAS,employment,first_day\nLopez,Maria,Skilled Nursing,part-time,2026-12-01\n",
      labels,
    );
    expect(result).toEqual({
      ok: true,
      rows: [
        expect.objectContaining({
          rowNumber: 1,
          firstName: "Maria",
          lastName: "Lopez",
          focusAreaNames: "Skilled Nursing",
          employment: "part-time",
          firstDay: "2026-12-01",
        }),
      ],
    });
  });

  it("reads a People export, ignoring Status and Seniority", () => {
    const exported = toStaffCsv([
      [...staffCsvHeaders(labels), "Status", "Seniority"],
      [
        "Maria",
        "Lopez",
        "m@x.org",
        "",
        "Skilled Nursing; Memory Care",
        "Registered Nurse",
        "Charge Nurse",
        "Full-time",
        "",
        "=SUM(A1)",
        "Away until Jan 4",
        3,
      ],
    ]);
    const result = parseStaffCsv(exported, labels);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({
      firstName: "Maria",
      focusAreaNames: "Skilled Nursing; Memory Care",
      certificationName: "Registered Nurse",
      roleNames: "Charge Nurse",
      employment: "Full-time",
      contactNotes: "=SUM(A1)",
    });
  });

  it("names the organization's own label when the schedule area column is missing", () => {
    const result = parseStaffCsv("first_name,last_name\nMaria,Lopez\n", {
      ...labels,
      focusArea: "Wings",
    });
    expect(result).toEqual({
      ok: false,
      error:
        "This file has no column for wings. Start from the template, or name the columns the way it does.",
    });
  });

  it("accepts the organization's label as a header", () => {
    const result = parseStaffCsv("First Name,Last Name,Wing\nMaria,Lopez,East\n", {
      ...labels,
      focusArea: "Wings",
    });
    expect(result.ok && result.rows[0].focusAreaNames).toBe("East");
  });

  it("skips blank rows but keeps each person's row number", () => {
    const result = parseStaffCsv("first_name,last_name,focus_areas\nA,B,X\n,,\nC,D,X\n", labels);
    expect(result.ok && result.rows.map((r) => r.rowNumber)).toEqual([1, 3]);
  });

  it("refuses an empty file, a header alone and more than the limit", () => {
    expect(parseStaffCsv("", labels)).toMatchObject({ ok: false, error: "This file is empty." });
    expect(parseStaffCsv("first_name,last_name,focus_areas\n", labels)).toMatchObject({
      ok: false,
    });
    const many = ["first_name,last_name,focus_areas"]
      .concat(Array.from({ length: STAFF_IMPORT_MAX_ROWS + 1 }, (_, i) => `A${i},B,X`))
      .join("\n");
    expect(parseStaffCsv(many, labels)).toMatchObject({ ok: false });
  });
});

describe("isCsvFileName", () => {
  it("accepts any case", () => {
    expect(isCsvFileName("Staff.CSV")).toBe(true);
    expect(isCsvFileName("staff.xlsx")).toBe(false);
  });
});

describe("parseImportDate", () => {
  it("reads ISO and spreadsheet dates and refuses impossible ones", () => {
    expect(parseImportDate("2026-12-01")).toBe("2026-12-01");
    expect(parseImportDate("12/1/2026")).toBe("2026-12-01");
    expect(parseImportDate("2026-02-30")).toBeNull();
    expect(parseImportDate("next week")).toBeNull();
  });
});

describe("staffCsvField", () => {
  it("keeps a spreadsheet from running a cell as a formula", () => {
    expect(staffCsvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(staffCsvField("-5")).toBe("'-5");
    expect(staffCsvField("a, b")).toBe('"a, b"');
    expect(staffCsvField(null)).toBe("");
  });
});

describe("buildStaffImportTemplate", () => {
  it("uses the organization's labels and names, and reads back as two people", () => {
    const template = buildStaffImportTemplate(labels, references);
    expect(
      template.startsWith("﻿First Name,Last Name,Email,Phone,Schedule Areas,Certification,Roles"),
    ).toBe(true);
    const parsed = parseStaffCsv(template, labels);
    expect(parsed.ok && parsed.rows.map((r) => r.focusAreaNames)).toEqual([
      "Skilled Nursing",
      "Memory Care",
    ]);
    expect(parsed.ok && check(parsed.rows).map((r) => r.status)).toEqual(["ready", "ready"]);
  });
});

describe("checkStaffImportRows", () => {
  it("resolves a ready row, matching a certification by name or abbreviation", () => {
    const [result] = check([
      row({
        email: "Maria@Example.com",
        phone: "555-201-0100",
        focusAreaNames: "skilled nursing; Memory Care",
        certificationName: "rn",
        roleNames: "Charge Nurse",
        employment: "Part time",
        firstDay: "11/17/2026",
      }),
    ]);
    expect(result).toMatchObject({
      status: "ready",
      note: null,
      resolved: {
        email: "maria@example.com",
        phone: "(555) 201-0100",
        focusAreaIds: [1, 2],
        certificationId: 10,
        roleIds: [20],
        employmentType: "part_time",
        firstDay: "2026-11-17",
      },
    });
  });

  it("notes a ready row without an email can't be invited", () => {
    expect(check([row()])[0]).toMatchObject({ status: "ready", note: "No email, so no invite." });
  });

  it("refuses a row with no schedule area, an unknown one, or unknown references", () => {
    expect(check([row({ focusAreaNames: "" })])[0]).toMatchObject({
      status: "blocked",
      issues: [
        { title: "No schedule area", detail: "Each person needs at least one schedule area." },
      ],
    });
    expect(
      check([row({ focusAreaNames: "ICU", certificationName: "CNA", roleNames: "Med Tech" })])[0],
    ).toMatchObject({
      status: "blocked",
      issues: [
        { title: "Unknown schedule area", detail: "No schedule area is called ICU." },
        { title: "Unknown certification", detail: "No certification is called CNA." },
        { title: "Unknown role", detail: "No role is called Med Tech." },
      ],
    });
  });

  it("refuses bad names, email, phone and employment", () => {
    const [result] = check([
      row({ firstName: "", email: "nope", phone: "123", employment: "Seasonal" }),
    ]);
    expect(result.status).toBe("blocked");
    expect(result.status === "blocked" && result.issues.map((i) => i.title)).toEqual([
      "Check the name",
      "Check the email",
      "Check the phone",
      "Check the employment",
    ]);
  });

  it("refuses a first day outside today to a year ahead, or one it can't read", () => {
    const titles = (firstDay: string) => {
      const [result] = check([row({ firstDay })]);
      return result.status === "blocked" ? result.issues.map((i) => i.title) : [];
    };
    expect(titles("2029-01-05")).toEqual(["First day too far ahead"]);
    expect(titles("2026-11-01")).toEqual(["First day has passed"]);
    expect(titles("soon")).toEqual(["Check the first day"]);
    expect(check([row({ firstDay: TODAY })])[0].status).toBe("ready");
  });

  it("refuses someone already on staff and a repeat of an earlier row, keeping the first", () => {
    const existing = [
      { id: "e1", firstName: "Grace", lastName: "Okafor", email: "grace@x.org", phone: "" },
    ];
    const results = check(
      [
        row({ rowNumber: 1, firstName: "Ann", lastName: "Wu", email: "ann@x.org" }),
        row({ rowNumber: 2, firstName: "Gracie", lastName: "Oka", email: "grace@x.org" }),
        row({ rowNumber: 3, firstName: "Ann", lastName: "Wu", email: "ann@x.org" }),
      ],
      existing,
    );
    expect(results.map((r) => r.status)).toEqual(["ready", "blocked", "blocked"]);
    expect(results[1]).toMatchObject({
      issues: [{ detail: "Already on staff: Grace Okafor has this email." }],
    });
    expect(results[2]).toMatchObject({ issues: [{ title: "Same person as row 1" }] });
  });

  it("adds a similar name with a note to check it", () => {
    const [result] = check(
      [row({ firstName: "Jon", lastName: "Mitchell", email: "jon@x.org" })],
      [{ id: "e1", firstName: "John", lastName: "Mitchell", email: "john@x.org", phone: "" }],
    );
    expect(result).toMatchObject({
      status: "similar",
      issue: { detail: "Similar to John Mitchell on staff. Check it isn't the same person." },
    });
  });
});
