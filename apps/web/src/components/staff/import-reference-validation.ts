interface ImportReferenceRow {
  focusAreaNames: string;
  certificationName: string;
  roleNames: string;
}

interface ImportReferenceOptions {
  focusAreaNames: readonly string[];
  certificationNames: readonly string[];
  roleNames: readonly string[];
}

function unknownNames(value: string, knownNames: readonly string[]): string[] {
  const known = new Set(knownNames.map((name) => name.toLowerCase()));
  return value
    .split(";")
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => !known.has(name.toLowerCase()));
}

export function getImportReferenceErrors(
  row: ImportReferenceRow,
  options: ImportReferenceOptions,
): string[] {
  const errors = unknownNames(row.focusAreaNames, options.focusAreaNames).map(
    (name) => `Unknown focus area: "${name}"`,
  );

  if (
    row.certificationName &&
    !options.certificationNames.some(
      (name) => name.toLowerCase() === row.certificationName.toLowerCase(),
    )
  ) {
    errors.push(`Unknown certification: "${row.certificationName}"`);
  }

  return errors.concat(
    unknownNames(row.roleNames, options.roleNames).map((name) => `Unknown role: "${name}"`),
  );
}
