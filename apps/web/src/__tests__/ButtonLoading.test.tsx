import { render, screen } from "@testing-library/react";
import { Check } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ButtonLoading } from "@/components/ButtonSpinner";

describe("ButtonLoading", () => {
  it("renders the icon and the idle label when it is not loading", () => {
    render(
      <button>
        <ButtonLoading loading={false} loadingLabel="Saving" icon={<Check data-testid="check" />}>
          Save
        </ButtonLoading>
      </button>,
    );

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByTestId("check")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the spinner beside the label, never instead of it", () => {
    render(
      <button>
        <ButtonLoading loading loadingLabel="Saving" icon={<Check data-testid="check" />}>
          Save
        </ButtonLoading>
      </button>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    // The wording moves to the action in progress, and the leading icon is the
    // thing the spinner stands in for.
    expect(screen.getByRole("button")).toHaveTextContent("Saving");
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.queryByTestId("check")).not.toBeInTheDocument();
  });
});
