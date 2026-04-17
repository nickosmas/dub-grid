import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExplainerSection, PreviewFrame, WorkflowStrip } from "@/components/ui/explainer-section";

describe("ExplainerSection", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders points and preview content when open", () => {
    render(
      <ExplainerSection
        title="Coverage logic"
        defaultOpen
        points={[
          {
            title: "Point one",
            description: "Description one",
          },
        ]}
        preview={(
          <PreviewFrame title="Example">
            <WorkflowStrip
              steps={[
                { label: "Step one", description: "First step" },
                { label: "Step two", description: "Second step" },
              ]}
            />
          </PreviewFrame>
        )}
      />,
    );

    expect(screen.getByText("Coverage logic")).toBeInTheDocument();
    expect(screen.getByText("Point one")).toBeInTheDocument();
    expect(screen.getByText("Description one")).toBeInTheDocument();
    expect(screen.getByText("Visual examples")).toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText("Step one")).toBeInTheDocument();
  });

  it("toggles open and closed state", () => {
    render(
      <ExplainerSection
        title="Shift code logic"
        defaultOpen={false}
        points={[
          {
            title: "Point one",
            description: "Description one",
          },
        ]}
      />,
    );

    expect(screen.queryByText("Point one")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("Point one")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("Point one")).not.toBeInTheDocument();
  });

  it("loads and persists the stored preference", async () => {
    window.localStorage.setItem("dg-explainer-test", "closed");

    render(
      <ExplainerSection
        title="Stored explainer"
        defaultOpen
        storageKey="dg-explainer-test"
        points={[
          {
            title: "Stored point",
            description: "Stored description",
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Stored point")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    await waitFor(() => {
      expect(window.localStorage.getItem("dg-explainer-test")).toBe("open");
    });
  });
});
