import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

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

  it("blocks press while loading, and says what it is doing", () => {
    const onPress = vi.fn();
    render(<Button label="Sign in" loading loadingLabel="Signing in" onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();

    // The label is never dropped for the spinner: it moves to the same action
    // in progress, so the button still says what it is working on.
    expect(screen.getByText("Signing in")).toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
  });

  it("keeps its own label while loading when no loadingLabel is given", () => {
    render(<Button label="Working" loading onPress={vi.fn()} />);
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("marks itself busy and disabled for assistive tech while loading", () => {
    render(<Button label="Working" loading onPress={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Working" });

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
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
