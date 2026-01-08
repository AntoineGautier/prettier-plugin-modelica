# prettier-plugin-modelica

A [Prettier](https://prettier.io/) plugin for formatting Modelica code using [tree-sitter](https://tree-sitter.github.io/tree-sitter/).

## Installation

```bash
git submodule update --init
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

### Check correctness (the formatter doesn't break code)

```bash
npm run format -- path/to/file.mo --check
npm run format -- path/to/file.mo -c
```

### Simply parse (preview to stdout)

```bash
npm run parse -- path/to/file.m
```

## Using with Prettier directly

```bash
npx prettier --plugin ./dist/index.js path/to/file.mo
npx prettier --plugin ./dist/index.js --write path/to/file.mo
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

## How It Works

1. **Parsing**: Uses `tree-sitter` CLI to parse Modelica source code into an S-expression AST
2. **AST Conversion**: Converts the S-expression into a JavaScript AST structure
3. **Printing**: Prettier's doc builders format the AST back into source code
