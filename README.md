# prettier-plugin-modelica

A [Prettier](https://prettier.io/) plugin for formatting Modelica code.

Uses the [tree-sitter-modelica](https://github.com/OpenModelica/tree-sitter-modelica) grammar for parsing, which generates an abstract syntax tree (AST) that Prettier then formats back into consistently styled source code.

HTML annotations are formatted using Prettier's built-in HTML formatter.
Certain tags are excluded from formatting to preserve their original integration into the document: `pre`, `code`, and `a`.

## Installation

From source:

```bash
git clone https://github.com/AntoineGautier/prettier-plugin-modelica.git
cd prettier-plugin-modelica
git submodule update --init
npm run setup
npm install && npm run build
```

## Usage

### Format a file (preview to stdout)

```bash
# Directly with prettier
npx prettier --plugin ./dist/index.js path/to/file.mo
# CLI equivalent
npm run format -- path/to/file.mo
```

### Format and write back to the same file

```bash
# Directly with prettier
npx prettier --plugin ./dist/index.js path/to/file.mo --write
# CLI equivalent
npm run format -- path/to/file.mo --write
```

### Format and save to a different file

```bash
# Directly with prettier
npx prettier --plugin ./dist/index.js path/to/file.mo > formatted.mo
# CLI equivalent
npm run format -- path/to/file.mo --output formatted.mo
```

### Check correctness (the formatter doesn't break code)

```bash
npm run format -- path/to/file.mo --check
```

> [!TIP]
> The `--check` option can be combined with `--write` or `--output` options.
> If the correctness check fails, the formatting will not produce any output.

### Simply parse (preview to stdout)

```bash
npm run parse -- path/to/file.mo
```

## Known Limitations

The following constructs are currently not supported due to `tree-sitter-modelica` bugs.

### 1. Quoted Elements in Enumerations

```mo
type Logic = enumeration(
  'U' "U  Uninitialized",
  '0' "0  Forcing 0",
  '1' "1  Forcing 1",
  '-' "-  Do not care");
```

### 2. Empty `equation` Sections

```mo
model Demo
  replaceable model Medium = Modelica.Media.Interfaces.PartialMedium
    "Medium model" annotation (choicesAllMatching=true);
equation
end Demo;
```

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See the [LICENSE](LICENSE) file for the full license text and the [COPYRIGHT](COPYRIGHT) file for copyright and licensing details.
