#!/usr/bin/env node
/**
 * Modelica Formatter CLI
 * Formats Modelica source files using Prettier with tree-sitter
 *
 * Usage: modelica-format <file.mo> [options]
 */

import * as fs from "fs";
import * as path from "path";
import { format } from "prettier";
import plugin from "./index.js";

// Helper function to remove whitespace and block comments for content comparison
function removeWhitespaceAndComments(content: string): string {
  // Remove block comments /* ... */
  const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove all whitespace characters (spaces, tabs, newlines, etc.)
  return noComments.replace(/\s+/g, "");
}

// Check if a position in the content is within <html>...</html> tags
function isWithinHtmlTags(content: string, position: number): boolean {
  const htmlOpenRegex = /<html>/gi;
  const htmlCloseRegex = /<\/html>/gi;

  // Collect all <html> and </html> positions
  const opens: number[] = [];
  const closes: number[] = [];

  let match;
  while ((match = htmlOpenRegex.exec(content)) !== null) {
    opens.push(match.index);
  }
  while ((match = htmlCloseRegex.exec(content)) !== null) {
    closes.push(match.index);
  }

  // For each <html> tag before the position, check if position is before its matching </html>
  for (const openPos of opens) {
    if (openPos >= position) continue; // <html> is after the position

    // Find the next </html> after this <html> that doesn't have another <html> in between
    let closePos = -1;
    for (const c of closes) {
      if (c > openPos) {
        // Check no other <html> between openPos and c
        const hasOpenBetween = opens.some((o) => o > openPos && o < c);
        if (!hasOpenBetween) {
          closePos = c;
          break;
        }
      }
    }

    // If position is between this <html> and its </html>, we're inside
    // closePos === -1 handles the case where there's an unclosed <html> tag
    if (closePos === -1 || position <= closePos) {
      return true;
    }
  }

  return false;
}

// Build a mapping from positions in the no-whitespace-no-comments string
// back to positions in the original string
function buildPositionMap(content: string): number[] {
  const map: number[] = [];
  let i = 0;
  while (i < content.length) {
    // Skip block comments /* ... */
    if (content[i] === "/" && content[i + 1] === "*") {
      const endComment = content.indexOf("*/", i + 2);
      if (endComment !== -1) {
        i = endComment + 2;
        continue;
      }
    }
    // Skip whitespace
    if (/\s/.test(content[i])) {
      i++;
      continue;
    }
    // Non-whitespace, non-comment character: record its position
    map.push(i);
    i++;
  }
  return map;
}

// Use Longest Common Subsequence to find all differing regions
// Returns array of [fmtStart, fmtEnd] ranges where formatted differs from original
function findDiffRanges(
  originalNoWS: string,
  formattedNoWS: string,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  // Simple diff algorithm: find matching regions and mark gaps as diffs
  let origIdx = 0;
  let fmtIdx = 0;

  while (origIdx < originalNoWS.length || fmtIdx < formattedNoWS.length) {
    // Skip matching characters
    while (
      origIdx < originalNoWS.length &&
      fmtIdx < formattedNoWS.length &&
      originalNoWS[origIdx] === formattedNoWS[fmtIdx]
    ) {
      origIdx++;
      fmtIdx++;
    }

    // If both done, we're finished
    if (origIdx >= originalNoWS.length && fmtIdx >= formattedNoWS.length) {
      break;
    }

    // We have a difference - find where they resync
    // Try to find resync point using a simple lookahead
    let resynced = false;
    const maxLookahead = Math.max(
      originalNoWS.length - origIdx,
      formattedNoWS.length - fmtIdx,
    );

    for (let lookAhead = 1; lookAhead <= maxLookahead && !resynced; lookAhead++) {
      // Try: original skipped some, formatted stayed
      for (let origSkip = 1; origSkip <= lookAhead && origIdx + origSkip <= originalNoWS.length; origSkip++) {
        if (
          origIdx + origSkip < originalNoWS.length &&
          fmtIdx < formattedNoWS.length &&
          originalNoWS[origIdx + origSkip] === formattedNoWS[fmtIdx]
        ) {
          // Original had extra chars (deleted in formatted)
          // Record a zero-width range at the formatted position where deletion occurred
          ranges.push([fmtIdx, fmtIdx]);
          origIdx += origSkip;
          resynced = true;
          break;
        }
      }
      if (resynced) break;

      // Try: formatted skipped some, original stayed
      for (let fmtSkip = 1; fmtSkip <= lookAhead && fmtIdx + fmtSkip <= formattedNoWS.length; fmtSkip++) {
        if (
          fmtIdx + fmtSkip < formattedNoWS.length &&
          origIdx < originalNoWS.length &&
          originalNoWS[origIdx] === formattedNoWS[fmtIdx + fmtSkip]
        ) {
          // Formatted had extra chars (inserted)
          if (fmtIdx < fmtIdx + fmtSkip) {
            ranges.push([fmtIdx, fmtIdx + fmtSkip]);
          }
          fmtIdx += fmtSkip;
          resynced = true;
          break;
        }
      }
      if (resynced) break;

      // Try: both skipped some (substitution)
      for (let skip = 1; skip <= lookAhead; skip++) {
        if (
          origIdx + skip < originalNoWS.length &&
          fmtIdx + skip < formattedNoWS.length &&
          originalNoWS[origIdx + skip] === formattedNoWS[fmtIdx + skip]
        ) {
          // Both had different chars
          if (fmtIdx < fmtIdx + skip) {
            ranges.push([fmtIdx, fmtIdx + skip]);
          }
          origIdx += skip;
          fmtIdx += skip;
          resynced = true;
          break;
        }
      }
    }

    // If we couldn't resync, consume remaining
    if (!resynced) {
      if (fmtIdx < formattedNoWS.length) {
        ranges.push([fmtIdx, formattedNoWS.length]);
      }
      break;
    }
  }

  return ranges;
}

