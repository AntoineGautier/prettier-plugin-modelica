#!/usr/bin/env node
/**
 * Modelica Formatter CLI
 * Formats Modelica source files using Prettier with tree-sitter
 *
 * Usage: modelica-format <file.mo> [options]
 */

import * as path from "path";
import { formatFile } from "./format-file.js";

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

const sourceFile = path.resolve(inputFile);

const result = await formatFile({
  sourceFile,
  writeOutput,
  outputFile,
  check,
  verbose,
});

process.exit(result.ok ? 0 : 1);
