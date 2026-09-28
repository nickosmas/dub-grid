import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let FitText: (typeof import("./FitText"))["FitText"];

beforeAll(async () => {
  FitText = (await import("./FitText")).FitText;
});

const LABEL_STYLE = { fontSize: 17, lineHeight: 22 };
const slotOf = (label: string) => screen.getAllByText(label)[0].parentElement;

describe("FitText", () => {
  it("measures a new label from scratch rather than against the last label's slot", () => {
    const { rerender } = render(<FitText style={LABEL_STYLE}>Continue</FitText>);
    const firstSlot = slotOf("Continue");

    rerender(<FitText style={LABEL_STYLE}>Verify and sign in</FitText>);

    // A remount drops the shorter label's slot width along with everything else.
    expect(slotOf("Verify and sign in")).not.toBe(firstSlot);
  });

  it("keeps its measurement while the label and size stay the same", () => {
    const { rerender } = render(<FitText style={LABEL_STYLE}>Sign in</FitText>);
    const firstSlot = slotOf("Sign in");

    rerender(<FitText style={LABEL_STYLE}>Sign in</FitText>);
    expect(slotOf("Sign in")).toBe(firstSlot);

    rerender(<FitText style={{ ...LABEL_STYLE, fontSize: 20 }}>Sign in</FitText>);
    expect(slotOf("Sign in")).not.toBe(firstSlot);
  });
});
