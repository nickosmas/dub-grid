import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiResponseError,
  appendQueryParams,
  createHeaders,
  createJsonApiRequest,
  getRequestOrigin,
} from "./index";

describe("createHeaders", () => {
  it("merges extra headers on top of the init headers", () => {
    const headers = createHeaders(
      { headers: { Accept: "application/json" } },
      { "x-dubgrid-org-id": "org-1" },
    );
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-dubgrid-org-id")).toBe("org-1");
  });

  it("skips undefined extra header values", () => {
    const headers = createHeaders(
      {},
      { "x-dubgrid-org-id": undefined },
    );
    expect(headers.has("x-dubgrid-org-id")).toBe(false);
  });
});

describe("getRequestOrigin", () => {
  it("returns the origin of a valid URL", () => {
    expect(getRequestOrigin("https://app.example.com/api/foo?x=1")).toBe(
      "https://app.example.com",
    );
  });

  it("returns the candidate unchanged when it is not a valid URL", () => {
    expect(getRequestOrigin("not-a-url")).toBe("not-a-url");
  });
});

describe("appendQueryParams", () => {
  it("returns the bare path when there is no query", () => {
    expect(appendQueryParams("/api/people")).toBe("/api/people");
  });

  it("appends only the defined query values", () => {
    expect(
      appendQueryParams("/api/people", { orgId: "org-1", search: undefined }),
    ).toBe("/api/people?orgId=org-1");
  });

  it("returns the bare path when every query value is undefined", () => {
    expect(appendQueryParams("/api/people", { search: undefined })).toBe(
      "/api/people",
    );
  });
});

describe("createJsonApiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a successful JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ value: 42 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const result = await createJsonApiRequest({
      baseUrl: "https://api.example.com",
      path: "/thing",
      init: {},
      parse: (value) => (value as { value: number }).value,
    });

    expect(result).toBe(42);
  });

  it("throws ApiResponseError with the parsed message on a non-ok JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Not allowed" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(
      createJsonApiRequest({
        baseUrl: "https://api.example.com",
        path: "/thing",
        init: {},
        parse: (value) => value,
      }),
    ).rejects.toMatchObject(
      new ApiResponseError("Not allowed", 403, { error: "Not allowed" }),
    );
  });

  it("invokes onAuthFailure on a 401 when handleAuthFailure is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Unauthenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const onAuthFailure = vi.fn();

    await expect(
      createJsonApiRequest({
        baseUrl: "https://api.example.com",
        path: "/thing",
        init: {},
        parse: (value) => value,
        handleAuthFailure: true,
        onAuthFailure,
      }),
    ).rejects.toThrow();

    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("throws a transport error when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      createJsonApiRequest({
        baseUrl: "https://api.example.com",
        path: "/thing",
        init: {},
        parse: (value) => value,
      }),
    ).rejects.toThrow("Request failed for https://api.example.com");
  });
});
