# prettier-plugin-modelica

A [Prettier](https://prettier.io/) plugin for formatting Modelica code.

Uses the [tree-sitter-modelica](https://github.com/OpenModelica/tree-sitter-modelica) grammar for parsing, which generates an abstract syntax tree (AST) that Prettier then formats back into consistently styled source code.

## Installation

```bash
git submodule update --init
npm run setup
npm install && npm run build
```

## Usage

### Format a file (preview to stdout)

```bash
npx prettier --plugin ./dist/index.js path/to/file.mo  # Directly with prettier
npm run format -- path/to/file.mo  # CLI equivalent
```

### Format and write back to the same file

```bash
npx prettier --plugin ./dist/index.js path/to/file.mo --write  # Directly with prettier
npm run format -- path/to/file.mo --write  # CLI equivalent
```

### Format and save to a different file

```bash
npx prettier --plugin ./dist/index.js path/to/file.mo > formatted.mo  # Directly with prettier
npm run format -- path/to/file.mo --output formatted.mo  # CLI equivalent
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
npm run parse -- path/to/file.m
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

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See the [LICENSE](LICENSE) file for the full license text and the [COPYRIGHT](COPYRIGHT) file for copyright and licensing details.

### What This Means

- ✅ You can freely use, modify, and distribute this software
- ✅ The source code is fully open and available
- ⚠️ If you modify and distribute this software, you must also distribute your modifications under AGPL v3
- ⚠️ If you run a modified version on a server accessible to users, you must make the source code available to those users

For more information about AGPL v3, see: https://www.gnu.org/licenses/agpl-3.0.html
