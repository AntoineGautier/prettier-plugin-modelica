/**
 * Tree-sitter parser wrapper for Modelica
 * Uses web-tree-sitter (WASM) bindings for parsing, so the grammar ships as a
 * portable .wasm file bundled in this package instead of a native addon that
 * would need per-platform prebuilds.
 */

import { Parser, Language, Node as TSNode } from "web-tree-sitter";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// The grammar wasm is copied next to this file both in dist/ (build step)
// and in src/ (setup step, for `tsx` dev mode), so a same-directory lookup
// works in both layouts.
const WASM_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "tree-sitter-modelica.wasm",
);

let parserPromise: Promise<Parser> | null = null;

async function getParser(): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init();
      const language = await Language.load(WASM_PATH);
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
  }
  return parserPromise;
}

/**
 * Position in source code
 */
export interface Position {
  row: number;
  column: number;
}

/**
 * Range in source code
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * AST Node from tree-sitter
 * This interface wraps tree-sitter's Node to maintain compatibility
 * with the existing printer implementation
 */
export interface ASTNode {
  type: string;
  text?: string;
  range: Range;
  children: ASTNode[];
  isError: boolean;
  isMissing: boolean;
  fieldName?: string;
  /** Raw tree-sitter Node for advanced use cases (e.g., accessing anonymous children) */
  _syntaxNode?: TSNode;
}

/**
 * Parse result
 */
export interface ParseResult {
  rootNode: ASTNode;
  hasErrors: boolean;
  errorCount: number;
  missingCount: number;
}

/**
 * Anonymous tokens to include in the AST.
 * These are operators and keywords that appear as children of expression nodes
 * and need to be preserved for correct formatting.
 * 
 * Excludes punctuation (., ;, [, ], (, ), {, }, ,, :) which is handled
 * explicitly by the printer.
 */
const INCLUDED_ANONYMOUS_TOKENS = new Set([
  // Binary operators (children of binary_expression)
  "and",
  "or",
  "+",
  "-",
  "*",
  "/",
  "^",
  ".+",
  ".-",
  ".*",
  "./",
  ".^",
  "==",
  "<>",
  "<",
  ">",
  "<=",
  ">=",
  // Unary operator (child of unary_expression)
  "not",
  // Built-in function keywords (children of function_application)
  // See grammar.js line 627: choice(component_reference, "der", "initial", "pure")
  "initial",
  "der",
  "pure",
  // Redeclaration keywords (children of component_redeclaration, class_redeclaration)
  "redeclare",
  "replaceable",
  "final",
  "each",
  // Element prefix keywords (children of named_element)
  "inner",
  "outer",
  // Class prefix keyword (children of class_prefixes)
  "encapsulated",
  // Constraining clause keyword
  "constrainedby",
  // Control flow keywords (for comment attachment in equations/statements)
  // Note: if/elseif/when/elsewhen excluded - they would break if_expression handling
  "else",
  "then",
  // Class specifier keywords (children of extends_class_specifier)
  "extends",
  "end",
  // Iterator/comprehension keywords (children of function_call_args for sum/product/etc.)
  "for",
  "in",
]);

/**
 * Convert a tree-sitter Node to our ASTNode interface
 *
 * Includes named children plus specific operator/keyword tokens needed by the printer.
 * Excludes punctuation like '.', ';', '[', ']', '(', ')' etc.
 */
function convertNode(node: TSNode, fieldName?: string): ASTNode {
  const children: ASTNode[] = [];

  // Include named children and specific anonymous tokens (operators, keywords)
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      const childFieldName = node.fieldNameForChild(i) || undefined;
      // Include if named OR if it's a needed anonymous token
      if (child.isNamed || INCLUDED_ANONYMOUS_TOKENS.has(child.type)) {
        children.push(convertNode(child, childFieldName));
      }
    }
  }

  return {
    type: node.type,
    text: node.text,
    range: {
      start: {
        row: node.startPosition.row,
        column: node.startPosition.column,
      },
      end: {
        row: node.endPosition.row,
        column: node.endPosition.column,
      },
    },
    children,
    isError: node.type === "ERROR",
    isMissing: node.isMissing,
    fieldName,
    _syntaxNode: node,
  };
}

