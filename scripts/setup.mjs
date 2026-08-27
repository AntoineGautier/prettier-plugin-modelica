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

// Clears any local `allow-scripts` policy (e.g. from a corporate npmrc) that
// would otherwise block tree-sitter-modelica's preinstall/install scripts.
const env = { ...process.env, npm_config_allow_scripts: "" };
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

execFileSync(npm, ["ci"], { cwd: grammarDir, env, stdio: "inherit" });
execFileSync(npx, ["tree-sitter", "generate"], { cwd: grammarDir, env, stdio: "inherit" });
execFileSync(npx, ["tree-sitter", "build", "--wasm", "."], { cwd: grammarDir, stdio: "inherit" });

copyFileSync(
  path.join(grammarDir, "tree-sitter-modelica.wasm"),
  path.join(grammarDir, "..", "..", "src", "tree-sitter-modelica.wasm"),
);
