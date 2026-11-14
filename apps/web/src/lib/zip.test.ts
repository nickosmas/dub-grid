// @vitest-environment node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "./zip";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("buildZip", () => {
  it("writes an archive that unzip reads back file for file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zip-test-"));
    const archive = path.join(dir, "export.zip");
    writeFileSync(
      archive,
      buildZip(
        [
          { name: "staff.csv", content: "Name,Email\nAda Lovelace,ada@example.com\n" },
          { name: "notes/activity.csv", content: "Line,Text\n1,ünïcode ✓\n" },
        ],
        new Date("2026-11-13T10:30:00Z"),
      ),
    );

    execFileSync("unzip", ["-q", archive, "-d", dir]);

    expect(readFileSync(path.join(dir, "staff.csv"), "utf8")).toBe(
      "Name,Email\nAda Lovelace,ada@example.com\n",
    );
    expect(readFileSync(path.join(dir, "notes", "activity.csv"), "utf8")).toBe(
      "Line,Text\n1,ünïcode ✓\n",
    );
    expect(execFileSync("unzip", ["-tq", archive]).toString()).toMatch(/No errors detected/);
  });

  it("writes an empty archive as just its end record", () => {
    expect(buildZip([])).toHaveLength(22);
  });
});
