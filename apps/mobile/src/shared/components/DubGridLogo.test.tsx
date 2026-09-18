import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let DubGridLogo: (typeof import("./DubGridLogo"))["DubGridLogo"];
let staticOpacity: (typeof import("./DubGridLogo"))["staticOpacity"];

beforeAll(async () => {
  const mod = await import("./DubGridLogo");
  DubGridLogo = mod.DubGridLogo;
  staticOpacity = mod.staticOpacity;
});

describe("DubGridLogo", () => {
  it("renders the mark as an image for assistive technology", () => {
    render(<DubGridLogo />);

    const logo = screen.getByTestId("dubgrid-logo");
    expect(logo.getAttribute("role")).toBe("image");
    expect(logo.getAttribute("aria-label")).toBe("DubGrid logo");
  });

  // The ramp is the mark's identity, and it matches the web `DubGridLogo`
  // rect opacities exactly. Drift here means the two platforms stop agreeing
  // on what the approved logo looks like.
  it("keeps the approved depth ramp", () => {
    expect(staticOpacity(0, 0)).toBe(1);
    expect(staticOpacity(0, 3)).toBe(1);
    expect(staticOpacity(3, 0)).toBe(1);
    expect(staticOpacity(2, 2)).toBe(0.75);
    expect(staticOpacity(3, 3)).toBe(0.3);
  });
});
