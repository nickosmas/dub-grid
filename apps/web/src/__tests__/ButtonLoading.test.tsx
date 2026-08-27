import { render, screen } from "@testing-library/react";
import { Check } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ButtonLoading } from "@/components/ButtonSpinner";

describe("ButtonLoading", () => {
  it("renders the icon and the idle label when it is not loading", () => {
    render(
      <button>
        <ButtonLoading loading={false} icon={<Check data-testid="check" />}>
          Save
        </ButtonLoading>
      </button>,
    );

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByTestId("check")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the spinner beside the unchanged action label", () => {
    render(
      <button>
        <ButtonLoading loading icon={<Check data-testid="check" />}>
          Save
        </ButtonLoading>
      </button>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    // The spinner replaces the leading icon, but the action label stays stable.
    expect(screen.getByRole("button")).toHaveTextContent("Save");
    expect(screen.queryByText("Saving")).not.toBeInTheDocument();
    expect(screen.queryByTestId("check")).not.toBeInTheDocument();
  });
});
