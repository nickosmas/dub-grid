import { describe, expect, it, vi } from "vitest";
import {
  cachedTableFor,
  createServiceReadCache,
  SERVICE_READ_CACHE_TTL_MS,
} from "./service-read-cache";

const BASE = "https://project.supabase.co";
const FOCUS = `${BASE}/rest/v1/focus_areas?select=id%2Cname&org_id=eq.org-1`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup() {
  let clock = 1_000;
  let served = 0;
  const base = vi.fn(async () => {
    served += 1;
    return jsonResponse([{ id: served }]);
  });
  const cache = createServiceReadCache(base as unknown as typeof fetch, () => clock);
  return {
    base,
    cache,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("cachedTableFor", () => {
  it("names only the settings tables it keeps", () => {
    expect(cachedTableFor(FOCUS)).toBe("focus_areas");
    expect(cachedTableFor(`${BASE}/rest/v1/employees?select=id`)).toBeNull();
    expect(cachedTableFor(`${BASE}/rest/v1/rpc/focus_areas`)).toBeNull();
    expect(cachedTableFor(`${BASE}/auth/v1/user`)).toBeNull();
  });
});

describe("createServiceReadCache", () => {
  it("answers a repeated read from the cache within the window", async () => {
    const { base, cache } = setup();
    const first = await (await cache.fetch(FOCUS)).json();
    const second = await (await cache.fetch(FOCUS)).json();
    expect(base).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("reads again once the window has passed", async () => {
    const { base, cache, advance } = setup();
    await cache.fetch(FOCUS);
    advance(SERVICE_READ_CACHE_TTL_MS + 1);
    const again = await (await cache.fetch(FOCUS)).json();
    expect(base).toHaveBeenCalledTimes(2);
    expect(again).toEqual([{ id: 2 }]);
  });

  it("shares one request between identical reads in flight", async () => {
    const { base, cache } = setup();
    const [a, b, c] = await Promise.all([
      cache.fetch(FOCUS),
      cache.fetch(FOCUS),
      cache.fetch(FOCUS),
    ]);
    expect(base).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual(await b.json());
    expect(await c.json()).toEqual([{ id: 1 }]);
  });

  it("keys on headers that change the answer", async () => {
    const { base, cache } = setup();
    await cache.fetch(FOCUS);
    await cache.fetch(FOCUS, { headers: { Accept: "application/vnd.pgrst.object+json" } });
    await cache.fetch(FOCUS, { headers: { Prefer: "count=exact" } });
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("never caches other tables, HEAD reads or failures", async () => {
    const base = vi.fn(async () => jsonResponse({ message: "boom" }, 500));
    const failing = createServiceReadCache(base as unknown as typeof fetch);
    await failing.fetch(FOCUS);
    await failing.fetch(FOCUS);
    expect(base).toHaveBeenCalledTimes(2);

    const plain = vi.fn(async () => jsonResponse([]));
    const other = createServiceReadCache(plain as unknown as typeof fetch);
    await other.fetch(`${BASE}/rest/v1/employees?select=id`);
    await other.fetch(`${BASE}/rest/v1/employees?select=id`);
    await other.fetch(FOCUS, { method: "HEAD" });
    await other.fetch(FOCUS, { method: "HEAD" });
    expect(plain).toHaveBeenCalledTimes(4);
  });

  it("forgets everything on any write, RPCs included", async () => {
    const { base, cache } = setup();
    await cache.fetch(FOCUS);
    await cache.fetch(`${BASE}/rest/v1/rpc/remove_focus_area_from_employees`, { method: "POST" });
    const after = await (await cache.fetch(FOCUS)).json();
    expect(base).toHaveBeenCalledTimes(3);
    expect(after).toEqual([{ id: 3 }]);
  });

  it("does not store a read that a write overtook", async () => {
    let release: (response: Response) => void = () => {};
    const base = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)))
      .mockImplementation(async () => jsonResponse([{ id: "fresh" }]));
    const cache = createServiceReadCache(base as unknown as typeof fetch);
    const stale = cache.fetch(FOCUS);
    await cache.fetch(`${BASE}/rest/v1/focus_areas?id=eq.1`, { method: "PATCH" });
    release(jsonResponse([{ id: "stale" }]));
    await stale;
    expect(await (await cache.fetch(FOCUS)).json()).toEqual([{ id: "fresh" }]);
  });

  it("lets one caller give up without cancelling the shared read", async () => {
    let release: (response: Response) => void = () => {};
    const base = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    const cache = createServiceReadCache(base as unknown as typeof fetch);
    const controller = new AbortController();
    const leaving = cache.fetch(FOCUS, { signal: controller.signal });
    const staying = cache.fetch(FOCUS);
    controller.abort();
    await expect(leaving).rejects.toBeDefined();
    release(jsonResponse([{ id: 1 }]));
    expect(await (await staying).json()).toEqual([{ id: 1 }]);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
