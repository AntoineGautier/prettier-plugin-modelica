---
name: update-formatter
description: Update the Modelica prettier formatter to handle new syntax added to test .mo files. Use when the user adds new Modelica constructs to test/data/*.mo and needs the printer/parser extended to format them correctly.
---

# Update Formatter for New Modelica Syntax

Use this skill when the user has added new Modelica syntax to a test file in `test/data/` and needs the formatter updated to handle it.

## Workflow

### 0. Clarify the target formatting

Before doing anything else, read the relevant section of the `.mo` file the user is working on and ask:

> "Does the file already show how you want the output to look, or should I format it differently?"

If the file does not reflect the desired output, ask the user to describe or sketch the expected formatting before proceeding. Do not start on the AST or the printer until the target formatting is clear.

### 1. Understand the new syntax — inspect the AST first

Run `debug-ast.js` from the project root to see how tree-sitter parses the new construct. Always do this before touching any source file.

```bash
# Full file
node test/debug-ast.js test/data/<Filename>.mo

# Narrow to specific lines (faster for large files)
node test/debug-ast.js test/data/<Filename>.mo --start LINE --end LINE
```

Study the node types and their children carefully. The node type names from this output are what you'll match in `src/printer.ts` (and the per-category files under `src/print/`).

### 2. Implement formatting in the printer

The entry point is `src/printer.ts`. Category-specific logic lives in `src/print/`. Match new node types and return the appropriate Prettier `Doc` builders (`hardline`, `indent`, `group`, `join`, `softline`, `ifBreak`, etc.).

Refer to existing node handlers as style guides — keep indentation, spacing, and line-break conventions consistent.

### 3. Test only the target file

Run the CLI directly against the single file being worked on. Do **not** run `test/run-tests.sh` — the user handles the full suite.

```bash
npx tsx src/cli.ts test/data/<Filename>.mo --write --check --verbose
```

- `--write` formats in place.
- `--check` verifies correctness: the formatted output must contain the same tokens as the original (whitespace and comments stripped), so no code is silently dropped or added.
- `--verbose` shows diffs when something is wrong.

Iterate: inspect output → adjust printer → reformat → repeat until `--check` passes and the output matches the formatting the user specified.

If after a few attempts the result is close but not exact, stop and ask the user:

> "The output looks like this — is this acceptable, or are there specific aspects that must be changed?"

Wait for the user to confirm or identify hard requirements before continuing. Do not keep iterating blindly trying to reach a perfect match.

### 4. Verify the formatted output looks right

After `--check` passes, read the file and confirm the output is well-formatted Modelica: correct indentation (2 spaces), sensible line breaks, no spurious blank lines.

## Key constraints

- **Do not commit.** Never run `git add`, `git commit`, or `git push`.
- **Do not run `test/run-tests.sh`.** Only test the specific file the user is working on.
- **Do not touch test data beyond what the user asks.** The `.mo` files are the source of truth for expected formatting.

## Project layout reference

```
src/
  cli.ts          # CLI entry point & correctness checker
  parser.ts       # tree-sitter parser integration
  printer.ts      # main print function — add new node handlers here
  print/          # sub-printers per syntax category
test/
  debug-ast.js    # AST inspector — always run this first
  data/           # *.mo test files (Algorithm, Annotations, Types, …)
```
