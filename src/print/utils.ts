/**
 * Shared utilities for Modelica printer
 * Contains context detection, formatting helpers, and common functions
 */

import type { AstPath, Doc } from "prettier";
import { doc } from "prettier";
import type { ASTNode } from "../parser.js";

// ===========================================
// Type Definitions
// ===========================================

export type PrintFn = (path: AstPath<ASTNode>) => Doc;

// ===========================================
// Re-export Prettier Doc Builders
// ===========================================

export const { builders } = doc;
export const {
  group,
  indent,
  line,
  softline,
  hardline,
  join,
  fill,
  conditionalGroup,
  ifBreak,
} = builders;

// ===========================================
// Constants
// ===========================================

/**
 * List of graphical primitive names in Modelica annotations
 */
export const GRAPHICAL_PRIMITIVES = new Set([
  "Rectangle",
  "Ellipse",
  "Line",
  "Polygon",
  "Text",
  "Bitmap",
  "Arc",
  "BezierCurve",
  "FilledShape",
  "PointArray",
]);

// ===========================================
// Continuation Line Handling
// ===========================================

/**
 * Checks if a node at a given index in an if_expression is a then/else VALUE
 * (as opposed to the condition). In an if_expression:
 * - children[0] is the condition
 * - children[1] is the then-value
 * - children[2+] are else_if_clause or the else-value
 */
export function isIfExpressionValue(
  ifExpr: ASTNode,
  childIndex: number,
): boolean {
  if (childIndex === 0) return false; // condition
  if (childIndex === 1) return true; // then-value
  const child = ifExpr.children[childIndex];
  return child && child.type !== "else_if_clause";
}

/**
 * Determines if the current path is inside an if_expression's then or else VALUE
 * (not the condition). This is used to propagate continuation context through
 * nested if-expressions.
 */
export function isInsideIfExpressionValue(path: AstPath<ASTNode>): boolean {
  for (let i = 1; i < 20; i++) {
    const ancestor = path.getParentNode(i);
    if (!ancestor) break;

    if (ancestor.type === "if_expression") {
      const prevAncestor = path.getParentNode(i - 1);
      if (!prevAncestor) break;

      const childIndex = ancestor.children.findIndex((c) => c === prevAncestor);
      if (childIndex >= 0 && isIfExpressionValue(ancestor, childIndex)) {
        return true;
      }
    }

    // Stop at major boundaries
    if (ancestor.type === "declaration") break;
    if (ancestor.type === "component_declaration") break;
    if (ancestor.type === "equation") break;
    if (ancestor.type === "statement") break;
    if (ancestor.type === "element") break;
  }
  return false;
}

/**
 * Checks if a parenthesized_expression node directly contains an if_expression as its core content.
 */
export function parenContainsIfExpression(node: ASTNode): boolean {
  if (node.type !== "parenthesized_expression") return false;

  const outputList = node.children.find(
    (c) => c.type === "output_expression_list",
  );
  if (!outputList) return false;

  const expr = outputList.children.find((c) => c.type === "expression");
  if (!expr) return false;

  return expr.children.some((c) => c.type === "if_expression");
}

/**
 * Determines if the current path is inside a context that has already
 * added continuation indentation. This prevents cumulative/stacking indents.
 *
 * ⚠️ TECHNICAL DEBT
 * This is a hacky implementation used as a temporary workaround until a proper
 * breaking-and-indenting logic is implemented for assignments, binary expressions
 * and function args.
 * It WILL necesserily yield incorrect indenting for deeply nested constructs
 * because it relies on a **static** context analysis, whereas prettier
 * printWidth-aware builtins make decisions **at print time**.
 * We should rather have each construct **conditionally** introduce indents
 * such as prettier JS fluid assignment:
 *
 *     // First break right-hand side (no group), then after operator
 *     case "fluid": {
 *       const groupId = Symbol("assignment");
 *       return group([
 *         group(leftDoc),
 *         operator,
 *         group(indent(line), { id: groupId }),
 *         lineSuffixBoundary,
 *         indentIfBreak(rightDoc, { groupId }),
 *       ]);
 *     }
 */
