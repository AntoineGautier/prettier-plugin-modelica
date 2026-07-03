/**
 * Prettier Plugin for Modelica
 * Uses tree-sitter CLI for parsing
 */

import type {
  Parser,
  Printer,
  Plugin,
  SupportLanguage,
  SupportOption,
} from "prettier";
import { parse as parseModelica, ASTNode } from "./parser.js";
import {
  printModelica,
  embedHTML,
  usePrettierHTMLFormatter,
  setUsePrettierHTMLFormatter,
} from "./printer.js";

// Language definition
const languages: SupportLanguage[] = [
  {
    name: "Modelica",
    parsers: ["modelica"],
    extensions: [".mo"],
    vscodeLanguageIds: ["modelica"],
  },
];

// Parser definition
const parsers: Record<string, Parser> = {
  modelica: {
    parse(text: string): ASTNode {
      const result = parseModelica(text);
      return result.rootNode;
    },
    astFormat: "modelica-ast",
    locStart(node: ASTNode): number {
      // Calculate byte offset from row/column
      // This is an approximation - proper implementation would track offsets during parsing
      return node.range.start.row * 1000 + node.range.start.column;
    },
    locEnd(node: ASTNode): number {
      return node.range.end.row * 1000 + node.range.end.column;
    },
  },
};

// Printer definition with embed support for HTML formatting
const printers: Record<string, Printer<ASTNode>> = {
  "modelica-ast": {
    print: printModelica,
    embed: embedHTML,
    // Restrict Prettier's AST traversal (used by the embed preprocessing) to
    // actual child nodes. Without this, Prettier visits every enumerable
    // property of every node — including `_syntaxNode`, which drags the
    // traversal into the native tree-sitter tree and slows formatting ~40x.
    getVisitorKeys: () => ["children"],
  },
};

// Plugin options
const options: Record<string, SupportOption> = {
  modelicaIndentSize: {
    type: "int",
    category: "Modelica",
    default: 2,
    description: "Number of spaces per indentation level for Modelica code.",
  },
};

const plugin: Plugin<ASTNode> = {
  languages,
  parsers,
  printers,
  options,
};

export default plugin;
export {
  languages,
  parsers,
  printers,
  options,
  usePrettierHTMLFormatter,
  setUsePrettierHTMLFormatter,
};
