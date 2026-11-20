type HingeChange = { status: string };

type HingeNativeModule = {
  getStatus(): string;
  /** The new layout is drawn: fade the cover laid over the window while it resized. */
  settle?(): void;
  addListener(event: "onChange", listener: (change: HingeChange) => void): { remove(): void };
};

type ExpoGlobal = { expo?: { modules?: Record<string, unknown> } };

/**
 * The native hinge module, or null where it isn't built in (Android, web,
 * tests). Read straight from the registry `requireOptionalNativeModule` uses,
 * so tests don't have to load Expo to get null.
 */
export const hingeModule =
  ((globalThis as ExpoGlobal).expo?.modules?.Hinge as HingeNativeModule | undefined) ?? null;