export function isInContinuationContext(path: AstPath<ASTNode>): boolean {
  for (let i = 1; i < 15; i++) {
    const ancestor = path.getParentNode(i);
    if (!ancestor) break;

    if (ancestor.type === "named_argument") {
      return true;
    }

    if (ancestor.type === "if_expression") {
      if (isInsideIfExpressionValue(path)) {
        return true;
      }
      const ifParent = path.getParentNode(i + 1);
      if (
        ifParent?.type === "expression" ||
        ifParent?.type === "simple_expression"
      ) {
        const ifGrandparent = path.getParentNode(i + 2);
        if (ifGrandparent?.type === "output_expression_list") {
          const ifGreatGrandparent = path.getParentNode(i + 3);
          if (ifGreatGrandparent?.type === "parenthesized_expression") {
            return true;
          }
        }
      }
    }

    // Stop at these boundaries
    if (ancestor.type === "declaration") break;
    if (ancestor.type === "component_declaration") break;
    if (ancestor.type === "equation") break;
    if (ancestor.type === "statement") break;
    if (ancestor.type === "element") break;
    if (ancestor.type === "function_call_args") break;
  }
  return false;
}

/**
 * Wraps a document in continuation indentation, but only if not already
 * in a continuation context.
 */
export function wrapContinuation(content: Doc, path: AstPath<ASTNode>): Doc {
  if (isInContinuationContext(path)) {
    return group([line, content]);
  }
  return group([indent([line, content])]);
}

// ===========================================
// Formatting Helpers
// ===========================================

/**
 * Formats an assignment with proper spacing and line-break behavior.
 * Pattern: ` = value`
 */
export function formatAssignmentRhs(rhsDoc: Doc): Doc {
  return group([" =", indent([line, rhsDoc])]);
}

/**
 * Formats an assignment without spaces around `=` but with line-break behavior.
 * Pattern: `=value`
 */
export function formatAssignmentRhsCompact(
  rhsDoc: Doc,
  inChoices: boolean = false,
): Doc {
  if (inChoices) {
    return group(["=", [softline, rhsDoc]]);
  }
  return group(["=", indent([softline, rhsDoc])]);
}

/**
 * Formats a trailing description string or annotation clause.
 */
export function formatTrailingDescription(
  doc: Doc,
  inChoices: boolean = false,
): Doc {
  if (inChoices) {
    return [line, doc];
  }
  return indent([line, doc]);
}

/**
 * Formats a block comment in prettier-style with aligned asterisks.
 */
export function formatBlockComment(text: string): Doc {
  const content = text.slice(2, -2);
  if (!content.includes("\n")) {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return "/* */";
    }
    return `/* ${trimmed} */`;
  }

  const lines = content.split("\n");
  const contentLines: string[] = [];
  for (const lineText of lines) {
    let trimmed = lineText.trimStart();
    if (trimmed.startsWith("*") && !trimmed.startsWith("*/")) {
      trimmed = trimmed.slice(1);
      if (trimmed.startsWith(" ")) {
        trimmed = trimmed.slice(1);
      }
    }
    trimmed = trimmed.trimEnd();
    contentLines.push(trimmed);
  }

  while (contentLines.length > 0 && contentLines[0] === "") {
    contentLines.shift();
  }
  while (
    contentLines.length > 0 &&
    contentLines[contentLines.length - 1] === ""
  ) {
    contentLines.pop();
  }

  if (contentLines.length === 0) {
    return "/* */";
  }

  const docParts: Doc[] = ["/*"];
  for (const contentLine of contentLines) {
    if (contentLine === "") {
      docParts.push(hardline, " *");
    } else {
      docParts.push(hardline, ` * ${contentLine}`);
    }
  }
  docParts.push(hardline, " */");

  return docParts;
}

// ===========================================
// Context Detection Functions
// ===========================================

/**
 * Determines if an if-expression appears "mid-line" - i.e., after something
 * on the same line like `name=if ...` or `arg=if ...`.
 */
export function isMidLineIfExpression(path: AstPath<ASTNode>): boolean {
  const parent = path.getParentNode();
  const grandparent = path.getParentNode(1);
  const greatGrandparent = path.getParentNode(2);

  if (parent?.type === "expression" || parent?.type === "simple_expression") {
    if (grandparent?.type === "modification") {
      if (
        greatGrandparent?.type === "element_modification" ||
        greatGrandparent?.type === "named_argument"
      ) {
        return true;
      }
    }
  }

  if (
    (parent?.type === "simple_expression" || parent?.type === "expression") &&
    grandparent?.type === "simple_equation"
  ) {
    return true;
  }

  return false;
}

