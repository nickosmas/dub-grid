import { describe, expect, it, vi } from "vitest";
import { fetchAllRows, type PagedQueryResult } from "@/lib/db/shared";

describe("fetchAllRows", () => {
  it("returns an empty array after a single call for an empty result set", async () => {
    const fetchPage = vi.fn(async (): Promise<PagedQueryResult<number>> => ({
      data: [],
      error: null,
    }));

    const rows = await fetchAllRows(fetchPage, 3);

    expect(rows).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("returns all rows after one call when the page is shorter than pageSize", async () => {
    const fetchPage = vi.fn(async (): Promise<PagedQueryResult<number>> => ({
      data: [1, 2],
      error: null,
    }));

    const rows = await fetchAllRows(fetchPage, 5);

    expect(rows).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, 4);
  });

  it("issues one harmless trailing empty request when the total is an exact multiple of pageSize", async () => {
    const pages: PagedQueryResult<number>[] = [
      { data: [1, 2, 3], error: null },
      { data: [4, 5, 6], error: null },
      { data: [], error: null },
    ];
    const fetchPage = vi.fn(async () => pages.shift()!);

    const rows = await fetchAllRows(fetchPage, 3);

    expect(rows).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 3, 5);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 6, 8);
  });

  it("accumulates contiguous, non-overlapping pages until a final partial page", async () => {
    const pages: PagedQueryResult<number>[] = [
      { data: [1, 2], error: null },
      { data: [3, 4], error: null },
      { data: [5], error: null },
    ];
    const fetchPage = vi.fn(async () => pages.shift()!);

    const rows = await fetchAllRows(fetchPage, 2);

    expect(rows).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 4, 5);
  });

  it("propagates an error from the first page without calling again", async () => {
    const fetchPage = vi.fn(async (): Promise<PagedQueryResult<number>> => ({
      data: null,
      error: { message: "boom" },
    }));

    await expect(fetchAllRows(fetchPage, 3)).rejects.toEqual({ message: "boom" });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("propagates an error from a later page and discards already-accumulated rows", async () => {
    const pages: PagedQueryResult<number>[] = [
      { data: [1, 2, 3], error: null },
      { data: null, error: { message: "boom" } },
    ];
    const fetchPage = vi.fn(async () => pages.shift()!);

    await expect(fetchAllRows(fetchPage, 3)).rejects.toEqual({ message: "boom" });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("honors a custom pageSize", async () => {
    const pages: PagedQueryResult<number>[] = [
      { data: [1], error: null },
      { data: [], error: null },
    ];
    const fetchPage = vi.fn(async () => pages.shift()!);

    const rows = await fetchAllRows(fetchPage, 1);

    expect(rows).toEqual([1]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1, 1);
  });
});
