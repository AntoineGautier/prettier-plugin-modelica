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
import { printModelica, embedHTML } from "./printer.js";

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
export { languages, parsers, printers, options };