/**
 * Check if we're inside an annotation clause by walking up the path
 */
export function isInsideAnnotation(path: AstPath<ASTNode>): boolean {
  let depth = 0;
  try {
    while (true) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "annotation_clause") return true;
      depth++;
      if (depth > 50) break;
    }
  } catch {
    // path.getParentNode can throw if we go too far
  }
  return false;
}

/**
 * Check if we're inside a named_element (class/function definition within element_list)
 */
export function isInsideNamedElement(path: AstPath<ASTNode>): boolean {
  let depth = 0;
  try {
    while (true) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "named_element") return true;
      if (node.type === "stored_definition") return false;
      depth++;
      if (depth > 50) break;
    }
  } catch {
    // path.getParentNode can throw if we go too far
  }
  return false;
}

/**
 * Check if we're inside a class_modification (e.g., redeclare inside parentheses).
 */
export function isInsideClassModification(path: AstPath<ASTNode>): boolean {
  let depth = 0;
  try {
    while (true) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "class_modification") return true;
      if (node.type === "named_element") return false;
      depth++;
      if (depth > 50) break;
    }
  } catch {
    // path.getParentNode can throw if we go too far
  }
  return false;
}

/**
 * Check if we're a first-level attribute inside an annotation
 */
export function isFirstLevelAnnotationAttribute(
  path: AstPath<ASTNode>,
): boolean {
  try {
    const grandparent = path.getParentNode(1);
    const greatGrandparent = path.getParentNode(2);

    return (
      grandparent?.type === "class_modification" &&
      greatGrandparent?.type === "annotation_clause"
    );
  } catch {
    return false;
  }
}

/**
 * Check if a node represents a graphical primitive function call
 */
export function isGraphicalPrimitive(node: ASTNode): boolean {
  if (node.type !== "function_application") return false;
  const nameChild = node.children.find(
    (c) => c.type === "component_reference" || c.type === "name",
  );
  if (!nameChild) return false;
  const ident = nameChild.text?.split(".").pop() || "";
  return GRAPHICAL_PRIMITIVES.has(ident);
}

/**
 * Check if this is a graphics array (graphics={...})
 */
