import { beforeEach, describe, expect, it, vi } from "vitest";

const getServiceClient = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient,
}));

describe("mobile auth organization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the organization summary for a valid slug", async () => {
    getServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
                name: "DubGrid Health",
                slug: "dubgrid-health",
              },
              error: null,
            }),
          })),
        })),
      })),
    });

    const { GET } = await import("./auth-organization");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/auth/organization?slug=dubgrid-health"),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
  });

  it("adds dev CORS headers for browser organization lookups", async () => {
    getServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
                name: "DubGrid Health",
                slug: "dubgrid-health",
              },
              error: null,
            }),
          })),
        })),
      })),
    });

    const { GET, OPTIONS } = await import("./auth-organization");
    const response = await GET({
      headers: new Headers({
        origin: "http://localhost:8081",
      }),
      nextUrl: new URL("http://localhost/api/mobile/v1/auth/organization?slug=dubgrid-health"),
    } as never);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:8081");

    const preflightResponse = await OPTIONS(
      new Request("http://localhost/api/mobile/v1/auth/organization", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8081",
          "Access-Control-Request-Method": "GET",
        },
      }) as never,
    );

    expect(preflightResponse.status).toBe(204);
    expect(preflightResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:8081",
    );
    expect(preflightResponse.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("returns 404 for unknown organizations", async () => {
    getServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      })),
    });

    const { GET } = await import("./auth-organization");
    const response = await GET({
      nextUrl: new URL("http://localhost/api/mobile/v1/auth/organization?slug=missing"),
    } as never);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "No organization matched that slug.",
    });
  });
});
