import { describe, expect, it } from "vitest";
import { getDevServerHost, isIpv4Address, parseDevServerHost } from "./devServerHost";

describe("dev server host resolution", () => {
  it("reads the host out of a bare hostUri", () => {
    expect(parseDevServerHost("192.168.1.5:8081")).toBe("192.168.1.5");
    expect(parseDevServerHost("192.168.1.5")).toBe("192.168.1.5");
  });

  it("reads the host out of a full bundle scriptURL", () => {
    expect(parseDevServerHost("http://172.20.10.7:8081/index.bundle?platform=android")).toBe(
      "172.20.10.7",
    );
    expect(parseDevServerHost("exp://192.168.1.5:8081")).toBe("192.168.1.5");
  });

  it("returns null for anything that isn't a host string", () => {
    expect(parseDevServerHost(undefined)).toBeNull();
    expect(parseDevServerHost("")).toBeNull();
    expect(parseDevServerHost(8081)).toBeNull();
  });

  // A tunnel host proxies Metro's port alone, so it must never be substituted
  // in for the API and Supabase ports.
  it("accepts only IPv4 literals as substitutable hosts", () => {
    expect(isIpv4Address("192.168.1.5")).toBe(true);
    expect(isIpv4Address("10.0.2.2")).toBe(true);
    expect(isIpv4Address("abc-def.anonymous.exp.direct")).toBe(false);
    expect(isIpv4Address("localhost")).toBe(false);
    expect(isIpv4Address("999.1.1.1")).toBe(false);
  });

  // `__DEV__` is undefined outside the app runtime, which is also what keeps a
  // production build from ever rewriting its configured hosts.
  it("resolves to null when there is no dev runtime", () => {
    expect(getDevServerHost()).toBeNull();
  });
});
