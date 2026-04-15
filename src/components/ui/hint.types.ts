/**
 * Branded string types for tooltip content length constraints.
 *
 * TypeScript cannot count characters in template literal types, so these use
 * branded types to signal intent. The actual enforcement is:
 *   1. The branded type on the `content` prop forces conscious casting
 *   2. The ESLint rule catches violations at lint time
 *   3. The `hint()` helper documents the contract
 */

declare const __hintBrand: unique symbol;

/** A string intended to be at most 80 characters (Hint tooltip). */
export type HintContent = string & { readonly [__hintBrand]: true };

/** Brand a string literal as HintContent (max 80 chars by convention). */
export function hint(s: string): HintContent {
  return s as HintContent;
}
