import { describe, expect, it } from "vitest";
import { getWebSessionMetadata } from "./session-metadata";

describe("getWebSessionMetadata", () => {
  it.each([
    [
      "iPhone Safari",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
      { deviceLabel: "iPhone", browserName: "Safari", browserVersion: "18.6" },
    ],
    [
      "iPad Safari",
      "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
      { deviceLabel: "iPad", browserName: "Safari", browserVersion: "18.6" },
    ],
    [
      "Android Chrome",
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231105.003) AppleWebKit/537.36 Chrome/131.0.6778.200 Mobile Safari/537.36",
      { deviceLabel: "Pixel 8", browserName: "Chrome", browserVersion: "131.0.6778.200" },
    ],
    [
      "macOS Safari",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
      { deviceLabel: "Macintosh", browserName: "Safari", browserVersion: "18.6" },
    ],
    [
      "Windows Edge",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
      { deviceLabel: "Windows PC", browserName: "Edge", browserVersion: "131.0.2903.86" },
    ],
    [
      "Linux Firefox",
      "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
      { deviceLabel: "Linux computer", browserName: "Firefox", browserVersion: "133.0" },
    ],
    [
      "unknown",
      "ExampleAgent",
      { deviceLabel: "Unknown device", browserName: null, browserVersion: null },
    ],
  ])("identifies %s", (_name, userAgent, expected) => {
    expect(getWebSessionMetadata(userAgent)).toEqual(expected);
  });
});
