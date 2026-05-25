// Test stub for expo-modules-core. Any Expo package (expo-font, expo-asset,
// expo-haptics, ...) imports from here for its native bridge; vitest can't load
// the real native bindings in jsdom. Providing no-op proxies lets those
// packages' JS load while their native calls become harmless no-ops.

export class CodedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CodedError";
  }
}

export class UnavailabilityError extends Error {
  constructor(moduleName: string, propertyName: string) {
    super(`${moduleName}.${propertyName} is not available on this platform.`);
    this.name = "UnavailabilityError";
  }
}

export class EventEmitter {
  addListener(): { remove: () => void } {
    return { remove() {} };
  }
  removeAllListeners(): void {}
  removeSubscription(): void {}
  emit(): void {}
}

export class NativeModule extends EventEmitter {}
export class SharedObject extends EventEmitter {}

// Permissive proxy: any property access returns a no-op function.
const nativeProxy: unknown = new Proxy(function () {}, {
  get: () => nativeProxy,
  apply: () => undefined,
});

export function requireNativeModule(): unknown {
  return nativeProxy;
}
export function requireOptionalNativeModule(): unknown {
  return undefined;
}
export function registerWebModule<T>(mod: T): T {
  return mod;
}

export const NativeModulesProxy: unknown = nativeProxy;

export const Platform = {
  OS: "ios" as const,
  select: <T,>(specifics: { ios?: T; android?: T; web?: T; default?: T }): T | undefined =>
    specifics.ios ?? specifics.default,
};

export default {};
