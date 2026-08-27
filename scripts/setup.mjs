// Cross-platform replacement for a shell one-liner: `VAR=value cmd` and `cp`
// are POSIX-only syntax that fails under Windows' cmd.exe, which is what npm
// uses to run package.json scripts on Windows regardless of the invoking shell.
import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const grammarDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "grammars",
  "tree-sitter-modelica",
);

// Windows' npm/npx are .cmd shims; Node refuses to spawn those directly
// without shell: true (a guard against batch-file argument injection).
const shell = process.platform === "win32";
const opts = { cwd: grammarDir, stdio: "inherit", shell };

// --ignore-scripts skips tree-sitter-modelica's own "install" script
// (node-gyp-build), which builds the native N-API addon we don't need since
// prettier-plugin-modelica only consumes the wasm grammar. It also skips
// tree-sitter-cli's install script, so fetch its platform binary separately.
execFileSync("npm", ["ci", "--ignore-scripts"], opts);
execFileSync("npm", ["rebuild", "tree-sitter-cli"], opts);
execFileSync("npx", ["tree-sitter", "generate"], opts);
execFileSync("npx", ["tree-sitter", "build", "--wasm", "."], opts);

copyFileSync(
  path.join(grammarDir, "tree-sitter-modelica.wasm"),
  path.join(grammarDir, "..", "..", "src", "tree-sitter-modelica.wasm"),
);
