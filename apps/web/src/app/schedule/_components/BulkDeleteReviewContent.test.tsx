import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BulkDeleteReviewContent, {
  getBulkDeleteReviewCounts,
  getBulkDeleteReviewPeople,
  type BulkDeleteReviewTarget,
} from "./BulkDeleteReviewContent";

const targets: BulkDeleteReviewTarget[] = [
  {
    key: "emp-1_2026-05-04",
    empId: "emp-1",
    date: new Date("2026-05-04T00:00:00"),
    empName: "Alex Taylor",
    shiftLabel: "Day",
    isPublishedBacked: true,
  },
  {
    key: "emp-1_2026-05-06",
    empId: "emp-1",
    date: new Date("2026-05-06T00:00:00"),
    empName: "Alex Taylor",
    shiftLabel: "Evening",
    isPublishedBacked: false,
  },
  {
    key: "emp-2_2026-05-05",
    empId: "emp-2",
    date: new Date("2026-05-05T00:00:00"),
    empName: "Jordan Reed",
    shiftLabel: "Sick",
    isPublishedBacked: false,
  },
];

describe("BulkDeleteReviewContent", () => {
  it("counts published entries and unpublished changes", () => {
    expect(getBulkDeleteReviewCounts(targets)).toEqual({
      publishedBacked: 1,
      draftOnly: 2,
    });
  });

  it("groups selected entries by person", () => {
    const people = getBulkDeleteReviewPeople(targets);

    expect(people).toHaveLength(2);
    expect(people[0]?.empName).toBe("Alex Taylor");
    expect(people[0]?.targets).toHaveLength(2);
    expect(people[1]?.empName).toBe("Jordan Reed");
    expect(people[1]?.targets).toHaveLength(1);
  });

  it("renders the review copy, counts, and selected entries", () => {
    render(<BulkDeleteReviewContent targets={targets} />);

    expect(
      screen.getByText(
        "Remove 3 selected entries? Entries already on the published schedule will be removed from the live schedule when you publish these changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 already published")).toBeInTheDocument();
    expect(screen.getByText("2 unpublished changes")).toBeInTheDocument();

    const list = screen.getByRole("list", {
      name: "People with entries selected for removal",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Alex Taylor");
    expect(rows[0]).toHaveTextContent("2 entries affected");
    expect(rows[0]).not.toHaveTextContent("Day");
    expect(rows[0]).not.toHaveTextContent("Evening");
    expect(rows[1]).toHaveTextContent("Jordan Reed");
    expect(rows[1]).toHaveTextContent("1 entry affected");
    expect(rows[1]).not.toHaveTextContent("Sick");
  });
});
