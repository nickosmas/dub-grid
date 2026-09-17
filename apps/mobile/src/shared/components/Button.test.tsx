import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";
import { mobileRadii, mobileRadius } from "../theme/tokens";

const hapticSelection = vi.fn();
const hapticImpact = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("../lib/haptics", () => ({
  hapticSelection: () => hapticSelection(),
  hapticImpact: (strength: string) => hapticImpact(strength),
  hapticNotify: vi.fn(),
}));

vi.mock("@expo/vector-icons/Ionicons", async () => {
  const React = await import("react");
  return {
    default: ({ name }: { name: string }) => React.createElement("i", { "data-icon": name }),
  };
});

let Button: (typeof import("./Button"))["Button"];

beforeAll(async () => {
  Button = (await import("./Button")).Button;
});

beforeEach(() => {
  hapticSelection.mockClear();
  hapticImpact.mockClear();
});

describe("Button", () => {
  it("renders its label and fires onPress", () => {
    const onPress = vi.fn();
    render(<Button label="Save changes" onPress={onPress} />);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps labels to one line, scaling before truncating", () => {
    render(<Button label="Accept and continue" onPress={vi.fn()} />);

    const label = screen.getByText("Accept and continue");
    expect(label).toHaveAttribute("data-number-of-lines", "1");
    expect(label).toHaveAttribute("data-adjusts-font-size-to-fit", "true");
    expect(label).toHaveAttribute("data-minimum-font-scale", "0.75");
    expect(label).toHaveAttribute("data-ellipsize-mode", "tail");
  });

  it("lets a link ellipsize instead of shrinking, with text padding", () => {
    render(<Button label="Skip" onPress={vi.fn()} tone="link" />);

    // A link is text: given a filled button's padding in a tight slot it
    // starved its own label, and iOS shrank "Skip" to a fraction of its size.
    const label = screen.getByText("Skip");
    // Two lines, not one: at accessibility sizes a one-line link truncated
    // its own question, and a link is a sentence rather than a control label.
    expect(label).toHaveAttribute("data-number-of-lines", "2");
    expect(label).not.toHaveAttribute("data-adjusts-font-size-to-fit");
    expect(label).not.toHaveAttribute("data-minimum-font-scale");
    expect(label).toHaveAttribute("data-ellipsize-mode", "tail");
  });

  it("uses the pill radius by default", () => {
    render(<Button label="Save changes" onPress={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Save changes" })).toHaveStyle({
      borderRadius: mobileRadii.pill,
    });
  });

  it("uses the tighter squircle radius when explicitly asked for one", () => {
    render(<Button label="Save changes" onPress={vi.fn()} shape="squircle" />);

    expect(screen.getByRole("button", { name: "Save changes" })).toHaveStyle({
      borderRadius: mobileRadius.md,
    });
  });

  it("prefers children over label for content", () => {
    render(
      <Button label="ignored" onPress={vi.fn()}>
        Custom content
      </Button>,
    );
    expect(screen.getByText("Custom content")).toBeInTheDocument();
  });

  it("blocks press and haptics while disabled", () => {
    const onPress = vi.fn();
    render(<Button disabled label="Save" onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    fireEvent.mouseDown(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it("blocks press while loading and keeps its action label", () => {
    const onPress = vi.fn();
    render(<Button label="Sign in" loading onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();

    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.queryByText("Signing in")).not.toBeInTheDocument();
  });

  it("keeps its own label while loading", () => {
    render(<Button label="Working" loading onPress={vi.fn()} />);
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("marks itself busy and disabled for assistive tech while loading", () => {
    render(<Button label="Working" loading onPress={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Working" });

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("runs an async press once when it is double-tapped", async () => {
    let settle!: () => void;
    const onPress = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    render(<Button label="Save" onPress={onPress} />);

    // Both taps in one tick. A `loading` prop only disables the pressable once
    // React has re-rendered, so without the synchronous latch the second tap
    // lands inside that window and the save runs twice.
    const button = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(screen.getByText("Save")).toBeInTheDocument();

    // Settling reopens the latch, so a genuine second save is still possible.
    await act(async () => {
      settle();
    });
    expect(button).not.toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("leaves a synchronous press untouched", () => {
    const onPress = vi.fn();
    render(<Button label="Filter" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Filter" });

    fireEvent.click(button);
    fireEvent.click(button);

    // Nothing to await, so nothing latches: a plain toggle still fires per tap.
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(button).not.toHaveAttribute("aria-busy", "true");
  });

  it("surfaces selected state for segment and filter usage", () => {
    render(<Button label="Week" onPress={vi.fn()} selected />);
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-selected", "true");
  });

  it("names an icon-only button from its accessibilityLabel", () => {
    render(
      <Button
        accessibilityLabel="Archive notification"
        icon="archive-outline"
        iconOnly
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Archive notification" })).toBeInTheDocument();
  });

  it("renders the requested icon", () => {
    const { container } = render(<Button icon="close" label="Dismiss" onPress={vi.fn()} />);
    expect(container.querySelector('[data-icon="close"]')).not.toBeNull();
  });

  it("fires a selection haptic on press-in by default", () => {
    render(<Button label="Continue" onPress={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Continue" }));
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit haptic strength", () => {
    render(<Button haptic="medium" label="Delete" onPress={vi.fn()} tone="danger" />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Delete" }));

    expect(hapticImpact).toHaveBeenCalledWith("medium");
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it("can opt out of haptics entirely", () => {
    render(<Button haptic="none" label="Quiet" onPress={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Quiet" }));

    expect(hapticSelection).not.toHaveBeenCalled();
    expect(hapticImpact).not.toHaveBeenCalled();
  });

  it("still renders every tone", () => {
    const tones = [
      "primary",
      "secondary",
      "neutral",
      "danger",
      "success",
      "warning",
      "ghost",
      "link",
    ] as const;

    render(
      <>
        {tones.map((tone) => (
          <Button key={tone} label={tone} onPress={vi.fn()} tone={tone} />
        ))}
      </>,
    );

    for (const tone of tones) {
      expect(screen.getByRole("button", { name: tone })).toBeInTheDocument();
    }
  });

  it("supports the deprecated compact alias alongside size", () => {
    render(
      <>
        <Button compact label="Compact" onPress={vi.fn()} />
        <Button label="Small" onPress={vi.fn()} size="sm" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Compact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Small" })).toBeInTheDocument();
  });
});
