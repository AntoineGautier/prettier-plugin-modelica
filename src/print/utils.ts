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
  indentIfBreak,
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
 * Position of an expression relative to the line it starts on.
 *
 * Every breaking construct (binary chains, comparisons, function args,
 * if-expressions) unconditionally indents its own continuation lines, so
 * indentation composes without any knowledge of ancestors. The only context
 * a construct needs from its parent is its layout position (which decides
 * layout, not indentation ownership):
 *
 * - "mid-line": the expression continues a line (`name=`, `then `, `lhs = `
 *   in equations, function args, binary operands). An if-expression here
 *   indents its then/else branches relative to `if`.
 * - "line-start": the expression begins a line of its own (declaration rhs
 *   after ` =` breaks, comparison rhs after the operator breaks). An
 *   if-expression here keeps then/else aligned with `if`.
 *
 * The parent sets the position by wrapping the child's print call in
 * printAtPosition().
 *
 * ⚠️ Prettier caches the printed doc per node: only the FIRST print of a
 * node builds its doc. A position wrapper is therefore only effective if it
 * wraps the first print of that subtree — never pre-print children (e.g. a
 * blanket `path.map(print, "children")`) that are later re-printed with a
 * position wrapper, or the wrapper will silently see the cached doc.
 */
export type ExprPosition = "line-start" | "mid-line";

const positionStack: ExprPosition[] = [];

/**
 * Prints a subexpression with the given position context.
 *
 * Also clears the skew group: repositioned subexpressions (a broken-off
 * operand, an argument on its own line) start at a column that matches the
 * indentation state again, so first-line compensation must not reach them.
 */
export function printAtPosition<T>(position: ExprPosition, print: () => T): T {
  positionStack.push(position);
  skewGroupStack.push(undefined);
  try {
    return print();
  } finally {
    positionStack.pop();
    skewGroupStack.pop();
  }
}

/**
 * Position context set by the nearest enclosing construct. Defaults to
 * "mid-line" (the safe choice: it can only add indentation, never lose it).
 */
export function currentPosition(): ExprPosition {
  return positionStack[positionStack.length - 1] ?? "mid-line";
}

/**
 * Skew group context. A fluid binding value keeps the declaration's
 * indentation state even when the ` =` group breaks and the value starts its
 * own line two columns further right (see formatFluidAssignmentRhs). That
 * skew is wanted for self-indenting constructs — chain continuations and if
 * clauses land flush with the value's first line — but an argument list
 * opening on that first line would break flush with its own call. Printers
 * of such constructs read the group id here and wrap their indent in
 * indentIfBreak on it, adding the missing level exactly when the ` =` group
 * broke. The context survives only plain pass-through prints (expression
 * wrappers, parentheses, a chain's first operand), i.e. content that can
 * still be on the value's first line; printAtPosition clears it.
 */
const skewGroupStack: (symbol | undefined)[] = [];

/**
 * Prints a subexpression with the given skew group in scope.
 */
export function printWithSkewGroup<T>(groupId: symbol, print: () => T): T {
  skewGroupStack.push(groupId);
  try {
    return print();
  } finally {
    skewGroupStack.pop();
  }
}

/**
 * Skew group set by the nearest enclosing fluid assignment, if any.
 */
export function currentSkewGroup(): symbol | undefined {
  return skewGroupStack[skewGroupStack.length - 1];
}

/**
 * Formats the right-hand side of a binary operator with line-break behavior.
 * Pattern: ` <op> value` where the value breaks onto an indented line.
 */
export function formatBinaryRhs(operator: string, rhsDoc: Doc): Doc {
  return [" ", operator, indent(group([line, rhsDoc]))];
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
 * Fluid variant of formatAssignmentRhs for declaration binding equations.
 *
 * The group only spans ` =` and the line, so its fits check measures the
 * value up to the value's own first break point. The value is glued after
 * ` = ` and breaks naturally inside whenever its first chunk fits; only when
 * that chunk would overflow does the line break after ` =` and the value
 * start on its own indented line.
 *
 * The value doc stays outside the indent on purpose: its indentation state
 * remains at the declaration's level even when the value starts its own line
 * two columns further right. Self-indenting constructs (arithmetic chain
 * continuations, if clauses) then land flush with the value's first line.
 * Constructs that would break flush with their own opener because of this
 * skew (argument lists opening on the value's first line) compensate via the
 * group id — see currentSkewGroup.
 */
export function formatFluidAssignmentRhs(rhsDoc: Doc, groupId?: symbol): Doc {
  return [
    group([" =", indent(line)], groupId ? { id: groupId } : undefined),
    rhsDoc,
  ];
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
  hardNewline: boolean = false,
): Doc {
  if (inChoices) {
    return [line, doc];
  }
  if (hardNewline) {
    return indent([hardline, doc]);
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
 * Check if a STRING node is part of a string concatenation (binary_expression with +)
 * Such strings may have incomplete/unbalanced HTML tags and should not be HTML-formatted
 */
export function isPartOfStringConcatenation(path: AstPath<ASTNode>): boolean {
  // Walk up the tree: STRING -> string_literal_expression -> literal_expression 
  // -> primary_expression -> simple_expression -> binary_expression
  const parent = path.getParentNode();
  const grandparent = path.getParentNode(1);
  const greatGrandparent = path.getParentNode(2);
  
  if (
    parent?.type === "string_literal_expression" &&
    grandparent?.type === "literal_expression" &&
    greatGrandparent?.type === "primary_expression"
  ) {
    const greatGreatGrandparent = path.getParentNode(3);
    if (greatGreatGrandparent?.type === "simple_expression") {
      const ggggParent = path.getParentNode(4);
      if (ggggParent?.type === "binary_expression") {
        return true;
      }
    }
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
 * Print list children joined by hardlines, keeping a comment on the same
 * line as the preceding sibling when it appeared there in the source.
 * Used for equation_list and statement_list, where a trailing comment
 * after `;` is parsed as a sibling of the equation/statement it follows.
 */
export function printListWithInlineComments(
  path: AstPath<ASTNode>,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const inline =
      i > 0 &&
      isComment(child) &&
      child.range.start.row === node.children[i - 1].range.end.row;
    if (i > 0) {
      parts.push(inline ? " " : hardline);
    }
    parts.push(path.call(print, "children", i));
  }
  return parts;
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
