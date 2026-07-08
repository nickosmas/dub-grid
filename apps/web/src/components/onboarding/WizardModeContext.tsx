"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

/**
 * Imperative handle that nested settings editors expose to the wizard so a
 * single "Continue" button can save every section before advancing.
 */
export interface WizardEditorHandle {
  /** True when local form state differs from the persisted value. */
  isDirty: () => boolean;
  /** True when validation would block save right now. */
  hasErrors: () => boolean;
  /** Persist current local state. Throws on failure. */
  save: () => Promise<void>;
}

interface WizardModeContextValue {
  isWizardMode: boolean;
  register?: (id: string, handle: WizardEditorHandle) => () => void;
}

const WizardModeContext = createContext<WizardModeContextValue>({
  isWizardMode: false,
});

export function useWizardMode(): boolean {
  return useContext(WizardModeContext).isWizardMode;
}

/**
 * Register a nested editor with the wizard. Pass a stable id and a fresh
 * handle on every render — internally we keep the latest handle alive via
 * a ref so registration only happens once.
 */
export function useRegisterWizardEditor(
  id: string,
  handle: WizardEditorHandle,
  enabled = true,
): void {
  const ctx = useContext(WizardModeContext);
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    if (!enabled || !ctx.register) return;
    return ctx.register(id, {
      isDirty: () => handleRef.current.isDirty(),
      hasErrors: () => handleRef.current.hasErrors(),
      save: () => handleRef.current.save(),
    });
  }, [ctx, enabled, id]);
}

/**
 * Step-level hook. Returns a provider component to wrap nested editors and a
 * `saveAll` function that runs every registered editor's save in registration
 * order. Throws the first error; later editors are skipped.
 */
export function useWizardEditorCollector(): {
  Provider: React.FC<{ children: React.ReactNode }>;
  saveAll: () => Promise<void>;
  hasAnyErrors: () => boolean;
  hasDirty: () => boolean;
} {
  const editorsRef = useRef<Map<string, WizardEditorHandle>>(new Map());
  const orderRef = useRef<string[]>([]);

  const register = useCallback((id: string, handle: WizardEditorHandle) => {
    editorsRef.current.set(id, handle);
    if (!orderRef.current.includes(id)) orderRef.current.push(id);
    return () => {
      editorsRef.current.delete(id);
      orderRef.current = orderRef.current.filter((entry) => entry !== id);
    };
  }, []);

  const value = useMemo<WizardModeContextValue>(
    () => ({ isWizardMode: true, register }),
    [register],
  );

  const Provider = useCallback<React.FC<{ children: React.ReactNode }>>(
    ({ children }) => (
      <WizardModeContext.Provider value={value}>{children}</WizardModeContext.Provider>
    ),
    [value],
  );

  const saveAll = useCallback(async () => {
    for (const id of orderRef.current) {
      const handle = editorsRef.current.get(id);
      if (!handle) continue;
      // isDirty must drop back to false after a successful save, otherwise a
      // retry after a later editor's failure could re-run this save with a
      // stale local snapshot (e.g., temp IDs) and corrupt the persisted data.
      // Editors handle this by resyncing local state from props in wizard mode.
      if (!handle.isDirty()) continue;
      await handle.save();
    }
  }, []);

  const hasAnyErrors = useCallback(() => {
    for (const handle of editorsRef.current.values()) {
      if (handle.hasErrors()) return true;
    }
    return false;
  }, []);

  const hasDirty = useCallback(() => {
    for (const handle of editorsRef.current.values()) {
      if (handle.isDirty()) return true;
    }
    return false;
  }, []);

  return { Provider, saveAll, hasAnyErrors, hasDirty };
}
