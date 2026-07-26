import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

let FilterButton: (typeof import("./FilterSheet"))["FilterButton"];
let FilterSheet: (typeof import("./FilterSheet"))["FilterSheet"];
let SelectionRow: (typeof import("./FilterSheet"))["SelectionRow"];
let SelectionSection: (typeof import("./FilterSheet"))["SelectionSection"];

beforeAll(async () => {
  const mod = await import("./FilterSheet");
  FilterButton = mod.FilterButton;
  FilterSheet = mod.FilterSheet;
  SelectionRow = mod.SelectionRow;
  SelectionSection = mod.SelectionSection;
});

describe("FilterSheet", () => {
  it("renders the title and children, and wires Done/Clear all", () => {
    const onDone = vi.fn();
    const onClearAll = vi.fn();
    const onDismiss = vi.fn();

    render(
      <FilterSheet
        title="Filter open shifts"
        onClearAll={onClearAll}
        onDismiss={onDismiss}
        onDone={onDone}
        visible
      >
        <SelectionSection label="Urgency">
          <SelectionRow label="High" onPress={() => {}} selected={false} />
        </SelectionSection>
      </FilterSheet>,
    );

    expect(screen.getByText("Filter open shifts")).toBeInTheDocument();
    expect(screen.getByText("Urgency")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("omits the Clear all button when onClearAll is not provided", () => {
    render(
      <FilterSheet title="Filter activity" onDismiss={() => {}} onDone={() => {}} visible>
        <SelectionSection label="Type">
          <SelectionRow label="Publish" onPress={() => {}} selected />
        </SelectionSection>
      </FilterSheet>,
    );

    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});

describe("SelectionRow", () => {
  it("calls onPress when tapped", () => {
    const onPress = vi.fn();
    render(<SelectionRow label="ICU" onPress={onPress} selected={false} />);

    fireEvent.click(screen.getByText("ICU"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders an optional detail line", () => {
    render(<SelectionRow detail="6 people" label="ER" onPress={() => {}} selected={false} />);

    expect(screen.getByText("6 people")).toBeInTheDocument();
  });
});

describe("FilterButton", () => {
  it("calls onPress and reflects the active filter count via accessibility state", () => {
    const onPress = vi.fn();
    render(
      <FilterButton
        accessibilityLabel="Open filters"
        activeCount={2}
        expanded={false}
        onPress={onPress}
      />,
    );

    fireEvent.click(screen.getByLabelText("Open filters"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Filter")).toBeInTheDocument();
  });
});
