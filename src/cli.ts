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

// Helper function to remove whitespace for content comparison
function removeWhitespace(content: string): string {
  // Remove all whitespace characters (spaces, tabs, newlines, etc.)
  return content.replace(/\s+/g, "");
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
  console.log("                       (will not write if idempotence check fails)");
  console.log("  --output, -o <file>  Write formatted output to specified file");
  console.log("                       (will not write if idempotence check fails)");
  console.log("  --check, -c          Check if formatting is idempotent");
  console.log("                       (exit 0 if idempotent, exit 1 if not)");
  console.log("  --quiet, -q          Suppress output except errors");
  console.log("  --help, -h           Show this help message");
  console.log("");
  console.log("Note: Idempotence check compares original and formatted content");
  console.log("      (ignoring whitespace) to ensure formatting is stable.");
  console.log("");
  console.log("Examples:");
  console.log("  modelica-format model.mo              # Preview formatted output");
  console.log("  modelica-format model.mo --write      # Format and overwrite");
  console.log("  modelica-format model.mo -o out.mo    # Format and save to new file");
  console.log("  modelica-format model.mo --check      # Check if idempotent");
}

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
}

// Parse options
const writeOutput = args.includes("--write") || args.includes("-w");
const check = args.includes("--check") || args.includes("-c");
const quiet = args.includes("--quiet") || args.includes("-q");

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
  "--quiet",
  "-q",
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
if (!sourceFile.endsWith(".mo") && !quiet) {
  console.warn(`Warning: File does not have .mo extension: ${sourceFile}`);
}

// Read the source file
const sourceCode = fs.readFileSync(sourceFile, "utf8");

if (!quiet) {
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

    // Check idempotence - compare original and formatted (ignoring whitespace)
    const sourceNoWS = removeWhitespace(sourceCode);
    const formattedNoWS = removeWhitespace(formatted);
    const isIdempotent = sourceNoWS === formattedNoWS;

    // If --check flag is present, verify idempotence first
    if (check) {
      if (!isIdempotent) {
        if (!quiet) {
          console.log("✗ Idempotence check failed!");
          console.log(
            "Original and formatted content differ (ignoring whitespace).",
          );
          console.log(
            "Original length (no whitespace):",
            sourceNoWS.length,
            "chars",
          );
          console.log(
            "Formatted length (no whitespace):",
            formattedNoWS.length,
            "chars",
          );
          console.log(
            "Difference:",
            Math.abs(formattedNoWS.length - sourceNoWS.length),
            "chars",
          );
        }
        process.exit(1);
      }

      // If only --check (no write/output), exit here
      if (!writeOutput && !outputFile) {
        if (!quiet) {
          console.log("✓ Formatting is idempotent");
        }
        process.exit(0);
      }
      // Otherwise continue to write
    }

    // Write mode - write to file (only if idempotent)
    if (writeOutput || outputFile) {
      // If --check wasn't used, still verify idempotence before writing
      if (check && !isIdempotent) {
        console.error("✗ Idempotence check failed!");
        console.error(
          "Original and formatted content differ (ignoring whitespace).",
        );
        console.error(
          "Original length (no whitespace):",
          sourceNoWS.length,
          "chars",
        );
        console.error(
          "Formatted length (no whitespace):",
          formattedNoWS.length,
          "chars",
        );
        console.error(
          "Difference:",
          Math.abs(formattedNoWS.length - sourceNoWS.length),
          "chars",
        );
        console.error("File not written.");
        process.exit(1);
      }

      const targetFile = outputFile ? path.resolve(outputFile) : sourceFile;
      fs.writeFileSync(targetFile, formatted, "utf8");
      if (!quiet) {
        console.log("Output:", path.relative(process.cwd(), targetFile));
        console.log(
          "Size:",
          formatted.length,
          "bytes,",
          formatted.split("\n").length,
          "lines",
        );
        console.log(isUnchanged ? "✓ No changes" : "✓ Formatted");
        console.log("✓ Idempotence verified");
      }
      process.exit(0);
    }

    // Default - print to stdout (check idempotence first)
    if (!isIdempotent) {
      console.error("✗ Idempotence check failed!");
      console.error(
        "Original and formatted content differ (ignoring whitespace).",
      );
      console.error(
        "Original length (no whitespace):",
        sourceNoWS.length,
        "chars",
      );
      console.error(
        "Formatted length (no whitespace):",
        formattedNoWS.length,
        "chars",
      );
      console.error(
        "Difference:",
        Math.abs(formattedNoWS.length - sourceNoWS.length),
        "chars",
      );
      process.exit(1);
    }

    if (quiet) {
      process.stdout.write(formatted);
    } else {
      console.log("");
      console.log("--- Formatted Output ---");
      console.log("");
      process.stdout.write(formatted);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    if (!quiet && error instanceof Error && error.stack) {
      console.error("");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

run();
