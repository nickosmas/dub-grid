/** A function's body between `AS $$` and `$$;`, as lines. */
export function functionBody(sql: string, header: string): string[] {
  const start = sql.indexOf(header);
  if (start < 0) throw new Error(`Missing function header: ${header}`);
  const bodyStart = sql.indexOf("AS $$\n", start) + "AS $$\n".length;
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  return sql.slice(bodyStart, bodyEnd).split("\n");
}

/** Lines only in `before` and lines only in `after`, by longest common subsequence. */
export function lineDiff(
  before: string[],
  after: string[],
): { removed: string[]; added: string[] } {
  const rows = before.length + 1;
  const cols = after.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        before[i] === after[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      i++;
      j++;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      removed.push(before[i++].trim());
    } else {
      added.push(after[j++].trim());
    }
  }
  removed.push(...before.slice(i).map((line) => line.trim()));
  added.push(...after.slice(j).map((line) => line.trim()));
  return {
    removed: removed.filter(Boolean),
    added: added.filter(Boolean),
  };
}