// Get all HTML tag ranges in a string as [start, end] pairs (end is position after </html>)
function getHtmlRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const htmlOpenRegex = /<html>/gi;
  const htmlCloseRegex = /<\/html>/gi;

  const opens: number[] = [];
  const closes: number[] = [];

  let match;
  while ((match = htmlOpenRegex.exec(content)) !== null) {
    opens.push(match.index);
  }
  while ((match = htmlCloseRegex.exec(content)) !== null) {
    closes.push(match.index + 7); // +7 to include "</html>"
  }

  // Match each <html> with its corresponding </html>
  for (const openPos of opens) {
    let closePos = -1;
    for (const c of closes) {
      if (c > openPos) {
        const hasOpenBetween = opens.some((o) => o > openPos && o < c);
        if (!hasOpenBetween) {
          closePos = c;
          break;
        }
      }
    }
    if (closePos !== -1) {
      ranges.push([openPos, closePos]);
    }
  }

  return ranges;
}

// Remove all content within <html>...</html> tags from a string
function removeHtmlContent(content: string): string {
  const ranges = getHtmlRanges(content);
  if (ranges.length === 0) return content;

  let result = "";
  let lastEnd = 0;

  for (const [start, end] of ranges) {
    result += content.substring(lastEnd, start);
    lastEnd = end;
  }
  result += content.substring(lastEnd);

  return result;
}

// Check if all differences between two strings are only within <html> tags
// We strip HTML content and compare what remains - if identical, diffs are HTML-only
function isDiffOnlyInHtml(
  _formatted: string,
  originalNoWS: string,
  formattedNoWS: string,
): boolean {
  // Remove HTML content from both strings
  const originalNoHtml = removeHtmlContent(originalNoWS);
  const formattedNoHtml = removeHtmlContent(formattedNoWS);

  // If the non-HTML portions are identical, all diffs are within HTML
  return originalNoHtml === formattedNoHtml;
}

// Find the first differing position between two strings
function findFirstDifference(
  a: string,
  b: string,
): { position: number; before: string; diffA: string; diffB: string } | null {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      // Show context: 20 chars before, 20 chars of differing part
      const start = Math.max(0, i - 20);
      const before = a.substring(start, i);
      const diffA = a.substring(i, Math.min(a.length, i + 20));
      const diffB = b.substring(i, Math.min(b.length, i + 20));
      return { position: i, before, diffA, diffB };
    }
  }
  // Strings match up to minLen, but have different lengths
  if (a.length !== b.length) {
    const start = Math.max(0, minLen - 20);
    const before = a.substring(start, minLen);
    const diffA = a.substring(minLen, Math.min(a.length, minLen + 20));
    const diffB = b.substring(minLen, Math.min(b.length, minLen + 20));
    return { position: minLen, before, diffA, diffB };
  }
  return null;
}

