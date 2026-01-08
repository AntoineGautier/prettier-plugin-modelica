# prettier-plugin-modelica

A [Prettier](https://prettier.io/) plugin for formatting Modelica code using [tree-sitter](https://tree-sitter.github.io/tree-sitter/).

## Installation

```bash
cd ./formatter
npm run setup
npm install && npm run build
```

## CLI Usage

### Format a file (preview to stdout)

```bash
npm run format -- path/to/file.mo
```

### Format and write back to the same file

```bash
npm run format -- path/to/file.mo --write
npm run format -- path/to/file.mo -w
```

### Format and save to a different file

```bash
npm run format -- path/to/file.mo --output formatted.mo
npm run format -- path/to/file.mo -o formatted.mo
```

### Check if a file is formatted (for CI)

```bash
npm run format -- path/to/file.mo --check
npm run format -- path/to/file.mo -c
```

### Quiet mode (output only the formatted code)

```bash
npm run format -- path/to/file.mo --quiet
npm run format -- path/to/file.mo -q > formatted.mo
```

### All CLI options

```
Usage: modelica-format <file.mo> [options]

Arguments:
  <file.mo>            Path to a Modelica file to format

Options:
  --write, -w          Write formatted output back to input file
  --output, -o <file>  Write formatted output to specified file
  --check, -c          Check if file is formatted (exit 1 if not)
  --quiet, -q          Suppress output except errors
  --help, -h           Show this help message
```

## Using with Prettier directly

```bash
npx prettier --plugin ./dist/index.js --parser modelica path/to/file.mo
npx prettier --plugin ./dist/index.js --parser modelica --write path/to/file.mo
```

## Configuration

Add to your `.prettierrc`:

```json
{
  "plugins": ["prettier-plugin-modelica"],
  "overrides": [
    {
      "files": "*.mo",
      "options": {
        "parser": "modelica"
      }
    }
  ]
}
```

## Development

### Build

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm run clean      # Remove dist/
```

### Test

```bash
npm run parse -- test/AirToWater.mo              # Test tree-sitter parsing
npm run format -- test/AirToWater.mo             # Preview formatting
npm run format -- test/AirToWater.mo -o out.mo   # Save formatted output
```

## Project Structure

```
formatter/
├── src/
│   ├── index.ts      # Prettier plugin entry point
│   ├── parser.ts     # Tree-sitter CLI wrapper
│   ├── printer.ts    # AST to formatted code
│   └── cli.ts        # Command-line interface
├── test/
│   ├── AirToWater.mo # Test fixture
│   └── parser.ts     # Parser test script
├── dist/             # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

1. **Parsing**: Uses `tree-sitter` CLI to parse Modelica source code into an S-expression AST
2. **AST Conversion**: Converts the S-expression into a JavaScript AST structure
3. **Printing**: Prettier's doc builders format the AST back into source code

The plugin uses the tree-sitter CLI rather than native Node.js bindings because:
- Works with any Node.js version (no native compilation issues)
- Uses the same grammar as the CLI tool
- Simpler setup and maintenance

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modelicaIndentSize` | int | 2 | Indentation size for Modelica code |
