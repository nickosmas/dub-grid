export type ModalPresentationKind = "sheet" | "confirmation" | "gate";

const presentations = new Map<symbol, { kind: ModalPresentationKind; label: string }>();

/** One task surface and one brief decision may coexist. Required gates are independent. */
export function registerModalPresentation(kind: ModalPresentationKind, label: string): () => void {
  const existing = [...presentations.values()];
  if (kind !== "gate" && existing.some((surface) => surface.kind === kind)) {
    const stack = [
      ...existing.map((surface) => `${surface.kind}: ${surface.label}`),
      `${kind}: ${label}`,
    ];
    const message = `[modal-presentation] Only one ${kind} may be visible. ${stack.join(" > ")}. Close the current task before opening another; useModalHandoff sequences native transitions.`;
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
      throw new Error(message);
    }
    console.warn(message);
  }

  const id = Symbol(label);
  presentations.set(id, { kind, label });
  return () => {
    presentations.delete(id);
  };
}

/** Test isolation only. Cleanup functions retain identity even after a reset. */
export function resetSheetPresentationTracking(): void {
  presentations.clear();
}

export function getVisibleSheetCount(): number {
  return [...presentations.values()].filter((surface) => surface.kind === "sheet").length;
}