// Find the first diff position outside HTML tags, or fall back to first diff overall
function findFirstDiffOutsideHtml(
  formatted: string,
  sourceNoWS: string,
  formattedNoWS: string,
): { position: number; inHtml: boolean } | null {
  const posMap = buildPositionMap(formatted);
  const diffRanges = findDiffRanges(sourceNoWS, formattedNoWS);

  if (diffRanges.length === 0) {
    return null;
  }

  // First, try to find the first diff outside HTML
  for (const [start] of diffRanges) {
    const fmtFullIdx = start < posMap.length ? posMap[start] : formatted.length;
    if (!isWithinHtmlTags(formatted, fmtFullIdx)) {
      return { position: start, inHtml: false };
    }
  }

  // Fall back to first diff overall (which must be in HTML)
  return { position: diffRanges[0][0], inHtml: true };
}

// Centralized logging for correctness failures (can be error or warning)
function logCorrectnessIssue(
  formatted: string,
  sourceNoWS: string,
  formattedNoWS: string,
  isWarning: boolean = false,
  additionalMessage?: string,
  verboseMode: boolean = false,
): void {
  // For warnings (HTML-only diffs), only show in verbose mode
  if (isWarning && !verboseMode) {
    return;
  }

  const log = isWarning ? console.warn : console.error;
  const symbol = isWarning ? "⚠" : "✗";
  const label = isWarning ? "Correctness warning" : "Correctness check failed!";

  log(`${symbol} ${label}`);

  if (additionalMessage) {
    log(additionalMessage);
  }

  // For warnings (HTML-only diffs), skip the detailed diff output
  if (isWarning) {
    return;
  }

  log("Original and formatted content differ (ignoring whitespace).");
  log("Original length (no whitespace):", sourceNoWS.length, "chars");
  log("Formatted length (no whitespace):", formattedNoWS.length, "chars");
  log(
    "Difference:",
    Math.abs(formattedNoWS.length - sourceNoWS.length),
    "chars",
  );

  // Find the first diff outside HTML, or fall back to first overall
  const diffInfo = findFirstDiffOutsideHtml(formatted, sourceNoWS, formattedNoWS);

  if (diffInfo) {
    // Get context around this position
    const diff = findFirstDifference(
      sourceNoWS.substring(diffInfo.position),
      formattedNoWS.substring(diffInfo.position),
    );

    if (diff) {
      const actualPosition = diffInfo.position + diff.position;
      const before = sourceNoWS.substring(
        Math.max(0, actualPosition - 20),
        actualPosition,
      );

      log("");
      if (diffInfo.inHtml) {
        log("First difference at position:", actualPosition, "(within <html> tags)");
      } else {
        log("First difference at position:", actualPosition);
      }
      log("  Context: ..." + JSON.stringify(before).slice(1, -1));
      log("  Original:  " + JSON.stringify(diff.diffA).slice(1, -1));
      log("  Formatted: " + JSON.stringify(diff.diffB).slice(1, -1));
    }
  }
}

// Parse command-line arguments
const args = process.argv.slice(2);

// prettier-ignore
function printHelp() {
  console.log("Usage: modelica-format <file.mo> [options]");
  console.log("");
  console.log("Arguments:");
  console.log("  <file.mo>            Path to a Modelica file to format");
  console.log("");
  console.log("Options:");
  console.log("  --write, -w          Write formatted output back to input file");
  console.log("                       (will not write if correctness check fails)");
  console.log("  --output, -o <file>  Write formatted output to specified file");
  console.log("                       (will not write if correctness check fails)");
  console.log("  --check, -c          Check correctness");
  console.log("                       (exit 0 if correct, exit 1 if not)");
  console.log("  --verbose, -v        Show detailed output");
  console.log("  --help, -h           Show this help message");
  console.log("");
  console.log("Note: Correctness check compares original and formatted content");
  console.log("      (ignoring whitespace and block comment) to ensure formatting doesn't break code.");
  console.log("");
  console.log("Examples:");
  console.log("  modelica-format model.mo              # Preview formatted output");
  console.log("  modelica-format model.mo --write      # Format and overwrite");
  console.log("  modelica-format model.mo -o out.mo    # Format and save to new file");
  console.log("  modelica-format model.mo --check      # Check correctness");
}

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
}

