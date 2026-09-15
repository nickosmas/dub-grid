import { describe, expect, it } from "vitest";
import {
  getAdaptiveSettingsTableLayout,
  SETTINGS_TABLE_STANDARD_WIDTH,
  type AdaptiveSettingsTableColumn,
} from "@/components/settings/settings-table-layout";

const nameColumn = (values: string[] = []): AdaptiveSettingsTableColumn => ({
  header: "Name",
  values,
  minWidth: 220,
  maxWidth: 360,
});

const statusColumn: AdaptiveSettingsTableColumn = {
  header: "Schedule eligibility",
  values: ["Yes", "No"],
  minWidth: 170,
  maxWidth: 200,
};

describe("adaptive Settings table layout", () => {
  it("uses the Departments screen width as the read-table minimum", () => {
    const empty = getAdaptiveSettingsTableLayout({ columns: [nameColumn()], isEditing: false });
    const populated = getAdaptiveSettingsTableLayout({
      columns: [nameColumn(["RN"])],
      isEditing: false,
    });

    expect(empty.maxWidth).toBe(SETTINGS_TABLE_STANDARD_WIDTH);
    expect(populated.maxWidth).toBe(SETTINGS_TABLE_STANDARD_WIDTH);
    expect(populated.gridTemplateColumns).toBe("minmax(0, 1fr)");
  });

  it("does not shrink below the standard width and grows for genuinely dense columns", () => {
    const one = getAdaptiveSettingsTableLayout({ columns: [nameColumn()], isEditing: false });
    const two = getAdaptiveSettingsTableLayout({
      columns: [nameColumn(), statusColumn],
      isEditing: false,
    });
    const dense = getAdaptiveSettingsTableLayout({
      columns: Array.from({ length: 6 }, (_, index) => ({
        header: `Column ${index + 1}`,
        values: ["A".repeat(60)],
        minWidth: 160,
        maxWidth: 260,
      })),
      isEditing: false,
      availableWidth: 1280,
    });

    expect(two.maxWidth).toBe(one.maxWidth);
    expect(one.maxWidth).toBe(SETTINGS_TABLE_STANDARD_WIDTH);
    expect(dense.maxWidth).toBe(1280);
  });

  it("uses long content up to the column cap without allowing it to dominate", () => {
    const short = getAdaptiveSettingsTableLayout({
      columns: [nameColumn(["RN"]), statusColumn],
      isEditing: false,
    });
    const long = getAdaptiveSettingsTableLayout({
      columns: [nameColumn(["Director of Christian Science Nursing"]), statusColumn],
      isEditing: false,
    });
    const extreme = getAdaptiveSettingsTableLayout({
      columns: [nameColumn(["A".repeat(500)]), statusColumn],
      isEditing: false,
    });

    expect(long.columnWidths[0]).toBeGreaterThan(short.columnWidths[0]);
    expect(extreme.columnWidths[0]).toBe(360);
    expect(extreme.maxWidth).toBeLessThanOrEqual(1120);
  });

  it("expands only in edit mode for its handle and action controls", () => {
    const columns = [nameColumn(["Charge Nurse"]), statusColumn];
    const read = getAdaptiveSettingsTableLayout({
      columns,
      isEditing: false,
      availableWidth: 1280,
    });
    const edit = getAdaptiveSettingsTableLayout({
      columns,
      isEditing: true,
      availableWidth: 1280,
    });

    expect(edit.maxWidth).toBeGreaterThan(read.maxWidth);
    expect(read.gridTemplateColumns).not.toContain("24px");
    expect(edit.gridTemplateColumns).toMatch(/^24px .* 72px$/);
    expect(edit.gridTemplateColumns.match(/minmax\(0, 1fr\)/g)).toHaveLength(2);
  });

  it("honors a narrow parent cap without adding a table minimum width", () => {
    const layout = getAdaptiveSettingsTableLayout({
      columns: [nameColumn(["A".repeat(100)]), statusColumn],
      isEditing: true,
      availableWidth: 320,
    });

    expect(layout.maxWidth).toBe(320);
    expect(layout.gridTemplateColumns).toContain("minmax(0,");
    expect(layout.gridTemplateColumns).not.toContain("minmax(220px");
  });

  it("never exceeds the available width with a dense long-content table", () => {
    const layout = getAdaptiveSettingsTableLayout({
      columns: Array.from({ length: 8 }, (_, index) => ({
        header: `Column ${index + 1}`,
        values: ["Long content value".repeat(10)],
        minWidth: 160,
        maxWidth: 360,
      })),
      isEditing: true,
      availableWidth: 1280,
    });

    expect(layout.maxWidth).toBe(1280);
    expect(layout.columnWidths).toEqual(Array(8).fill(360));
  });
});
