import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let TimeZoneClocks: (typeof import("./TimeZoneClocks"))["TimeZoneClocks"];

beforeAll(async () => {
  TimeZoneClocks = (await import("./TimeZoneClocks")).TimeZoneClocks;
});

const RealDateTimeFormat = Intl.DateTimeFormat;

function mockDeviceTimeZone(timeZone: string) {
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation((...args: unknown[]) => {
    if (args.length === 0) {
      return { resolvedOptions: () => ({ timeZone }) } as unknown as Intl.DateTimeFormat;
    }
    return new RealDateTimeFormat(...(args as ConstructorParameters<typeof Intl.DateTimeFormat>));
  });
}

describe("TimeZoneClocks", () => {
  beforeEach(() => {
    mockDeviceTimeZone("America/New_York");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when the device matches the org's timezone", () => {
    const { container } = render(
      <TimeZoneClocks now={new Date("2026-06-01T14:00:00Z")} orgTimezone="America/New_York" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the facility's clock when the device differs from the org's timezone", () => {
    mockDeviceTimeZone("Africa/Nairobi");

    render(
      <TimeZoneClocks now={new Date("2026-06-01T14:00:00Z")} orgTimezone="America/New_York" />,
    );

    expect(screen.getByText(/Facility time/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
    expect(screen.queryByText(/5:00 PM/)).not.toBeInTheDocument();
  });

  it("renders nothing when no org timezone is set and the device is UTC", () => {
    mockDeviceTimeZone("UTC");

    const { container } = render(
      <TimeZoneClocks now={new Date("2026-06-01T14:00:00Z")} orgTimezone={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
