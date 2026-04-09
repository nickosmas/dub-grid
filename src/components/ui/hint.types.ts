/**
 * Branded string types for tooltip content length constraints.
 *
 * TypeScript cannot count characters in template literal types, so these use
 * branded types to signal intent. The actual enforcement is:
 *   1. The branded type on the `content` prop forces conscious casting
 *   2. The ESLint rule catches violations at lint time
 *   3. The `hint()` / `tourContent()` helpers document the contract
 */

declare const __hintBrand: unique symbol;
declare const __tourBrand: unique symbol;

/** A string intended to be at most 80 characters (Hint tooltip). */
export type HintContent = string & { readonly [__hintBrand]: true };

/** A string intended to be at most 150 characters (TourStep body). */
export type TourContent = string & { readonly [__tourBrand]: true };

/** Brand a string literal as HintContent (max 80 chars by convention). */
export function hint(s: string): HintContent {
  return s as HintContent;
}

/** Brand a string literal as TourContent (max 150 chars by convention). */
export function tourContent(s: string): TourContent {
  return s as TourContent;
}
