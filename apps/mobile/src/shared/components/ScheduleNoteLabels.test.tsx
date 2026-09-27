import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { MobileScheduleIndicator } from "@dubgrid/contracts";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let ScheduleNoteLabels: (typeof import("./ScheduleNoteLabels"))["ScheduleNoteLabels"];

beforeAll(async () => {
  ScheduleNoteLabels = (await import("./ScheduleNoteLabels")).ScheduleNoteLabels;
});

const NOTES: MobileScheduleIndicator[] = [
  { indicatorTypeId: 1, focusAreaId: null, name: "Float", color: "#E24B4A", state: "published" },
  { indicatorTypeId: 2, focusAreaId: 3, name: "Training", color: "#378ADD", state: "draft_added" },
];

const iconNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-icon-name]")).map((icon) =>
    icon.getAttribute("data-icon-name"),
  );

describe("ScheduleNoteLabels", () => {
  it("lists the notes after one sticky note, comma separated, with an editor's draft state", () => {
    const { container } = render(<ScheduleNoteLabels notes={NOTES} />);

    const list = screen.getByLabelText("Schedule notes: Float; Training, added, not published");
    expect(list).toHaveTextContent(/^Float, Training \(added, not published\)$/);
    expect(iconNames(container)).toEqual(["note-outline"]);
  });

  it("leaves the icon to a row that already leads with one", () => {
    const { container } = render(<ScheduleNoteLabels notes={NOTES} showIcon={false} />);

    expect(iconNames(container)).toEqual([]);
    expect(screen.getByLabelText(/^Schedule notes: Float/)).toHaveTextContent("Float, Training");
  });

  it("renders nothing without notes", () => {
    const { container } = render(<ScheduleNoteLabels notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