/**
 * Count error and missing nodes in AST
 */
function countErrors(node: ASTNode): {
  errorCount: number;
  missingCount: number;
} {
  let errorCount = 0;
  let missingCount = 0;

  function traverse(n: ASTNode) {
    if (n.isError) errorCount++;
    if (n.isMissing) missingCount++;
    for (const child of n.children) {
      traverse(child);
    }
  }

  traverse(node);
  return { errorCount, missingCount };
}

/**
 * Parse Modelica source code using web-tree-sitter (WASM) bindings
 * @param sourceCode The Modelica source code to parse
 * @param debug Optional debug flag (kept for API compatibility)
 * @returns ParseResult with AST and error information
 */
export async function parse(
  sourceCode: string,
  debug: boolean = false,
): Promise<ParseResult> {
  const parser = await getParser();
  const tree = parser.parse(sourceCode);
  if (!tree) {
    throw new Error("Modelica parser produced no syntax tree");
  }

  if (debug) {
    console.log("[DEBUG] Tree root type:", tree.rootNode.type);
    console.log("[DEBUG] Tree has errors:", tree.rootNode.hasError);
    console.log(
      "[DEBUG] S-expression:",
      tree.rootNode.toString().substring(0, 500),
    );
  }

  const rootNode = convertNode(tree.rootNode);
  const { errorCount, missingCount } = countErrors(rootNode);

  return {
    rootNode,
    hasErrors: errorCount > 0 || missingCount > 0,
    errorCount,
    missingCount,
  };
}

/**
 * Parse Modelica file using web-tree-sitter (WASM) bindings
 * @param filePath Path to the Modelica file
 * @returns ParseResult with AST and error information
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const absolutePath = path.resolve(filePath);
  const sourceCode = fs.readFileSync(absolutePath, "utf8");
  return parse(sourceCode);
}

/**
 * Walk the AST and call visitor for each node
 */
export function walk(
  node: ASTNode,
  visitor: (node: ASTNode, parent: ASTNode | null) => void,
  parent: ASTNode | null = null,
): void {
  visitor(node, parent);
  for (const child of node.children) {
    walk(child, visitor, node);
  }
}

/**
 * Find all nodes of a specific type
 */
export function findNodesByType(node: ASTNode, type: string): ASTNode[] {
  const results: ASTNode[] = [];
  walk(node, (n) => {
    if (n.type === type) {
      results.push(n);
    }
  });
  return results;
}

/**
 * Find the deepest node at a given position
 */
export function findNodeAtPosition(
  node: ASTNode,
  row: number,
  column: number,
): ASTNode | null {
  const { start, end } = node.range;

  // Check if position is within this node
  const afterStart =
    row > start.row || (row === start.row && column >= start.column);
  const beforeEnd = row < end.row || (row === end.row && column <= end.column);

  if (!afterStart || !beforeEnd) {
    return null;
  }

  // Check children for more specific match
  for (const child of node.children) {
    const found = findNodeAtPosition(child, row, column);
    if (found) {
      return found;
    }
  }

  // No child matched, return this node
  return node;
}

/**
 * Get the text content of a node (for leaf nodes like identifiers)
 */
export function getNodeText(node: ASTNode): string {
  return node.text || "";
}

/**
 * Check if the parser is available
 */
export async function isParserAvailable(): Promise<boolean> {
  try {
    const parser = await getParser();
    // Try to parse a simple Modelica snippet
    const tree = parser.parse("model Test end Test;");
    return tree?.rootNode.type === "stored_definitions";
  } catch {
    return false;
  }
}

/**
 * Get tree-sitter version
 */
export function getParserVersion(): string | null {
  try {
    return "web-tree-sitter (WASM bindings)";
  } catch {
    return null;
  }
}
