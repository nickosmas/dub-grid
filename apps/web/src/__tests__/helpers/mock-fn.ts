import type { Mock } from "vitest";

/**
 * An untyped `vi.fn()`, as `ReturnType<typeof vi.fn>` was before Vitest 4,
 * which now types it as possibly a constructor and so as no plain function.
 */
export type MockFn = Mock<(...args: any[]) => any>;
