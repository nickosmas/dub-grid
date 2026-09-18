import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let DubGridLogo: (typeof import("./DubGridLogo"))["DubGridLogo"];
let cellPositions: (typeof import("./DubGridLogo"))["cellPositions"];
let RECESSIVE_CELL_OPACITY: (typeof import("./DubGridLogo"))["RECESSIVE_CELL_OPACITY"];

beforeAll(async () => {
  const mod = await import("./DubGridLogo");
  DubGridLogo = mod.DubGridLogo;
  cellPositions = mod.cellPositions;
  RECESSIVE_CELL_OPACITY = mod.RECESSIVE_CELL_OPACITY;
});

describe("DubGridLogo", () => {
  it("renders the mark as an image for assistive technology", () => {
    render(<DubGridLogo />);

    const logo = screen.getByTestId("dubgrid-logo");
    expect(logo.getAttribute("role")).toBe("image");
    expect(logo.getAttribute("aria-label")).toBe("DubGrid logo");
  });

  // The pinwheel is the mark's identity, and it matches the web `DubGridLogo`
  // rect opacities exactly. Drift here means the two platforms stop agreeing
  // on what the approved logo looks like.
  it("keeps the approved pinwheel: solid top-right to bottom-left", () => {
    const [topLeft, topRight, bottomLeft, bottomRight] = cellPositions(10);

    expect(topLeft).toEqual({ x: 0, y: 0, opacity: RECESSIVE_CELL_OPACITY });
    expect(topRight).toEqual({ x: 10, y: 0, opacity: 1 });
    expect(bottomLeft).toEqual({ x: 0, y: 10, opacity: 1 });
    expect(bottomRight).toEqual({ x: 10, y: 10, opacity: RECESSIVE_CELL_OPACITY });
  });

  it("renders exactly four cells", () => {
    expect(cellPositions(10)).toHaveLength(4);
  });
});
