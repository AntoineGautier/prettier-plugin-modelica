/**
 * Formats every .mo file in test/data in-place, in a single Node process
 * (avoids paying Node/tsx startup cost once per file).
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { formatFile } from "../src/format-file.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "data");

const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith(".mo"))
  .sort();

let hadFailure = false;

for (const filename of files) {
  console.log(`Formatting: ${filename}`);

  const result = await formatFile({
    sourceFile: path.join(testDir, filename),
    writeOutput: true,
    check: true,
    verbose: true,
  });

  if (!result.ok) {
    hadFailure = true;
  }
}

process.exit(hadFailure ? 1 : 0);
