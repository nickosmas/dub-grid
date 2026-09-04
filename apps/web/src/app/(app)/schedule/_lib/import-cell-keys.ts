type ImportOutcome = {
  employeeId: string;
  targetDate: string;
  outcome: "imported" | "skipped";
};

export function getImportTargetCellKeys(outcomes: Iterable<ImportOutcome>): string[] {
  const keys: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.outcome === "imported") {
      keys.push(`${outcome.employeeId}_${outcome.targetDate}`);
    }
  }
  return keys;
}