// Parse options
const writeOutput = args.includes("--write") || args.includes("-w");
const check = args.includes("--check") || args.includes("-c");
const verbose = args.includes("--verbose") || args.includes("-v");

// Parse --output / -o option
let outputFile: string | undefined;
const outputIdx = args.findIndex((arg) => arg === "--output" || arg === "-o");
if (outputIdx !== -1 && args[outputIdx + 1]) {
  outputFile = args[outputIdx + 1];
}

// Find input file (first arg that's not an option or option value)
const optionArgs = new Set([
  "--write",
  "-w",
  "--help",
  "-h",
  "--output",
  "-o",
  "--check",
  "-c",
  "--verbose",
  "-v",
]);
let inputFile: string | undefined;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (optionArgs.has(arg)) {
    if (arg === "--output" || arg === "-o") {
      i++; // skip next arg (output file value)
    }
    continue;
  }
  if (!arg.startsWith("-")) {
    inputFile = arg;
    break;
  }
}

if (!inputFile) {
  console.error("Error: No input file specified");
  console.error("Run with --help for usage information");
  process.exit(1);
}

// Resolve the file path
const sourceFile = path.resolve(inputFile);

// Check if file exists
if (!fs.existsSync(sourceFile)) {
  console.error(`Error: File not found: ${sourceFile}`);
  process.exit(1);
}

// Check file extension
if (!sourceFile.endsWith(".mo") && verbose) {
  console.warn(`Warning: File does not have .mo extension: ${sourceFile}`);
}

// Read the source file
const sourceCode = fs.readFileSync(sourceFile, "utf8");

if (verbose) {
  console.log("Input:", path.relative(process.cwd(), sourceFile));
  console.log(
    "Size:",
    sourceCode.length,
    "bytes,",
    sourceCode.split("\n").length,
    "lines",
  );
}

// Format using Prettier
async function run() {
  try {
    const formatted = await format(sourceCode, {
      parser: "modelica",
      plugins: [plugin],
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
    });

    const isUnchanged = formatted === sourceCode;

    // Check correctness - compare original and formatted (ignoring whitespace)
    const sourceNoWS = removeWhitespaceAndComments(sourceCode);
    const formattedNoWS = removeWhitespaceAndComments(formatted);
    const isCorrect = sourceNoWS === formattedNoWS;

    // Check if the difference is only within <html> tags (warn but continue)
    const diffInHtmlOnly =
      !isCorrect && isDiffOnlyInHtml(formatted, sourceNoWS, formattedNoWS);

    // If --check flag is present, verify correctness first
    if (check) {
      if (!isCorrect) {
        if (diffInHtmlOnly) {
          logCorrectnessIssue(
            formatted,
            sourceNoWS,
            formattedNoWS,
            true,
            "Difference is within <html> tags (formatting anyway)",
            verbose,
          );
        } else {
          logCorrectnessIssue(formatted, sourceNoWS, formattedNoWS);
          process.exit(1);
        }
      }

      // If only --check (no write/output), exit here
      if (!writeOutput && !outputFile) {
        if (verbose) {
          console.log("✓ Correctness check passed");
        }
        process.exit(0);
      }
      // Otherwise continue to write
    }

    // Write mode - write to file (only if correctness checked)
    if (writeOutput || outputFile) {
      const targetFile = outputFile ? path.resolve(outputFile) : sourceFile;
      fs.writeFileSync(targetFile, formatted, "utf8");
      if (verbose) {
        console.log("Output:", path.relative(process.cwd(), targetFile));
        console.log(
          "Size:",
          formatted.length,
          "bytes,",
          formatted.split("\n").length,
          "lines",
        );
        console.log(isUnchanged ? "✓ No changes" : "✓ Formatted");
        console.log("✓ Correctness verified");
      }
      process.exit(0);
    }

    if (verbose) {
      console.log("");
      console.log("--- Formatted Output ---");
      console.log("");
    }
    process.stdout.write(formatted);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    if (verbose && error instanceof Error && error.stack) {
      console.error("");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

run();
