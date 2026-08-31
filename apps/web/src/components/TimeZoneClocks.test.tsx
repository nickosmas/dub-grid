import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TimeZoneClocks from "./TimeZoneClocks";

const getBrowserTimezone = vi.fn();

vi.mock("@/lib/timezones", () => ({
  getBrowserTimezone: () => getBrowserTimezone(),
}));

describe("TimeZoneClocks", () => {
  afterEach(() => {
    getBrowserTimezone.mockReset();
  });

  it("renders nothing when the browser matches the org's timezone", () => {
    getBrowserTimezone.mockReturnValue("America/New_York");
    const { container } = render(
      <TimeZoneClocks now={new Date("2026-06-01T14:00:00Z")} orgTimezone="America/New_York" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("labels both clocks when the browser differs from the org's timezone", () => {
    getBrowserTimezone.mockReturnValue("Africa/Nairobi");
    render(
      <TimeZoneClocks now={new Date("2026-06-01T14:00:00Z")} orgTimezone="America/New_York" />,
    );

    expect(screen.getByText(/Local time/)).toBeInTheDocument();
    expect(screen.getByText(/Organization time/)).toBeInTheDocument();
    expect(screen.getByText(/5:00 PM/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
  });

  it("compact mode omits the date but keeps both labeled clocks", () => {
    getBrowserTimezone.mockReturnValue("Africa/Nairobi");
    render(
      <TimeZoneClocks
        compact
        now={new Date("2026-06-01T14:00:00Z")}
        orgTimezone="America/New_York"
      />,
    );

    expect(screen.getByText(/5:00 PM/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
  });

  it("renders nothing when no org timezone is set and the browser is UTC", () => {
    getBrowserTimezone.mockReturnValue("UTC");
    const { container } = render(
      <TimeZoneClocks now={new Date("2026-06-01T14:00:00Z")} orgTimezone={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
