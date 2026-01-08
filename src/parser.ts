/**
 * Tree-sitter parser wrapper for Modelica
 * Uses native tree-sitter Node bindings for parsing
 */

import Parser from "tree-sitter";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

// Import the Modelica language grammar
// The grammar is a CommonJS module, so we need createRequire in ESM context
const require = createRequire(import.meta.url);
const ModelicaGrammar = require("tree-sitter-modelica");

// Initialize the parser with the Modelica language
const parser = new Parser();
parser.setLanguage(ModelicaGrammar);

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
 * This interface wraps tree-sitter's SyntaxNode to maintain compatibility
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
  /** Raw tree-sitter SyntaxNode for advanced use cases (e.g., accessing anonymous children) */
  _syntaxNode?: Parser.SyntaxNode;
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
]);

/**
 * Convert a tree-sitter SyntaxNode to our ASTNode interface
 *
 * Includes named children plus specific operator/keyword tokens needed by the printer.
 * Excludes punctuation like '.', ';', '[', ']', '(', ')' etc.
 */
function convertNode(node: Parser.SyntaxNode, fieldName?: string): ASTNode {
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
 * Parse Modelica source code using native tree-sitter bindings
 * @param sourceCode The Modelica source code to parse
 * @param debug Optional debug flag (kept for API compatibility)
 * @returns ParseResult with AST and error information
 */
export function parse(sourceCode: string, debug: boolean = false): ParseResult {
  const tree = parser.parse(sourceCode);

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
 * Parse Modelica file using native tree-sitter bindings
 * @param filePath Path to the Modelica file
 * @returns ParseResult with AST and error information
 */
export function parseFile(filePath: string): ParseResult {
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
export function isParserAvailable(): boolean {
  try {
    // Try to parse a simple Modelica snippet
    const tree = parser.parse("model Test end Test;");
    return tree.rootNode.type === "stored_definitions";
  } catch {
    return false;
  }
}

/**
 * Get tree-sitter version
 */
export function getParserVersion(): string | null {
  try {
    // Return the tree-sitter package version
    // Note: tree-sitter doesn't expose version directly, so we return a placeholder
    return "tree-sitter (native bindings)";
  } catch {
    return null;
  }
}
