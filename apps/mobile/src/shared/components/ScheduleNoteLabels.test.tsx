import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let ScheduleNoteLabels: (typeof import("./ScheduleNoteLabels"))["ScheduleNoteLabels"];

beforeAll(async () => {
  ScheduleNoteLabels = (await import("./ScheduleNoteLabels")).ScheduleNoteLabels;
});

describe("ScheduleNoteLabels", () => {
  it("spells each note out, with an editor's draft state", () => {
    render(
      <ScheduleNoteLabels
        notes={[
          {
            indicatorTypeId: 1,
            focusAreaId: null,
            name: "Float",
            color: "#E24B4A",
            state: "published",
          },
          {
            indicatorTypeId: 2,
            focusAreaId: 3,
            name: "Training",
            color: "#378ADD",
            state: "draft_added",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Float")).toHaveTextContent("Float");
    expect(screen.getByLabelText("Training, added, not published")).toHaveTextContent(
      "Training (added, not published)",
    );
    expect(
      screen.getByLabelText("Schedule notes: Float; Training, added, not published"),
    ).toBeInTheDocument();
  });

  it("renders nothing without notes", () => {
    const { container } = render(<ScheduleNoteLabels notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
