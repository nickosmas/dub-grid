import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Table } from "./table";

describe("Table scroll cues", () => {
  it("shows directional cues only where more columns exist and pages the table", () => {
    render(
      <Table showScrollCues scrollLabel="People roster">
        <tbody>
          <tr>
            <td>Person</td>
          </tr>
        </tbody>
      </Table>,
    );

    const scroller = document.querySelector('[data-slot="table-container"]');
    if (!(scroller instanceof HTMLDivElement)) throw new Error("Missing table scroller");
    Object.defineProperties(scroller, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 900 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;

    fireEvent.scroll(scroller);
    expect(screen.queryByRole("button", { name: "Scroll People roster left" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Scroll People roster right" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: "smooth" });

    scroller.scrollLeft = 300;
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "Scroll People roster left" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Scroll People roster right" })).toBeVisible();

    scroller.scrollLeft = 600;
    fireEvent.scroll(scroller);
    expect(screen.getByRole("button", { name: "Scroll People roster left" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Scroll People roster right" })).toBeNull();
  });
});
