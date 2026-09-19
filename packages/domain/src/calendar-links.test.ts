import { describe, expect, it } from "vitest";
import { buildCalendarSubscribeLinks } from "./calendar-links";

describe("buildCalendarSubscribeLinks", () => {
  it("maps an https feed to webcals and encodes it for Google and Outlook", () => {
    const links = buildCalendarSubscribeLinks(
      "https://calmhaven.dubgrid.app/api/calendar/feed/abc123",
    );
    expect(links.apple).toBe("webcals://calmhaven.dubgrid.app/api/calendar/feed/abc123");
    expect(links.google).toBe(
      "https://calendar.google.com/calendar/r?cid=https%3A%2F%2Fcalmhaven.dubgrid.app%2Fapi%2Fcalendar%2Ffeed%2Fabc123",
    );
    expect(links.outlook).toBe(
      "https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fcalmhaven.dubgrid.app%2Fapi%2Fcalendar%2Ffeed%2Fabc123&name=DubGrid",
    );
  });

  it("maps a plain http feed to webcal for local development", () => {
    const links = buildCalendarSubscribeLinks(
      "http://calmhaven.localhost:3000/api/calendar/feed/abc123",
    );
    expect(links.apple).toBe("webcal://calmhaven.localhost:3000/api/calendar/feed/abc123");
    expect(links.google).toContain("cid=http%3A%2F%2Fcalmhaven.localhost%3A3000");
  });

  it("keeps a token with URL-unsafe characters intact through encoding", () => {
    const links = buildCalendarSubscribeLinks(
      "https://calmhaven.dubgrid.app/api/calendar/feed/a+b%2Fc",
    );
    const cid = new URL(links.google).searchParams.get("cid");
    expect(cid).toBe("https://calmhaven.dubgrid.app/api/calendar/feed/a+b%2Fc");
    const outlookUrl = new URL(links.outlook).searchParams.get("url");
    expect(outlookUrl).toBe("https://calmhaven.dubgrid.app/api/calendar/feed/a+b%2Fc");
  });

  it("rejects relative and non-http inputs", () => {
    expect(() => buildCalendarSubscribeLinks("/api/calendar/feed/abc")).toThrow("must be absolute");
    expect(() => buildCalendarSubscribeLinks("javascript:alert(1)")).toThrow(
      "must use http or https",
    );
  });
});
