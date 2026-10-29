import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type GoogleWindow = Window & {
  google?: unknown;
  __dgGoogleMapsPlacesReady?: () => void;
};

function mapsScript(): HTMLScriptElement | null {
  return document.querySelector<HTMLScriptElement>('script[data-google-maps-places="true"]');
}

async function loadModule() {
  vi.resetModules();
  return import("../google-maps");
}

describe("loadGooglePlacesLibrary", () => {
  beforeEach(() => {
    mapsScript()?.remove();
    delete (window as GoogleWindow).google;
    delete (window as GoogleWindow).__dgGoogleMapsPlacesReady;
  });

  afterEach(() => {
    mapsScript()?.remove();
    delete (window as GoogleWindow).google;
  });

  it("waits for Google's ready callback, not the script's load event", async () => {
    const { loadGooglePlacesLibrary } = await loadModule();
    const places = { AutocompleteSuggestion: {}, AutocompleteSessionToken: class {} };
    let settled = false;

    const pending = loadGooglePlacesLibrary("test-key").then((library) => {
      settled = true;
      return library;
    });

    const script = mapsScript();
    expect(script?.src).toContain("callback=__dgGoogleMapsPlacesReady");

    // With loading=async, `load` fires while google.maps is still a stub.
    (window as GoogleWindow).google = { maps: {} };
    script?.dispatchEvent(new Event("load"));
    await Promise.resolve();
    expect(settled).toBe(false);

    (window as GoogleWindow).google = {
      maps: { importLibrary: vi.fn(async () => places) },
    };
    (window as GoogleWindow).__dgGoogleMapsPlacesReady?.();

    await expect(pending).resolves.toBe(places);
  });

  it("resolves null when the script fails to load", async () => {
    const { loadGooglePlacesLibrary } = await loadModule();

    const pending = loadGooglePlacesLibrary("test-key");
    mapsScript()?.dispatchEvent(new Event("error"));

    await expect(pending).resolves.toBeNull();
  });
});