export function isGraphicsArray(path: AstPath<ASTNode>): boolean {
  try {
    for (let depth = 0; depth < 10; depth++) {
      const node = path.getParentNode(depth);
      if (!node) break;

      if (node.type === "element_modification") {
        const nameChild = node.children.find((c) => c.type === "name");
        if (nameChild?.text === "graphics") return true;
        break;
      }

      if (node.type === "annotation_clause") break;
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Check if this class_modification's parent element_modification is 'choices'
 */
export function isChoicesLevel(path: AstPath<ASTNode>): boolean {
  const parent = path.getParentNode();
  if (parent?.type === "modification") {
    const grandparent = path.getParentNode(1);
    if (grandparent?.type === "element_modification") {
      const nameChild = grandparent.children?.find((c) => c.type === "name");
      if (nameChild?.text === "choices") return true;
    }
  }
  return false;
}

/**
 * Check if this is inside a choices annotation
 */
export function isInsideChoicesAnnotation(path: AstPath<ASTNode>): boolean {
  try {
    let depth = 0;
    while (depth < 20) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "element_modification") {
        const nameChild = node.children.find((c) => c.type === "name");
        if (nameChild?.text === "choices") return true;
      }
      if (node.type === "annotation_clause") break;
      depth++;
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Check if an array contains only numeric/coordinate data (should stay compact)
 */
export function isCoordinateArray(node: ASTNode): boolean {
  if (node.type !== "array_constructor" && node.type !== "array_arguments")
    return false;

  const isSimple = (n: ASTNode): boolean => {
    if (
      n.type === "literal_expression" ||
      n.type === "UNSIGNED_INTEGER" ||
      n.type === "UNSIGNED_REAL" ||
      n.type === "number"
    )
      return true;
    if (n.type === "unary_expression" && n.children.length <= 2) {
      return n.children.every((c) => isSimple(c) || c.type === "IDENT");
    }
    if (
      n.type === "simple_expression" ||
      n.type === "expression" ||
      n.type === "primary_expression"
    ) {
      return n.children.every((c) => isSimple(c));
    }
    if (n.type === "array_constructor" || n.type === "array_arguments") {
      return n.children.every((c) => isSimple(c));
    }
    if (n.type === "component_reference" || n.type === "IDENT") return true;
    return false;
  };

  return node.children.every((c) => isSimple(c));
}

/**
 * Check if a named_element contains a class definition (function, model, package, etc.)
 */
export function isClassDefinitionElement(node: ASTNode): boolean {
  if (node.type !== "named_element") return false;
  return node.children.some((child) => child.type === "class_definition");
}

/**
 * Check if a child node is a comment (line or block)
 */
export function isComment(node: ASTNode): boolean {
  return node.type === "comment" || node.type === "BLOCK_COMMENT";
}

/**
 * Check if two nodes are on the same line
 */
export function onSameLine(a: ASTNode, b: ASTNode): boolean {
  return a.range.start.row === b.range.start.row;
}

/**
 * Get the name of a function application or element modification
 */
export function getAnnotationElementName(node: ASTNode): string | null {
  if (node.type === "function_application") {
    const nameChild = node.children.find(
      (c) => c.type === "component_reference" || c.type === "name",
    );
    return nameChild?.text?.split(".").pop() || null;
  }
  if (node.type === "element_modification") {
    const nameChild = node.children.find((c) => c.type === "name");
    return nameChild?.text || null;
  }
  return null;
}

/**
 * Check if we're inside a graphical primitive (Rectangle, Line, etc.)
 */
export function isInsideGraphicalPrimitive(path: AstPath<ASTNode>): boolean {
  try {
    let depth = 0;
    while (depth < 20) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "function_application" && isGraphicalPrimitive(node)) {
        return true;
      }
      if (node.type === "annotation_clause") break;
      depth++;
    }
  } catch {
    // Ignore
  }
  return false;
}

// ===========================================
// Generic Helper Functions
// ===========================================

/**
 * Print all children without separators
 */
export function printChildren(path: AstPath<ASTNode>, print: PrintFn): Doc[] {
  return path.map(print, "children");
}

/**
 * Print all children with space separators
 */
export function printChildrenWithSpaces(
  path: AstPath<ASTNode>,
  print: PrintFn,
): Doc[] {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    if (i > 0) {
      parts.push(" ");
    }
    parts.push(path.call(print, "children", i));
  }

  return parts;
}

/**
 * Extract prefix keywords (parameter, constant, final, etc.) from component_clause
 */
export function extractComponentClausePrefix(node: ASTNode): string {
  const text = node.text ?? "";
  const typeSpec = node.children.find((c) => c.type === "type_specifier");
  if (!typeSpec) return "";

  const startRow = node.range.start.row;
  const startCol = node.range.start.column;
  const typeStartRow = typeSpec.range.start.row;
  const typeStartCol = typeSpec.range.start.column;

  if (startRow === typeStartRow && startCol === typeStartCol) {
    return "";
  }

  const lines = text.split("\n");
  let prefixText = "";

  if (startRow === typeStartRow) {
    prefixText = lines[0].substring(0, typeStartCol - startCol).trim();
  } else {
    prefixText = lines[0].trim();
  }

  return prefixText;
}

/**
 * Extract modification prefix (each, final) from element_modification node
 */
export function extractModificationPrefix(node: ASTNode): string {
  const text = node.text ?? "";
  const firstChild = node.children[0];
  if (!firstChild) return "";

  const startRow = node.range.start.row;
  const startCol = node.range.start.column;
  const childStartRow = firstChild.range.start.row;
  const childStartCol = firstChild.range.start.column;

  if (startRow === childStartRow) {
    if (childStartCol > startCol) {
      const lines = text.split("\n");
      const prefixText = lines[0].substring(0, childStartCol - startCol).trim();
      return prefixText;
    }
  } else {
    const lines = text.split("\n");
    const prefixText = lines[0].trim();
    return prefixText;
  }

  return "";
}

/**
 * Check if Doc array ends with a dot
 */
export function endsWithDot(parts: Doc[]): boolean {
  const last = parts[parts.length - 1];
  return typeof last === "string" && last.endsWith(".");
}
