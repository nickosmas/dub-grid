import { render } from "@testing-library/react";
import { AlarmClock, CircleCheck, CircleX, Info, RefreshCw } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StatusIcon } from "./StatusIcon";

describe("StatusIcon", () => {
  it.each([
    ["CircleCheck", CircleCheck],
    ["CircleX", CircleX],
    ["Info", Info],
    ["AlarmClock", AlarmClock],
  ])("draws %s as one solid shape, not its ring inside a disc", (_name, icon) => {
    const { container } = render(<StatusIcon tone="success" icon={icon} size={20} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });

  it("sits a line icon, with nothing to fill, in a tone disc", () => {
    const { container } = render(<StatusIcon tone="info" icon={RefreshCw} size={20} />);
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
