import { readFile } from "node:fs/promises";
import {
  parseAuthEntryLogLine,
  summarizeAuthEntrySamples,
} from "../apps/mobile/src/features/auth/lib/auth-entry-measurement";

async function main() {
  const logPath = process.argv[2];
  if (!logPath) {
    throw new Error("Usage: npm run measure:auth:mobile -- <sanitized-log-file>");
  }

  const contents = await readFile(logPath, "utf8");
  const samples = contents
    .split(/\r?\n/)
    .map(parseAuthEntryLogLine)
    .filter((sample) => sample !== null);

  if (samples.length === 0) {
    throw new Error("No valid DubGrid mobile authentication-entry samples were found.");
  }

  process.stdout.write(`${JSON.stringify(summarizeAuthEntrySamples(samples), null, 2)}\n`);
}

void main();
