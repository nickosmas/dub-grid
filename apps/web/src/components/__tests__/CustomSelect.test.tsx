import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CustomSelect from "@/components/CustomSelect";

describe("CustomSelect", () => {
  it("focuses the opened listbox without scrolling the page", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");

    render(
      <CustomSelect
        value="one"
        options={[
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
        ]}
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /one/i }));

    const listbox = await screen.findByRole("listbox");
    const focusCallIndex = focusSpy.mock.contexts.findIndex((instance) => instance === listbox);

    expect(focusCallIndex).toBeGreaterThanOrEqual(0);
    expect(focusSpy.mock.calls[focusCallIndex]?.[0]).toEqual({
      preventScroll: true,
    });

    focusSpy.mockRestore();
  });
});
