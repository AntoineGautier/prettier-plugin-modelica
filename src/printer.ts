/**
 * Prettier printer for Modelica AST
 * Handles all node types from the tree-sitter-modelica grammar
 */

import type { AstPath, Doc, Printer } from "prettier";
import { doc } from "prettier";
import type { ASTNode } from "./parser.js";
import { formatHTMLString, DEFAULT_PRESERVED_TAGS } from "./html-formatter.js";

const { builders } = doc;
const {
  group,
  indent,
  line,
  softline,
  hardline,
  join,
  fill,
  conditionalGroup,
} = builders;

// ===========================================
// Centralized Continuation Line Handling
// ===========================================

/**
 * Checks if a node at a given index in an if_expression is a then/else VALUE
 * (as opposed to the condition). In an if_expression:
 * - children[0] is the condition
 * - children[1] is the then-value
 * - children[2+] are else_if_clause or the else-value
 *
 * @param ifExpr - The if_expression node
 * @param childIndex - The index of the child we're checking
 * @returns true if the child is a then-value or else-value (not condition)
 */
function isIfExpressionValue(ifExpr: ASTNode, childIndex: number): boolean {
  // children[0] is always the condition
  // children[1] is the then-value (unless it's an else_if_clause, which shouldn't happen)
  // children[2+] are either else_if_clause or the final else-value
  if (childIndex === 0) return false; // condition
  if (childIndex === 1) return true; // then-value
  // For index >= 2, check if it's NOT an else_if_clause (those have their own handling)
  const child = ifExpr.children[childIndex];
  return child && child.type !== "else_if_clause";
}

/**
 * Determines if the current path is inside an if_expression's then or else VALUE
 * (not the condition). This is used to propagate continuation context through
 * nested if-expressions.
 *
 * For example, in: `then (if X then Y else Z)`
 * The inner if_expression should know it's inside the outer then's value,
 * so its own then/else keywords should be indented.
 *
 * Note: Parenthesized expressions are TRANSPARENT - we look through them to find
 * the outer if_expression context. This is crucial for preventing double indentation
 * in patterns like:
 *   then (if var == Long.Package.Name
 *     then result
 * Without transparency, the comparison RHS would be double-indented.
 */
function isInsideIfExpressionValue(path: AstPath<ASTNode>): boolean {
  // Walk up the parent chain looking for if_expression
  // We need to check if we're in the then/else VALUE, not the condition
  for (let i = 1; i < 20; i++) {
    const ancestor = path.getParentNode(i);
    if (!ancestor) break;

    // Parenthesized expressions are transparent - look through them to outer context
    // This prevents false negatives when checking if we're in an if_expression's then/else value

    if (ancestor.type === "if_expression") {
      // Found an if_expression ancestor. Now check which child we came from.
      // We need to find the child at index i-1 and check its position in the if_expression
      const prevAncestor = path.getParentNode(i - 1);
      if (!prevAncestor) break;

      // Find the index of prevAncestor in ancestor.children
      const childIndex = ancestor.children.findIndex((c) => c === prevAncestor);
      if (childIndex >= 0 && isIfExpressionValue(ancestor, childIndex)) {
        return true;
      }
      // If we're in the condition, don't count this as continuation context
      // but keep looking for outer if_expressions
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
 * Structure: parenthesized_expression -> output_expression_list -> expression -> if_expression
 *
 * This is used to avoid double indentation when the if_expression already handles its own
 * then/else branch indentation.
 */
function parenContainsIfExpression(node: ASTNode): boolean {
  if (node.type !== "parenthesized_expression") return false;

  // Navigate through the wrapper layers
  const outputList = node.children.find(
    (c) => c.type === "output_expression_list",
  );
  if (!outputList) return false;

  const expr = outputList.children.find((c) => c.type === "expression");
  if (!expr) return false;

  // Check if the expression directly contains an if_expression
  return expr.children.some((c) => c.type === "if_expression");
}

/**
 * Determines if the current path is inside a context that has already
 * added continuation indentation. This prevents cumulative/stacking indents.
 *
 * A continuation context is entered when:
 * - We're nested inside another binary_expression (the outer one already added indent)
 * - We're inside an if_expression's then/else VALUE (the if_expression adds indent)
 *
 * We stop looking at certain boundaries:
 * - declaration (top-level variable declaration)
 * - component_declaration
 * - equation / statement boundaries
 * - function_call_args (each function call is its own context)
 *
 * IMPORTANT: Parenthesized expressions are TRANSPARENT to continuation context.
 * This means they propagate the outer continuation context to their inner content.
 *
 * Why? Consider this pattern:
 *   if outer_cond
 *   then (if inner_var == Very.Long.Package.Name
 *     then result
 *
 * Without transparency:
 * - The outer if adds indent for its then-value (the parenthesized expression)
 * - Parens reset context, so inner binary_expression (==) sees no continuation context
 * - Binary_expression adds its own indent for the RHS
 * - Result: double indentation for "Very.Long.Package.Name"
 *
 * With transparency:
 * - The outer if adds indent for its then-value
 * - Parens are transparent, so inner binary_expression sees continuation context
 * - Binary_expression doesn't add extra indent (already in continuation context)
 * - Result: correct single indentation level
 */
function isInContinuationContext(path: AstPath<ASTNode>): boolean {
  // Start from i=1 to skip the current node itself
  for (let i = 1; i < 15; i++) {
    const ancestor = path.getParentNode(i);
    if (!ancestor) break;

    // NOTE: binary_expression is NOT a continuation context since it no longer adds indent
    // This allows parenthesized_expression and other constructs to add their own indent

    // If we're inside a named_argument, we're in continuation context
    // The named_argument already adds indent for its value
    if (ancestor.type === "named_argument") {
      return true;
    }

    // Check if_expression BEFORE parenthesized_expression to properly detect
    // nested if-expressions inside then/else clauses
    // If we're inside an if_expression's then/else value, we're in continuation context
    // The if_expression adds indent for its then/else values
    // But NOT for the condition part - use isInsideIfExpressionValue to check properly
    if (ancestor.type === "if_expression") {
      // Use the existing helper to check if we're in a then/else value (not condition)
      if (isInsideIfExpressionValue(path)) {
        return true;
      }
      // We're in the condition - check if the if_expression is inside a parenthesized_expression
      // that will add indent via option2Operand. Pattern: if_expression -> expression -> output_expression_list -> parenthesized_expression
      const ifParent = path.getParentNode(i + 1);
      if (
        ifParent?.type === "expression" ||
        ifParent?.type === "simple_expression"
      ) {
        const ifGrandparent = path.getParentNode(i + 2);
        if (ifGrandparent?.type === "output_expression_list") {
          const ifGreatGrandparent = path.getParentNode(i + 3);
          if (ifGreatGrandparent?.type === "parenthesized_expression") {
            // The parenthesized expression will provide indent via option2Operand
            return true;
          }
        }
      }
      // We're in the condition but not in a paren - not continuation context, continue searching
    }

    // Parenthesized expressions are transparent - propagate outer continuation context inward
    // This is essential to prevent double indentation in nested if-expressions with comparisons

    // Stop at these boundaries - they reset the continuation context
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
 * in a continuation context. This is the central function for handling
 * continuation lines consistently across all constructs.
 *
 * @param content - The document to wrap
 * @param path - Current AST path for context detection
 * @returns Content wrapped with appropriate indentation
 */
function wrapContinuation(content: Doc, path: AstPath<ASTNode>): Doc {
  if (isInContinuationContext(path)) {
    // Already in continuation context - use group with line but NO indent
    // This allows Prettier to decide whether to break, but keeps same indent level
    return group([line, content]);
  }
  // Not in continuation context - add indent with group for break decision
  return group([indent([line, content])]);
}

/**
 * Formats an assignment with proper spacing and line-break behavior.
 * Used for both component declarations (via modification) and short class definitions.
 *
 * Pattern: ` = value` where:
 * - Space before and after `=`
 * - Line break after `=` if the assignment exceeds max line length
 * - Value is indented on continuation lines
 *
 * @param rhsDoc - The right-hand side document (the value being assigned)
 * @returns A grouped document with proper assignment formatting
 */
function formatAssignmentRhs(rhsDoc: Doc): Doc {
  return group([" =", indent([line, rhsDoc])]);
}

/**
 * Formats an assignment without spaces around `=` but with line-break behavior.
 * Used for short class definitions inside class_modification (e.g., redeclare).
 *
 * Pattern: `=value` where:
 * - No space around `=`
 * - Line break after `=` if the assignment exceeds max line length
 * - Value is indented on continuation lines (unless inside choices annotation)
 *
 * @param rhsDoc - The right-hand side document (the value being assigned)
 * @param inChoices - Whether we're inside a choices annotation (no extra indent)
 * @returns A grouped document with proper assignment formatting
 */
function formatAssignmentRhsCompact(
  rhsDoc: Doc,
  inChoices: boolean = false,
): Doc {
  if (inChoices) {
    // Inside choices: no extra indent, just allow line break
    return group(["=", [softline, rhsDoc]]);
  }
  return group(["=", indent([softline, rhsDoc])]);
}

/**
 * Formats a trailing description string or annotation clause.
 * These appear at the end of declarations and should break to a new line
 * with indentation when the line is too long.
 *
 * @param doc - The description string or annotation document
 * @param inChoices - Whether we're inside a choices annotation (no extra indent)
 * @returns A document with proper line break and indentation
 */
function formatTrailingDescription(doc: Doc, inChoices: boolean = false): Doc {
  if (inChoices) {
    return [line, doc];
  }
  return indent([line, doc]);
}

/**
 * Formats a block comment in prettier-style with aligned asterisks.
 * Transforms block comments to have:
 * - Opening /* on its own line (for multi-line comments)
 * - Each content line prefixed with " * " with aligned asterisks
 * - Closing * / on its own line with aligned asterisk
 *
 * Single-line comments (/* text * /) are left unchanged.
 *
 * Returns a Doc so that prettier can properly handle indentation of
 * multi-line comments (raw strings with \n don't get indented).
 *
 * @param text - The raw block comment text including /* and * /
 * @returns Formatted block comment as a Doc
 */
function formatBlockComment(text: string): Doc {
  // Check if it's a single-line block comment (no newlines in content)
  const content = text.slice(2, -2); // Remove /* and */
  if (!content.includes("\n")) {
    // Single-line comment: ensure proper spacing
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return "/* */";
    }
    return `/* ${trimmed} */`;
  }

  // Multi-line comment: format with aligned asterisks
  const lines = content.split("\n");

  // Process each line to extract content (removing existing * prefixes if any)
  const contentLines: string[] = [];
  for (const line of lines) {
    // Remove leading whitespace and optional * prefix
    let trimmed = line.trimStart();
    if (trimmed.startsWith("*") && !trimmed.startsWith("*/")) {
      // Remove the leading * and any following space
      trimmed = trimmed.slice(1);
      if (trimmed.startsWith(" ")) {
        trimmed = trimmed.slice(1);
      }
    }
    // Trim trailing whitespace
    trimmed = trimmed.trimEnd();
    contentLines.push(trimmed);
  }

  // Remove empty lines at the beginning and end of content
  while (contentLines.length > 0 && contentLines[0] === "") {
    contentLines.shift();
  }
  while (
    contentLines.length > 0 &&
    contentLines[contentLines.length - 1] === ""
  ) {
    contentLines.pop();
  }

  // If no content left, return minimal comment
  if (contentLines.length === 0) {
    return "/* */";
  }

  // Build the formatted comment as a Doc array with hardlines
  // This allows prettier to properly indent multi-line comments
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

/**
 * Determines if an if-expression appears "mid-line" - i.e., after something
 * on the same line like `name=if ...` or `arg=if ...`.
 *
 * When mid-line, the if-expression needs to indent its then/else keywords
 * relative to where the if started, not relative to the left margin.
 *
 * This is detected by checking if the parent is a modification with an
 * expression (meaning there's a `=` before us) and the parent of that
 * is NOT a top-level declaration.
 */
function isMidLineIfExpression(path: AstPath<ASTNode>): boolean {
  const parent = path.getParentNode();
  const grandparent = path.getParentNode(1);
  const greatGrandparent = path.getParentNode(2);

  // Pattern: if_expression -> expression/simple_expression -> modification -> X
  // where X is element_modification or named_argument (not declaration)
  if (parent?.type === "expression" || parent?.type === "simple_expression") {
    if (grandparent?.type === "modification") {
      // Check what the modification belongs to
      if (
        greatGrandparent?.type === "element_modification" ||
        greatGrandparent?.type === "named_argument"
      ) {
        return true;
      }
    }
  }

  // Also check for equation-level assignments: x = if ...
  // Pattern: if_expression -> expression -> simple_equation
  // In this case, the if appears on the same line as `x =`, so we need indent
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
function isInsideAnnotation(path: AstPath<ASTNode>): boolean {
  let depth = 0;
  try {
    while (true) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "annotation_clause") return true;
      depth++;
      if (depth > 50) break; // safety limit
    }
  } catch {
    // path.getParentNode can throw if we go too far
  }
  return false;
}

/**
 * Check if we're inside a class_modification (e.g., redeclare inside parentheses).
 * Used to determine if short class definitions should have spaces around = or not.
 * Top-level short class definitions get spaces, but redeclarations inside
 * class_modification should follow the same no-space rule as other bindings.
 */
function isInsideClassModification(path: AstPath<ASTNode>): boolean {
  let depth = 0;
  try {
    while (true) {
      const node = path.getParentNode(depth);
      if (!node) break;
      if (node.type === "class_modification") return true;
      // Stop at named_element - that's a top-level declaration
      if (node.type === "named_element") return false;
      depth++;
      if (depth > 50) break; // safety limit
    }
  } catch {
    // path.getParentNode can throw if we go too far
  }
  return false;
}

/**
 * Check if we're a first-level attribute inside an annotation
 * (direct child of the annotation's class_modification)
 */
function isFirstLevelAnnotationAttribute(path: AstPath<ASTNode>): boolean {
  try {
    // Walk up to find if parent is class_modification and grandparent is annotation_clause
    const grandparent = path.getParentNode(1); // might be class_modification
    const greatGrandparent = path.getParentNode(2); // might be annotation_clause

    return (
      grandparent?.type === "class_modification" &&
      greatGrandparent?.type === "annotation_clause"
    );
  } catch {
    return false;
  }
}

/**
 * Check if we're inside a first-level annotation attribute
 * (anywhere inside Diagram, Icon, Placement, etc. that are direct children of annotation)
 */

/**
 * List of graphical primitive names in Modelica annotations
 */
const GRAPHICAL_PRIMITIVES = new Set([
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

/**
 * Check if a node represents a graphical primitive function call
 */
function isGraphicalPrimitive(node: ASTNode): boolean {
  if (node.type !== "function_application") return false;
  // Get the function name from the first child (component_reference or name)
  const nameChild = node.children.find(
    (c) => c.type === "component_reference" || c.type === "name",
  );
  if (!nameChild) return false;
  // Get the identifier text
  const ident = nameChild.text?.split(".").pop() || "";
  return GRAPHICAL_PRIMITIVES.has(ident);
}

/**
 * Check if this is a graphics array (graphics={...})
 * The path structure for array_constructor inside graphics={} is:
 *   array_constructor -> primary_expression -> simple_expression -> expression -> modification -> element_modification
 * So we need to walk up ~5 levels to find the element_modification with name 'graphics'
 */
function isGraphicsArray(path: AstPath<ASTNode>): boolean {
  try {
    // Walk up the parent chain looking for element_modification with name 'graphics'
    for (let depth = 0; depth < 10; depth++) {
      const node = path.getParentNode(depth);
      if (!node) break;

      if (node.type === "element_modification") {
        const nameChild = node.children.find((c) => c.type === "name");
        if (nameChild?.text === "graphics") return true;
        // If we found an element_modification but it's not 'graphics', stop looking
        break;
      }

      // Stop if we hit the annotation boundary
      if (node.type === "annotation_clause") break;
    }
  } catch {
    // Ignore
  }
  return false;
}

/**
 * Check if this class_modification's parent element_modification is 'choices'
 * (i.e., this is the choices(...) level, not a nested choice(...))
 */
function isChoicesLevel(path: AstPath<ASTNode>): boolean {
  // class_modification's parent is 'modification', grandparent is 'element_modification'
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
function isInsideChoicesAnnotation(path: AstPath<ASTNode>): boolean {
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
function isCoordinateArray(node: ASTNode): boolean {
  if (node.type !== "array_constructor" && node.type !== "array_arguments")
    return false;

  // Check if all children are simple literals or nested coordinate arrays
  const isSimple = (n: ASTNode): boolean => {
    // Literal numbers
    if (
      n.type === "literal_expression" ||
      n.type === "UNSIGNED_INTEGER" ||
      n.type === "UNSIGNED_REAL" ||
      n.type === "number"
    )
      return true;
    // Negated numbers
    if (n.type === "unary_expression" && n.children.length <= 2) {
      return n.children.every((c) => isSimple(c) || c.type === "IDENT");
    }
    // Simple expressions that are just numbers
    if (
      n.type === "simple_expression" ||
      n.type === "expression" ||
      n.type === "primary_expression"
    ) {
      return n.children.every((c) => isSimple(c));
    }
    // Nested arrays (for {{x,y},{x,y}})
    if (n.type === "array_constructor" || n.type === "array_arguments") {
      return n.children.every((c) => isSimple(c));
    }
    // Component references that look like enum values or simple identifiers
    if (n.type === "component_reference" || n.type === "IDENT") return true;
    return false;
  };

  return node.children.every((c) => isSimple(c));
}

/**
 * Get the name of a function application or element modification
 */
function getAnnotationElementName(node: ASTNode): string | null {
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
function isInsideGraphicalPrimitive(path: AstPath<ASTNode>): boolean {
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

/**
 * Main print function for Modelica AST
 */
export const printModelica: Printer<ASTNode>["print"] = (
  path: AstPath<ASTNode>,
  __options: object,
  print: (path: AstPath<ASTNode>) => Doc,
): Doc => {
  const node = path.getValue();

  if (!node) {
    return "";
  }

  // Route to appropriate handler based on node type
  switch (node.type) {
    // ===========================================
    // Terminal nodes - print text directly
    // ===========================================
    case "IDENT":
    case "UNSIGNED_INTEGER":
    case "UNSIGNED_REAL":
      return node.text ?? "";

    case "STRING": {
      const text = node.text ?? "";

      // Check if this is HTML documentation in an annotation
      const inAnnotation = isInsideAnnotation(path);
      if (inAnnotation && text.includes("<html>")) {
        // Extract string content (remove quotes)
        const match = text.match(/^"(.*)"$/s);
        if (match) {
          const htmlContent = match[1];
          // Format HTML with line length limit, preserving <pre> and <code> content
          const formatted = formatHTMLString(htmlContent, {
            maxWidth: 80,
            baseIndent: "",
            removeEmptyLines: true,
            preservedTags: DEFAULT_PRESERVED_TAGS,
          });
          return `"${formatted}"`;
        }
      }

      return text;
    }

    case "BLOCK_COMMENT": {
      const text = node.text ?? "";
      return formatBlockComment(text);
    }

    case "comment":
      return node.text ?? "";

    // ===========================================
    // Top-level structure
    // ===========================================
    case "stored_definitions":
      return [join(hardline, path.map(print, "children")), hardline];

    case "stored_definition":
      return join(hardline, path.map(print, "children"));

    case "within_clause": {
      const parts: Doc[] = ["within"];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "name") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      parts.push(";");
      return parts;
    }

    // ===========================================
    // Class definitions
    // ===========================================
    case "class_definition": {
      const parts: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        if (i > 0) parts.push(" ");
        parts.push(path.call(print, "children", i));
      }
      return parts;
    }

    case "class_prefixes": {
      // This node contains keywords like "model", "package", "final", "partial", etc.
      // Use the text directly as it contains all the keywords
      return node.text ?? "";
    }

    case "long_class_specifier": {
      const parts: Doc[] = [];
      let className = "";

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT" && !className) {
          className = child.text ?? "";
          parts.push(className);
        } else if (child.type === "description_string") {
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (child.type === "extends_clause") {
          // extends clause should be on new line with indent
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (
          child.type === "element_list" ||
          child.type === "public_element_list" ||
          child.type === "protected_element_list"
        ) {
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (
          child.type === "equation_section" ||
          child.type === "algorithm_section"
        ) {
          // Equation/algorithm sections should start on a new line (no blank line)
          parts.push(hardline, path.call(print, "children", i));
        } else if (child.type === "annotation_clause") {
          parts.push(hardline, path.call(print, "children", i));
        } else if (child.type === "external_clause") {
          parts.push(hardline, path.call(print, "children", i));
        } else if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
          // Comments between sections - indent them like other content
          parts.push(indent([line, path.call(print, "children", i)]));
        }
      }

      parts.push(hardline, "end ", className, ";");
      return group(parts);
    }

    case "short_class_specifier": {
      // Format: IDENT = type_specifier [class_modification] [description_string]
      // Uses same formatting rules as component declarations:
      // - Space around = sign (only for top-level, not inside class_modification)
      // - Line break after = if assignment exceeds max line length
      // - Description string and annotation at new line and indented
      const parts: Doc[] = [];
      const inChoices = isInsideChoicesAnnotation(path);
      const inClassMod = isInsideClassModification(path);

      // Collect the RHS parts (type_specifier + class_modification) separately
      // so we can wrap them together with the assignment formatting
      const rhsParts: Doc[] = [];
      // Collect trailing parts (description_string, annotation_clause) to add after RHS
      const trailingParts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          parts.push(child.text ?? "");
        } else if (child.type === "base_prefix") {
          // base_prefix goes before the type_specifier in the RHS
          rhsParts.push(path.call(print, "children", i), " ");
        } else if (child.type === "type_specifier") {
          rhsParts.push(path.call(print, "children", i));
        } else if (child.type === "class_modification") {
          rhsParts.push(path.call(print, "children", i));
        } else if (child.type === "description_string") {
          // Description string on new line with indent (same as component_declaration)
          trailingParts.push(
            formatTrailingDescription(
              path.call(print, "children", i),
              inChoices,
            ),
          );
        } else if (child.type === "annotation_clause") {
          // Annotation clause on new line with indent (same as component_declaration)
          trailingParts.push(
            formatTrailingDescription(
              path.call(print, "children", i),
              inChoices,
            ),
          );
        }
      }

      // Add the RHS with proper assignment formatting
      if (rhsParts.length > 0) {
        if (inClassMod) {
          // Inside class_modification (e.g., redeclare): no space around = but allow line break
          parts.push(formatAssignmentRhsCompact(rhsParts, inChoices));
        } else {
          // Top-level short class definition: space around = with line break support
          parts.push(formatAssignmentRhs(rhsParts));
        }
      }

      // Add trailing parts (description, annotation) after RHS
      parts.push(...trailingParts);

      return group(parts);
    }

    case "derivative_class_specifier":
    case "extends_class_specifier":
      return printChildrenWithSpaces(path, print);

    case "enumeration_class_specifier": {
      // Format: IDENT = enumeration(enum_list) [description_string] [annotation_clause]
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          parts.push(child.text ?? "");
          parts.push(" = enumeration(");
        } else if (child.type === "enum_list") {
          // Indent the enum list and put closing paren after
          parts.push(indent([softline, path.call(print, "children", i)]));
          parts.push(")");
        } else if (child.type === "description_string") {
          // Description string on new line with indent
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (child.type === "annotation_clause") {
          // Annotation clause on new line with indent
          parts.push(indent([line, path.call(print, "children", i)]));
        }
      }

      return group(parts);
    }

    case "enum_list": {
      // Each enumeration literal on its own line, separated by commas
      const literals = path.map(print, "children");
      const parts: Doc[] = [];
      for (let i = 0; i < literals.length; i++) {
        if (i > 0) {
          parts.push(",", hardline);
        }
        parts.push(literals[i]);
      }
      return parts;
    }

    case "enumeration_literal": {
      // Format: IDENT [description_string]
      const parts: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          parts.push(child.text ?? "");
        } else if (child.type === "description_string") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      return parts;
    }

    case "base_prefix":
      return node.text ?? "";

    // ===========================================
    // Element lists
    // ===========================================
    case "element_list":
      return join(hardline, path.map(print, "children"));

    case "public_element_list":
      return [
        "public",
        indent([line, join(hardline, path.map(print, "children"))]),
      ];

    case "protected_element_list":
      return [
        "protected",
        indent([line, join(hardline, path.map(print, "children"))]),
      ];

    // ===========================================
    // Elements
    // ===========================================
    case "named_element": {
      // Extract prefixes (parameter, final, etc.) from node.text
      const parts: Doc[] = [];
      const prefix = extractElementPrefix(node);
      if (prefix) {
        parts.push(prefix, " ");
      }

      // Check if this named_element has a constraining_clause (for replaceable components)
      const hasConstrainingClause = node.children.some(
        (c) => c.type === "constraining_clause",
      );
      const hasDescriptionString = node.children.some(
        (c) => c.type === "description_string",
      );
      const hasAnnotationClause = node.children.some(
        (c) => c.type === "annotation_clause",
      );

      // Check if class_definition contains a short-form specifier (needs semicolon)
      // vs long_class_specifier (already ends with "end ClassName;")
      // Short-form specifiers include: short_class_specifier, enumeration_class_specifier,
      // derivative_class_specifier, extends_class_specifier
      const hasShortClassDefinition = node.children.some(
        (c) =>
          c.type === "class_definition" &&
          c.children.some(
            (cc: any) =>
              cc.type === "short_class_specifier" ||
              cc.type === "enumeration_class_specifier" ||
              cc.type === "derivative_class_specifier" ||
              cc.type === "extends_class_specifier",
          ),
      );

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "component_clause") {
          parts.push(path.call(print, "children", i));
          // Don't add semicolon here if there are more clauses to follow
          if (
            !hasConstrainingClause &&
            !hasDescriptionString &&
            !hasAnnotationClause
          ) {
            parts.push(";");
          }
        } else if (child.type === "class_definition") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "constraining_clause") {
          // constraining_clause comes after component_clause for replaceable components
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (child.type === "description_string") {
          // Description string comes after constraining_clause or component_clause
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (child.type === "annotation_clause") {
          // Annotation clause comes last
          parts.push(indent([line, path.call(print, "children", i)]));
        }
      }

      // Add semicolon at the end for:
      // 1. component_clause with constraining/description/annotation clauses
      // 2. short_class_definition (e.g., "package X = Y" or "replaceable package X = Y")
      if (
        hasConstrainingClause ||
        hasDescriptionString ||
        hasAnnotationClause
      ) {
        // Add semicolon if we have component_clause or short_class_definition
        if (
          node.children.some((c) => c.type === "component_clause") ||
          hasShortClassDefinition
        ) {
          parts.push(";");
        }
      } else if (hasShortClassDefinition) {
        // Short class definition without additional clauses still needs semicolon
        parts.push(";");
      }
      return group(parts);
    }

    case "import_clause":
      return ["import ", ...printChildrenWithSpaces(path, print), ";"];

    case "import_list":
      return join(", ", path.map(print, "children"));

    case "extends_clause": {
      const parts: Doc[] = ["extends "];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "type_specifier") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "class_modification") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "annotation_clause") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      parts.push(";");
      return group(parts);
    }

    case "constraining_clause":
      return ["constrainedby ", ...printChildrenWithSpaces(path, print)];

    // ===========================================
    // Components
    // ===========================================
    case "component_clause": {
      const parts: Doc[] = [];

      // Extract prefix keywords (parameter, constant, etc.) before type_specifier
      const prefix = extractComponentClausePrefix(node);
      if (prefix) {
        parts.push(prefix, " ");
      }

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "type_specifier") {
          parts.push(path.call(print, "children", i), " ");
        } else if (child.type === "component_list") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "array_subscripts") {
          parts.push(path.call(print, "children", i), " ");
        }
      }
      // Don't add semicolon here - it's added by named_element or left off for redeclarations
      return parts;
    }

    case "component_list":
      return join([",", line], path.map(print, "children"));

    case "component_declaration": {
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "declaration") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "condition_attribute") {
          parts.push(" ", path.call(print, "children", i));
        } else if (
          child.type === "expression" ||
          child.type === "simple_expression"
        ) {
          // Conditional clause: "if <expression>"
          // Always allow line break before 'if' - Prettier decides based on line length
          parts.push(indent([line, "if ", path.call(print, "children", i)]));
        } else if (child.type === "description_string") {
          // Break line before description string (use shared helper)
          parts.push(
            formatTrailingDescription(
              path.call(print, "children", i),
              isInsideChoicesAnnotation(path),
            ),
          );
        } else if (child.type === "annotation_clause") {
          // Break line before annotation (use shared helper)
          parts.push(
            formatTrailingDescription(path.call(print, "children", i)),
          );
        } else if (child.type === "comment") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      return group(parts);
    }

    case "condition_attribute": {
      const parts: Doc[] = ["if "];
      for (let i = 0; i < node.children.length; i++) {
        parts.push(path.call(print, "children", i));
      }
      return parts;
    }

    case "declaration": {
      const parts: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          parts.push(child.text ?? "");
        } else if (child.type === "array_subscripts") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "modification") {
          parts.push(path.call(print, "children", i));
        }
      }
      return parts;
    }

    // ===========================================
    // Modifications
    // ===========================================
    case "modification": {
      const parts: Doc[] = [];
      // Check if parent is a declaration (top-level assignment) vs element_modification (attribute binding)
      // Top-level assignments get spaces around =, attribute bindings don't
      const parent = path.getParentNode();
      const isTopLevelAssignment = parent?.type === "declaration";

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "class_modification") {
          parts.push(path.call(print, "children", i));
        } else if (
          child.type === "expression" ||
          child.type === "simple_expression"
        ) {
          if (isTopLevelAssignment) {
            // For top-level assignments: use shared helper for consistent formatting
            // with short_class_specifier
            parts.push(formatAssignmentRhs(path.call(print, "children", i)));
          } else {
            // For attribute bindings: no space around =
            // Don't add indent here - function calls and other expressions handle their own indentation
            parts.push("=", path.call(print, "children", i));
          }
        }
      }
      return parts;
    }

    case "class_modification": {
      // Format arguments on multiple lines if complex
      if (node.children.length === 0) {
        return "()";
      }

      const inAnnotation = isInsideAnnotation(path);

      if (inAnnotation) {
        const parent = path.getParentNode();
        const isTopLevelAnnotation = parent?.type === "annotation_clause";

        if (isTopLevelAnnotation) {
          // Top-level annotation: first arg on same line, rest on new lines indented
          // Format: annotation(first,
          //   second,
          //   third)
          // Closing paren stays on same line as last element
          // We need to get the actual element_modification children from the argument_list
          const argListNode = node.children.find(
            (c) => c.type === "argument_list",
          );
          if (!argListNode || argListNode.children.length === 0) {
            return "()";
          }

          // Find the index of argument_list to use path.call properly
          const argListIndex = node.children.findIndex(
            (c) => c.type === "argument_list",
          );

          // Get individual element arguments by mapping over argument_list's children
          const elementArgs: Doc[] = [];
          for (let i = 0; i < argListNode.children.length; i++) {
            elementArgs.push(
              path.call(print, "children", argListIndex, "children", i),
            );
          }

          if (elementArgs.length === 1) {
            // Single arg: keep on same line, but content can break internally
            return group(["(", elementArgs[0], ")"]);
          }

          // Multiple args: first inline, rest indented on new lines
          // Use hardline to force breaks between top-level elements
          // Closing paren on same line as last element
          return [
            "(",
            elementArgs[0],
            ",",
            indent([
              hardline,
              join([",", hardline], elementArgs.slice(1)),
              ")",
            ]),
          ];
        } else {
          // Nested annotations - check context for formatting
          // Check if this is the choices() level - each choice on its own line with hardline
          if (isChoicesLevel(path)) {
            const argListNode = node.children.find(
              (c) => c.type === "argument_list",
            );
            if (!argListNode || argListNode.children.length === 0) {
              return "()";
            }
            const argListIndex = node.children.findIndex(
              (c) => c.type === "argument_list",
            );
            const elementArgs: Doc[] = [];
            for (let i = 0; i < argListNode.children.length; i++) {
              elementArgs.push(
                path.call(print, "children", argListIndex, "children", i),
              );
            }
            // All choices on new lines for readability
            return group([
              "(",
              indent([hardline, join([",", hardline], elementArgs)]),
              ")",
            ]);
          }

          // Check if inside choices (e.g., choice() content)
          // Don't break after '(' - only allow breaking within content
          if (isInsideChoicesAnnotation(path)) {
            const argListNode = node.children.find(
              (c) => c.type === "argument_list",
            );
            if (!argListNode || argListNode.children.length === 0) {
              return "()";
            }
            const argListIndex = node.children.findIndex(
              (c) => c.type === "argument_list",
            );
            const elementArgs: Doc[] = [];
            for (let i = 0; i < argListNode.children.length; i++) {
              elementArgs.push(
                path.call(print, "children", argListIndex, "children", i),
              );
            }
            // Keep '(' attached to content, only break within content or between args
            return group(["(", indent(join([",", line], elementArgs)), ")"]);
          }

          // For nested class_modifications in annotations (like Icon(...), Placement(...)),
          // use the same "first inline, rest on new lines" pattern
          // Closing paren stays on same line as last element
          const argListNode = node.children.find(
            (c) => c.type === "argument_list",
          );
          if (argListNode && argListNode.children.length > 0) {
            const argListIndex = node.children.findIndex(
              (c) => c.type === "argument_list",
            );
            const elementArgs: Doc[] = [];
            for (let i = 0; i < argListNode.children.length; i++) {
              elementArgs.push(
                path.call(print, "children", argListIndex, "children", i),
              );
            }
            if (elementArgs.length === 1) {
              // Try inline first, break only if doesn't fit
              return conditionalGroup([
                ["(", elementArgs[0], ")"],
                ["(", indent([softline, elementArgs[0], ")"])],
              ]);
            }
            // Multiple args: try first inline, break only if doesn't fit
            const inlineFirst = [
              "(",
              elementArgs[0],
              ",",
              indent([
                hardline,
                join([",", hardline], elementArgs.slice(1)),
                ")",
              ]),
            ];
            const breakFirst = [
              "(",
              indent([
                softline,
                elementArgs[0],
                ",",
                hardline,
                join([",", hardline], elementArgs.slice(1)),
                ")",
              ]),
            ];
            return conditionalGroup([inlineFirst, breakFirst]);
          }

          const args = path.map(print, "children");
          if (args.length === 0) {
            return "()";
          }
          if (args.length === 1) {
            return group(["(", args[0], ")"]);
          }
          // Fallback for nested class modifications
          // Closing paren stays on same line as last element
          return group(["(", indent([softline, join([",", line], args), ")"])]);
        }
      }

      // Normal formatting with line breaks
      // Closing paren stays on same line as last element
      const args = path.map(print, "children");
      return group(["(", indent([softline, join([",", line], args), ")"])]);
    }

    case "argument_list": {
      const inAnnotation = isInsideAnnotation(path);
      if (inAnnotation) {
        const args = path.map(print, "children");

        // Check if we're inside choices - each choice on its own line
        if (isInsideChoicesAnnotation(path)) {
          return join([",", line], args);
        }

        // Check if inside a graphical primitive - parameters one per line
        if (isInsideGraphicalPrimitive(path)) {
          return join([",", line], args);
        }

        // Check if this is the top-level argument_list inside an annotation's class_modification
        const parent = path.getParentNode();
        const grandparent = path.getParentNode(1);
        const isTopLevelAnnotationArgs =
          parent?.type === "class_modification" &&
          grandparent?.type === "annotation_clause";

        if (isTopLevelAnnotationArgs) {
          // Top-level annotation elements: each on its own line
          return join([",", line], args);
        }

        // Default: use fill to pack arguments
        const fillItems: Doc[] = [];
        for (let i = 0; i < args.length; i++) {
          if (i > 0) {
            fillItems.push([",", line]);
          }
          fillItems.push(args[i]);
        }
        return fill(fillItems);
      }
      return join([",", line], path.map(print, "children"));
    }

    case "element_modification": {
      const parts: Doc[] = [];
      // Check for 'each' and 'final' prefixes
      const prefix = extractModificationPrefix(node);
      if (prefix) {
        parts.push(prefix, " ");
      }

      // Check if this is a choice=Value "description" element inside choices annotation
      const nameChild = node.children.find((c) => c.type === "name");
      const hasDescriptionString = node.children.some(
        (c) => c.type === "description_string",
      );
      const isChoiceAssignment =
        nameChild?.text === "choice" &&
        node.children.some((c) => c.type === "modification") &&
        hasDescriptionString &&
        isInsideChoicesAnnotation(path);

      if (isChoiceAssignment) {
        // Format choice=Value "description" with line breaking support
        // Don't break after =, only allow breaking between value and description
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (child.type === "each") {
            // Handle 'each' keyword
            parts.push(path.call(print, "children", i), " ");
          } else if (child.type === "final") {
            // Handle 'final' keyword
            parts.push(path.call(print, "children", i), " ");
          } else if (child.type === "name") {
            parts.push(path.call(print, "children", i));
          } else if (child.type === "modification") {
            parts.push(path.call(print, "children", i));
          } else if (child.type === "description_string") {
            // Allow breaking before description string with indent
            parts.push(indent([line, path.call(print, "children", i)]));
          }
        }
        // Wrap in group so it can break between value and description if needed
        return group(parts);
      }

      const inAnnotation = isInsideAnnotation(path);

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "each") {
          // Handle 'each' keyword
          parts.push(path.call(print, "children", i), " ");
        } else if (child.type === "final") {
          // Handle 'final' keyword
          parts.push(path.call(print, "children", i), " ");
        } else if (child.type === "name") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "modification") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "description_string") {
          // In annotations, break description_string to new line with extra indent
          if (inAnnotation) {
            parts.push(" ", indent([line, path.call(print, "children", i)]));
          } else {
            parts.push(" ", path.call(print, "children", i));
          }
        }
      }
      return inAnnotation ? group(parts) : parts;
    }

    case "element_replaceable":
      return printChildrenWithSpaces(path, print);

    case "class_redeclaration": {
      // Extract 'redeclare' and optionally 'final', 'each' from node.text
      const prefix = extractRedeclarePrefix(node);
      const parts: Doc[] = [prefix, " "];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (
          child.type === "short_class_definition" ||
          child.type === "class_definition"
        ) {
          parts.push(path.call(print, "children", i));
        }
      }
      return parts;
    }

    case "component_redeclaration": {
      const prefix = extractRedeclarePrefix(node);
      const parts: Doc[] = [prefix, " "];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "component_clause") {
          parts.push(path.call(print, "children", i));
        }
      }
      return parts;
    }

    case "short_class_definition": {
      const parts: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "class_prefixes") {
          parts.push(path.call(print, "children", i), " ");
        } else if (child.type === "short_class_specifier") {
          parts.push(path.call(print, "children", i));
        }
      }
      return parts;
    }

    // ===========================================
    // Equations
    // ===========================================
    case "equation_section": {
      const parts: Doc[] = [];
      // Check if this is an initial equation section by looking at the node text
      const isInitial = (node.text ?? "").trimStart().startsWith("initial");
      const content: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "equation_list") {
          content.push(path.call(print, "children", i));
        } else if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
          // Comments before the equation list - add them in order
          content.push(path.call(print, "children", i));
        }
      }

      parts.push(isInitial ? "initial equation" : "equation");
      if (content.length > 0) {
        parts.push(indent([line, join(hardline, content)]));
      }
      return parts;
    }

    case "equation_list":
      return join(hardline, path.map(print, "children"));

    case "simple_equation": {
      // Handle equation with two expressions and = between them
      const exprChildren = node.children.filter(
        (c) => c.type === "simple_expression" || c.type === "expression",
      );

      if (exprChildren.length === 2) {
        const result: Doc[] = [];
        let firstExprDone = false;
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (
            (child.type === "simple_expression" ||
              child.type === "expression") &&
            !firstExprDone
          ) {
            result.push(path.call(print, "children", i), " = ");
            firstExprDone = true;
          } else if (
            child.type === "simple_expression" ||
            child.type === "expression"
          ) {
            result.push(path.call(print, "children", i));
          } else if (child.type === "comment") {
            result.push(" ", path.call(print, "children", i));
          }
        }
        result.push(";");
        return group(result);
      }

      // Fallback for single expression equations
      const parts: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "simple_expression" || child.type === "expression") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "comment") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      parts.push(";");
      return group(parts);
    }

    case "connect_clause": {
      const parts: Doc[] = ["connect("];
      const args: Doc[] = [];
      let hasAnnotation = false;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "component_reference") {
          args.push(path.call(print, "children", i));
        } else if (child.type === "annotation_clause") {
          hasAnnotation = true;
          parts.push(join(", ", args), ")");
          // Annotation should be indented relative to connect keyword
          parts.push(indent([hardline, path.call(print, "children", i)]));
          parts.push(";");
        }
      }

      if (!hasAnnotation) {
        parts.push(join(", ", args), ");");
      }
      return parts;
    }

    case "for_equation":
    case "for_statement": {
      const parts: Doc[] = ["for "];
      const body: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "for_indices") {
          parts.push(path.call(print, "children", i), " loop");
        } else if (
          child.type === "equation_list" ||
          child.type === "statement_list"
        ) {
          body.push(path.call(print, "children", i));
        }
      }

      parts.push(indent([line, ...body]));
      parts.push(hardline, "end for;");
      return group(parts);
    }

    case "for_indices":
      return join(", ", path.map(print, "children"));

    case "for_index": {
      const parts: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          parts.push(child.text ?? "");
        } else if (
          child.type === "expression" ||
          child.type === "simple_expression"
        ) {
          parts.push(" in ", path.call(print, "children", i));
        }
      }
      return parts;
    }

    case "if_equation":
    case "if_statement": {
      const parts: Doc[] = [];
      let statementListCount = 0;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "expression") {
          // Condition expression - inner constructs (binary_expression, etc.)
          // handle their own indentation for continuations
          const condExpr = path.call(print, "children", i);
          // Structure: "if " + condition on same line,
          // "then" either on same line (if fits) or new line (at if's level)
          parts.push(group(["if ", condExpr, line, "then"]));
        } else if (
          child.type === "equation_list" ||
          child.type === "statement_list"
        ) {
          statementListCount++;
          if (statementListCount === 1) {
            // First statement_list is the then branch
            parts.push(indent([line, path.call(print, "children", i)]));
          } else {
            // Second statement_list is the else branch (no elseif in between)
            parts.push(hardline, "else");
            parts.push(indent([line, path.call(print, "children", i)]));
          }
        } else if (
          child.type === "else_if_equation_clause_list" ||
          child.type === "else_if_statement_clause_list"
        ) {
          parts.push(hardline, path.call(print, "children", i));
        } else if (child.type === "else_clause") {
          // Handle else_clause node which contains the else branch
          parts.push(hardline, path.call(print, "children", i));
        }
      }

      parts.push(hardline, "end if;");
      return group(parts);
    }

    case "else_if_equation_clause_list":
    case "else_if_statement_clause_list":
      return join(hardline, path.map(print, "children"));

    case "else_if_equation_clause":
    case "else_if_statement_clause": {
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "expression") {
          // Same pattern as if_statement for condition + then
          const condExpr = path.call(print, "children", i);
          parts.push(group(["elseif ", indent(condExpr), line, "then"]));
        } else if (
          child.type === "equation_list" ||
          child.type === "statement_list"
        ) {
          parts.push(indent([line, path.call(print, "children", i)]));
        }
      }
      return parts;
    }

    case "when_equation":
    case "when_statement": {
      const parts: Doc[] = ["when "];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "expression") {
          parts.push(path.call(print, "children", i), " then");
        } else if (
          child.type === "equation_list" ||
          child.type === "statement_list"
        ) {
          parts.push(indent([line, path.call(print, "children", i)]));
        } else if (
          child.type === "else_when_equation_clause_list" ||
          child.type === "else_when_statement_clause_list"
        ) {
          parts.push(hardline, path.call(print, "children", i));
        }
      }

      parts.push(hardline, "end when;");
      return group(parts);
    }

    case "else_when_equation_clause_list":
    case "else_when_statement_clause_list":
      return join(hardline, path.map(print, "children"));

    case "else_when_equation_clause":
    case "else_when_statement_clause": {
      const parts: Doc[] = ["elsewhen "];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "expression") {
          parts.push(path.call(print, "children", i), " then");
        } else if (
          child.type === "equation_list" ||
          child.type === "statement_list"
        ) {
          parts.push(indent([line, path.call(print, "children", i)]));
        }
      }
      return parts;
    }

    case "function_application_equation":
    case "function_application_statement":
      return [...printChildren(path, print), ";"];

    // ===========================================
    // Algorithms / Statements
    // ===========================================
    case "algorithm_section": {
      const parts: Doc[] = [];
      // Check if this is an initial algorithm section by looking at the node text
      const isInitial = (node.text ?? "").trimStart().startsWith("initial");
      const content: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "statement_list") {
          content.push(path.call(print, "children", i));
        } else if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
          content.push(path.call(print, "children", i));
        }
      }

      parts.push(isInitial ? "initial algorithm" : "algorithm");
      if (content.length > 0) {
        parts.push(indent([line, join(hardline, content)]));
      }
      return parts;
    }

    case "statement_list":
      return join(hardline, path.map(print, "children"));

    case "assignment_statement": {
      const parts: Doc[] = [];
      let hasRef = false;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "component_reference") {
          parts.push(path.call(print, "children", i));
          hasRef = true;
        } else if (
          child.type === "expression" ||
          child.type === "simple_expression"
        ) {
          if (hasRef) {
            parts.push(" := ");
          }
          parts.push(path.call(print, "children", i));
        } else if (child.type === "comment") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      parts.push(";");
      return group(parts);
    }

    case "break_statement":
      return "break;";

    case "return_statement":
      return "return;";

    case "while_statement": {
      const parts: Doc[] = ["while "];
      const body: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "expression") {
          parts.push(path.call(print, "children", i), " loop");
        } else if (child.type === "statement_list") {
          body.push(path.call(print, "children", i));
        }
      }

      parts.push(indent([line, ...body]));
      parts.push(hardline, "end while;");
      return group(parts);
    }

    case "multiple_output_function_application_statement": {
      const parts: Doc[] = ["("];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "output_expression_list") {
          parts.push(path.call(print, "children", i));
        } else if (
          child.type === "component_reference" ||
          child.type === "function_application"
        ) {
          parts.push(") := ", path.call(print, "children", i));
        }
      }

      parts.push(";");
      return parts;
    }

    // ===========================================
    // Expressions
    // ===========================================
    case "expression":
      return printChildren(path, print);

    case "if_expression": {
      const children = node.children;
      let childIdx = 0;

      // Use centralized continuation context detection
      const inContinuation = isInContinuationContext(path);
      const midLine = isMidLineIfExpression(path);
      // Check if we're nested inside another if_expression's then/else value
      // In that case, we need to indent our then/else clauses
      const nestedInIfValue = isInsideIfExpressionValue(path);

      // Collect all parts for proper grouping and line breaking
      const conditionParts: Doc[] = [];
      let thenExprDoc: Doc = "";
      let elseExprDoc: Doc = "";
      const elseIfParts: Doc[] = [];

      // First child is condition
      if (children[childIdx]) {
        conditionParts.push(path.call(print, "children", childIdx));
        childIdx++;
      }

      // Then expression (after 'then')
      if (children[childIdx] && children[childIdx].type !== "else_if_clause") {
        thenExprDoc = path.call(print, "children", childIdx);
        childIdx++;
      }

      // Handle elseif clauses and else expression
      while (childIdx < children.length) {
        const child = children[childIdx];
        if (child.type === "else_if_clause") {
          // elseif should be at same level as if/then/else
          // Use line (not softline) to ensure space before elseif when group doesn't break
          elseIfParts.push(line, path.call(print, "children", childIdx));
        } else {
          // else expression
          elseExprDoc = path.call(print, "children", childIdx);
        }
        childIdx++;
      }

      // Try to keep then-else together on one line using conditionalGroup
      // Option 1: Everything inline
      // Option 2: Break with proper indentation (then/else at same level as if)

      if (inContinuation) {
        return group([
          "if ",
          ...conditionParts,
          line,
          group([
            "then ",
            indent(thenExprDoc),
            ...elseIfParts,
            line,
            "else ",
            indent(elseExprDoc),
          ]),
        ]);
      }

      if (midLine || nestedInIfValue) {
        // When mid-line (e.g., `x = if ...`) or nested inside another if's then/else,
        // we need to indent the then/else clauses relative to the `if` keyword
        return group([
          "if ",
          ...conditionParts,
          indent([
            line,
            group([
              "then ",
              indent(thenExprDoc),
              ...elseIfParts,
              line,
              "else ",
              indent(elseExprDoc),
            ]),
          ]),
        ]);
      }

      // Top-level RHS
      return group([
        "if ",
        ...conditionParts,
        line,
        group([
          "then ",
          indent(thenExprDoc),
          ...elseIfParts,
          line,
          "else ",
          indent(elseExprDoc),
        ]),
      ]);
    }

    case "else_if_clause": {
      const conditionParts: Doc[] = [];
      let thenExprDoc: Doc = "";
      let seenCondition = false;

      for (let i = 0; i < node.children.length; i++) {
        if (!seenCondition) {
          conditionParts.push(path.call(print, "children", i));
          seenCondition = true;
        } else {
          thenExprDoc = path.call(print, "children", i);
        }
      }

      // Return just "elseif COND" as a group, then add "then VALUE" separately
      // This matches the if_expression structure where "then" is outside the condition group
      return [
        group(["elseif ", ...conditionParts]),
        line,
        "then ",
        thenExprDoc,
      ];
    }

    case "simple_expression":
      return printChildren(path, print);

    case "range_expression":
      return join(":", path.map(print, "children"));

    case "binary_expression": {
      // Extract operator from the gap between children in source text
      if (node.children.length === 2) {
        const leftChild = node.children[0];
        const rightChild = node.children[1];
        const operator = extractOperator(
          node.text ?? "",
          leftChild,
          rightChild,
        );

        // Logical operators (and/or) - flatten SAME operator only
        // to avoid cascading indentation in conditions like:
        //   if a and b and c
        // Should become:
        //   if a and
        //     b and
        //     c
        // Not:
        //   if a and
        //     b and
        //       c
        // Note: 'and' and 'or' have different precedence, so we only
        // flatten the same operator (and with and, or with or)
        if (operator === "and" || operator === "or") {
          // Flatten same operator only
          const operands: Doc[] = [];
          const ops: string[] = [];

          const flattenLogical = (p: AstPath<ASTNode>): void => {
            const n = p.getValue();

            // Check if this is a binary_expression with the SAME logical operator
            if (n.type === "binary_expression" && n.children?.length === 2) {
              const op = extractOperator(
                n.text ?? "",
                n.children[0],
                n.children[1],
              );
              if (op === operator) {
                p.call(flattenLogical, "children", 0);
                ops.push(op);
                p.call(flattenLogical, "children", 1);
                return;
              }
            }
            // Also handle simple_expression wrapper
            if (n.type === "simple_expression" && n.children?.length === 1) {
              const child = n.children[0];
              if (
                child.type === "binary_expression" &&
                child.children?.length === 2
              ) {
                const op = extractOperator(
                  child.text ?? "",
                  child.children[0],
                  child.children[1],
                );
                if (op === operator) {
                  p.call(
                    (innerPath) => {
                      innerPath.call(flattenLogical, "children", 0);
                      ops.push(op);
                      innerPath.call(flattenLogical, "children", 1);
                    },
                    "children",
                    0,
                  );
                  return;
                }
              }
            }
            // Base case - not same operator, print normally
            operands.push(print(p));
          };

          flattenLogical(path);

          if (ops.length === 0) {
            return operands[0];
          }

          // Build flat structure with all continuations sharing the same indent level.
          // All continuation lines after the first operand are wrapped in a single
          // indent block to ensure they all align at the same level, avoiding
          // cascading indents or dedenting back to baseline.
          const inContinuation = isInContinuationContext(path);

          if (inContinuation) {
            // Already in continuation context - no additional indent
            // Each continuation uses group([line, ...]) to allow independent breaking
            const parts: Doc[] = [operands[0]];
            for (let i = 0; i < ops.length; i++) {
              parts.push(" ", ops[i], group([line, operands[i + 1]]));
            }
            return group(parts);
          } else {
            // Not in continuation context - wrap ALL continuations in shared indent block
            // This ensures all continuation lines align at the same indent level
            const continuationParts: Doc[] = [];
            for (let i = 0; i < ops.length; i++) {
              continuationParts.push(line, ops[i], " ", operands[i + 1]);
            }
            return group([operands[0], indent(continuationParts)]);
          }
        }

        // Arithmetic operators: allow breaking after operator when line is too long
        // Includes additive (+, -) and multiplicative (*, /) operators
        // Exponent (^) is excluded as x^2 should stay together
        const additiveOperators = ["+", "-", ".+", ".-"];
        const multiplicativeOperators = ["*", "/", ".*", "./"];
        const arithmeticOperators = [
          ...additiveOperators,
          ...multiplicativeOperators,
        ];

        if (arithmeticOperators.includes(operator)) {
          // Flatten same-precedence arithmetic operators into a single structure.
          // This avoids nested groups that cause cascading indentation.
          const operands: Doc[] = [];
          const operandNodes: ASTNode[] = []; // Track AST nodes for type checking
          const ops: string[] = [];

          // Helper to unwrap simple_expression to find binary_expression
          const unwrapToBinary = (n: ASTNode): ASTNode | null => {
            if (n.type === "binary_expression") return n;
            if (n.type === "simple_expression" && n.children?.length === 1) {
              return unwrapToBinary(n.children[0]);
            }
            return null;
          };

          // Helper to unwrap expression wrappers to find the core node type
          const unwrapToCore = (n: ASTNode): ASTNode => {
            if (
              (n.type === "simple_expression" ||
                n.type === "primary_expression" ||
                n.type === "expression") &&
              n.children?.length === 1
            ) {
              return unwrapToCore(n.children[0]);
            }
            return n;
          };

          // Recursive flatten - collects all operands and operators
          const flatten = (p: AstPath<ASTNode>): void => {
            const n = p.getValue();

            // Check if this is a binary_expression (directly or wrapped in simple_expression)
            const binaryNode = unwrapToBinary(n);
            if (binaryNode && binaryNode.children?.length === 2) {
              const op = extractOperator(
                binaryNode.text ?? "",
                binaryNode.children[0],
                binaryNode.children[1],
              );
              if (arithmeticOperators.includes(op)) {
                // Need to navigate to the actual binary_expression in the path
                if (
                  n.type === "simple_expression" &&
                  n.children?.length === 1
                ) {
                  // Recurse through the simple_expression wrapper
                  p.call(
                    (innerPath) => {
                      const innerNode = innerPath.getValue();
                      if (innerNode.type === "binary_expression") {
                        // Now recurse into left and right children
                        innerPath.call(flatten, "children", 0);
                        ops.push(op);
                        innerPath.call(flatten, "children", 1);
                      } else {
                        flatten(innerPath);
                      }
                    },
                    "children",
                    0,
                  );
                  return;
                } else if (n.type === "binary_expression") {
                  // Direct binary_expression
                  p.call(flatten, "children", 0);
                  ops.push(op);
                  p.call(flatten, "children", 1);
                  return;
                }
              }
            }
            // Base case - not an arithmetic binary_expression, print normally
            operands.push(print(p));
            operandNodes.push(unwrapToCore(n));
          };

          flatten(path);

          // Build the expression using FLAT sibling groups (not nested).
          // Similar to Prettier JS's binary expression handling, each
          // operator+operand pair is an independent group that decides
          // whether to break based on remaining space on the current line.
          //
          // Structure: [op0, ' +', group([line, op1]), ' +', group([line, op2])]
          //
          // Key insight: sibling groups are evaluated INDEPENDENTLY.
          // After a multi-line operand finishes, the next group checks if
          // its content fits on the REMAINING space of the current line.
          // This allows ")) + C" to stay on one line when there's room.
          //
          // Example: For "A + B + C" where B is multi-line:
          //   A + complex_expr *
          //     ((if x then 1 else 0) +
          //       (if y then 1 else 0)) + C
          // The " + C" fits on the last line of the parenthesized expression.

          if (ops.length === 0) {
            return operands[0];
          }

          // Build flat structure: first operand, then all continuation operands
          // All continuations in the same flattened chain share the same indent level.
          // We wrap ALL continuation parts in a shared indent block (when not already
          // in continuation context) so that breaking any line in the chain results
          // in consistent indentation for all continuation lines.
          const inContinuation = isInContinuationContext(path);

          // Helper to check if an operand is "huggable" - should stay inline with operator
          // when possible, allowing internal breaks before breaking before the operand
          const isHuggable = (n: ASTNode): boolean => {
            return (
              n.type === "function_application" ||
              n.type === "parenthesized_expression" ||
              n.type === "array_constructor"
            );
          };

          // Build the continuation parts (everything after first operand)
          // We need to handle huggable vs non-huggable operands differently:
          // - Huggable operands (function calls, parens, arrays) handle their own indentation
          // - Non-huggable operands need outer indent wrapper
          const parts: Doc[] = [operands[0]];

          for (let i = 0; i < ops.length; i++) {
            const operand = operands[i + 1];
            const operandNode = operandNodes[i + 1];

            if (operandNode && isHuggable(operandNode)) {
              // For huggable operands (function calls, parens, arrays), use conditionalGroup
              // to try multiple layouts in order:
              // 1. All inline - operand fits without any breaks
              // 2. Operator inline, operand breaks internally (e.g., "* min(\n  args)")
              // 3. Break before operand (fallback)
              // For option 3: add indent if not already in continuation context
              const option3: Doc = inContinuation
                ? [" ", ops[i], group([line, operand])]
                : [" ", ops[i], indent(group([line, operand]))];
              // For option 2: parenthesized_expression needs indent wrapper since shouldBreak
              // alone doesn't trigger the paren's internal indent (no line breaks inside simple content)
              // EXCEPT when the paren contains an if_expression AND is nested inside another if's then/else value,
              // which would cause double indentation
              const option2Operand =
                operandNode.type === "parenthesized_expression" &&
                !(
                  parenContainsIfExpression(operandNode) &&
                  isInsideIfExpressionValue(path)
                )
                  ? indent(group(operand, { shouldBreak: true }))
                  : group(operand, { shouldBreak: true });
              parts.push(
                conditionalGroup([
                  // Option 1: all inline
                  [" ", ops[i], " ", operand],
                  // Option 2: operator inline, operand breaks internally
                  [" ", ops[i], " ", option2Operand],
                  // Option 3: break before operand
                  option3,
                ]),
              );
            } else {
              // Non-huggable operands: use group with line to allow breaking before
              // Apply indent for continuation
              if (inContinuation) {
                parts.push(" ", ops[i], group([line, operand]));
              } else {
                parts.push(" ", ops[i], indent(group([line, operand])));
              }
            }
          }

          return group(parts);
        }

        // Comparison operators: allow breaking with proper continuation indentation
        // Use wrapContinuation to add indent when not already in continuation context
        const comparisonOperators = ["==", "<>", "<", ">", "<=", ">="];
        if (comparisonOperators.includes(operator)) {
          return group([
            path.call(print, "children", 0),
            " ",
            operator,
            wrapContinuation(path.call(print, "children", 1), path),
          ]);
        }

        // Other short expressions: allow breaking with proper indentation
        // Use group with line so parent indent (e.g., from parenthesized_expression) can apply
        return group([
          path.call(print, "children", 0),
          " ",
          operator,
          group([line, path.call(print, "children", 1)]),
        ]);
      }

      // Fallback
      return printChildrenWithSpaces(path, print);
    }

    case "unary_expression": {
      // Check for operator at start of text
      const text = node.text ?? "";
      const parts: Doc[] = [];

      if (text.startsWith("not ")) {
        parts.push("not ");
      } else if (text.startsWith(".-")) {
        parts.push(".-");
      } else if (text.startsWith(".+")) {
        parts.push(".+");
      } else if (text.startsWith("-")) {
        parts.push("-");
      } else if (text.startsWith("+")) {
        parts.push("+");
      }

      for (let i = 0; i < node.children.length; i++) {
        parts.push(path.call(print, "children", i));
      }
      return parts;
    }

    case "primary_expression":
      return printChildren(path, print);

    case "end_expression":
      return "end";

    case "literal_expression":
    case "string_literal_expression":
    case "unsigned_integer_literal_expression":
    case "unsigned_real_literal_expression":
      if (node.children.length === 0) {
        return node.text ?? "";
      }
      return printChildren(path, print);

    case "logical_literal_expression":
      return node.text ?? "";

    case "parenthesized_expression": {
      // Wrap in parens - content starts on same line as '('
      // Don't add indent here - inner constructs (binary_expression, function_call_args)
      // handle their own indentation. This avoids double indent issues.
      const content = path.map(print, "children");
      return group(["(", content, ")"]);
    }

    case "output_expression_list":
      return join(", ", path.map(print, "children"));

    case "expression_list":
      return join(", ", path.map(print, "children"));

    // ===========================================
    // Arrays
    // ===========================================
    case "array_constructor": {
      const args = path.map(print, "children");
      const inAnnotation = isInsideAnnotation(path);

      if (inAnnotation) {
        // Check if this is a coordinate/numerical array - keep compact
        if (isCoordinateArray(node)) {
          // Compact format: {1,2,3} or {{1,2},{3,4}}
          return ["{", join(",", args), "}"];
        }

        // Check if this is a graphics array
        if (isGraphicsArray(path)) {
          // Graphics array: first primitive on same line, rest on new lines
          if (args.length === 0) return "{}";
          if (args.length === 1) return ["{", args[0], "}"];

          // First primitive on same line as {, rest on new lines
          return [
            "{",
            args[0],
            ",",
            indent([hardline, join([",", hardline], args.slice(1))]),
            "}",
          ];
        }

        // Check if array contains graphical primitives
        const hasGraphicalPrimitives = node.children.some((child) => {
          if (child.type === "function_application")
            return isGraphicalPrimitive(child);
          // Check through expression wrappers
          if (child.type.includes("expression")) {
            const funcApp = child.children?.find(
              (c) => c.type === "function_application",
            );
            if (funcApp) return isGraphicalPrimitive(funcApp);
          }
          return false;
        });

        if (hasGraphicalPrimitives) {
          // Array of graphical primitives - first on same line, rest on new lines
          if (args.length === 0) return "{}";
          if (args.length === 1) return ["{", args[0], "}"];
          return [
            "{",
            args[0],
            ",",
            indent([hardline, join([",", hardline], args.slice(1))]),
            "}",
          ];
        }

        // Default for other arrays in annotations
        if (args.length === 0) return "{}";
        return group(["{", join([",", line], args), "}"]);
      }

      // Non-annotation arrays: delegate to array_arguments which handles breaking
      if (args.length === 0) return "{}";

      // args[0] is the formatted array_arguments - wrap with braces
      // array_arguments handles its own indentation for continuation elements
      return group(["{", args[0], "}"]);
    }

    case "array_arguments": {
      const args = path.map(print, "children");
      const inAnnotation = isInsideAnnotation(path);

      if (inAnnotation) {
        // Check if this is coordinate data
        if (isCoordinateArray(node)) {
          return join(",", args);
        }

        // Check if this is inside a graphics array
        if (isGraphicsArray(path)) {
          // Graphics array elements: use hardline to force each primitive on its own line
          return join([",", hardline], args);
        }

        // Check if array contains graphical primitives
        const hasGraphicalPrimitives = node.children.some((child) => {
          if (child.type === "function_application")
            return isGraphicalPrimitive(child);
          if (child.type.includes("expression")) {
            const funcApp = child.children?.find(
              (c) => c.type === "function_application",
            );
            if (funcApp) return isGraphicalPrimitive(funcApp);
          }
          return false;
        });

        if (hasGraphicalPrimitives) {
          // Use hardline to force breaks between graphical primitives
          return join([",", hardline], args);
        }

        // Default: comma-separated without spaces for compact arrays
        return join(",", args);
      }
      // Non-annotation: first element hugs opener, subsequent elements break with continuation indent
      // Pattern: {elem1,\n  elem2,\n  elem3}
      if (args.length === 0) return "";
      if (args.length === 1) return args[0];

      // First element inline, rest can break with continuation indent
      const continuationParts: Doc[] = [];
      for (let i = 1; i < args.length; i++) {
        continuationParts.push(",", group([line, args[i]]));
      }
      return [args[0], indent(continuationParts)];
    }

    case "array_concatenation": {
      const rows = path.map(print, "children");
      const inAnnotation = isInsideAnnotation(path);

      if (inAnnotation) {
        // In annotations, prefer compact formatting
        return group(["[", join("; ", rows), "]"]);
      }

      return group([
        "[",
        indent([softline, join([";", line], rows)]),
        softline,
        "]",
      ]);
    }

    case "array_comprehension": {
      const parts: Doc[] = ["{"];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "for_indices") {
          parts.push(" for ", path.call(print, "children", i));
        } else {
          parts.push(path.call(print, "children", i));
        }
      }

      parts.push("}");
      return parts;
    }

    case "array_subscripts":
      return ["[", join(", ", path.map(print, "children")), "]"];

    case "subscript":
      // Could be ':' or an expression
      if (node.text === ":") {
        return ":";
      }
      return printChildren(path, print);

    // ===========================================
    // Function calls
    // ===========================================
    case "function_application": {
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "component_reference" || child.type === "name") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "function_call_args") {
          parts.push(path.call(print, "children", i));
        }
      }
      return parts;
    }

    case "function_call_args": {
      if (node.children.length === 0) {
        return "()";
      }
      const args = path.map(print, "children");
      const inAnnotation = isInsideAnnotation(path);

      if (inAnnotation) {
        // Get the parent to check what kind of function this is
        const parent = path.getParentNode();
        const funcName = parent ? getAnnotationElementName(parent) : null;

        // Check if this is a graphical primitive - format with line breaks for each parameter
        // First param on same line as opening paren, rest indented on new lines
        if (
          parent &&
          parent.type === "function_application" &&
          isGraphicalPrimitive(parent)
        ) {
          // function_call_args children might be named_arguments or function_arguments
          // We need to extract the actual individual arguments
          const argsChild = node.children[0];
          if (
            argsChild &&
            (argsChild.type === "named_arguments" ||
              argsChild.type === "function_arguments")
          ) {
            const individualArgs: Doc[] = [];
            for (let i = 0; i < argsChild.children.length; i++) {
              individualArgs.push(
                path.call(print, "children", 0, "children", i),
              );
            }
            if (individualArgs.length === 0) return "()";
            if (individualArgs.length === 1)
              return ["(", individualArgs[0], ")"];
            // First param on same line, rest indented on new lines
            // Closing paren on same line as last element
            return [
              "(",
              individualArgs[0],
              ",",
              indent([
                hardline,
                join([",", hardline], individualArgs.slice(1)),
                ")",
              ]),
            ];
          }
          // Fallback if structure is different
          if (args.length === 0) return "()";
          if (args.length === 1) return ["(", args[0], ")"];
          // Closing paren on same line as last element
          return [
            "(",
            args[0],
            ",",
            indent([hardline, join([",", hardline], args.slice(1)), ")"]),
          ];
        }

        // Check if this is choices() - each choice on new line
        if (funcName === "choices") {
          if (args.length === 0) return "()";
          // All choices on new lines for readability
          return group([
            "(",
            indent([hardline, join([",", hardline], args)]),
            ")",
          ]);
        }

        // Check if this is a first-level annotation attribute (Icon, Diagram, Placement, etc.)
        const isFirstLevel = isFirstLevelAnnotationAttribute(path);

        if (isFirstLevel) {
          // First-level attributes like Icon(...), Placement(...)
          // First arg on same line, rest indented on new lines
          if (args.length === 0) return "()";
          if (args.length === 1) return ["(", args[0], ")"];
          // Closing paren on same line as last element
          return [
            "(",
            args[0],
            ",",
            indent([hardline, join([",", hardline], args.slice(1)), ")"]),
          ];
        }

        // Other nested calls - try to keep compact but allow breaks
        if (args.length === 0) return "()";
        if (args.length === 1) {
          return group(["(", args[0], ")"]);
        }
        // Closing paren on same line as last element
        return group(["(", indent([softline, join([",", line], args), ")"])]);
      }

      // Extract all arguments from both function_arguments and named_arguments children
      // The structure can be: ( function_arguments , named_arguments ) or just one of them
      // This fixes the bug where named arguments were being dropped when mixed with positional args
      const allArgs: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (
          child.type === "function_arguments" ||
          child.type === "named_arguments"
        ) {
          // Get individual args from this child, filtering out commas
          for (let j = 0; j < child.children.length; j++) {
            const argChild = child.children[j];
            if (argChild.type !== "," && argChild.text !== ",") {
              allArgs.push(path.call(print, "children", i, "children", j));
            }
          }
        }
      }

      if (allArgs.length === 0) return "()";

      // Check if we're in a continuation context - if so, skip indent (parent already provides it)
      const inContinuation = isInContinuationContext(path);

      if (allArgs.length === 1) {
        // Single-argument call - allow breaking if line exceeds limit
        // Use softline after "(" so arg can go on new line if needed
        if (inContinuation) {
          return group(["(", softline, allArgs[0], ")"]);
        }
        return group(["(", indent([softline, allArgs[0]]), ")"]);
      }

      // Multiple arguments:
      // - Try to fit everything on one line
      // - If it doesn't fit, break after opening paren and indent all args
      // - Closing paren on same line as last arg
      // - If in continuation context, skip indent (parent already provides it)
      if (inContinuation) {
        return group(["(", softline, join([",", line], allArgs), ")"]);
      }
      return group(["(", indent([softline, join([",", line], allArgs)]), ")"]);
    }

    case "function_arguments": {
      const inAnnotation = isInsideAnnotation(path);
      // Filter out comma punctuation - commas are children but we join with commas
      if (inAnnotation) {
        const args: Doc[] = [];
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (child.type !== "," && child.text !== ",") {
            args.push(path.call(print, "children", i));
          }
        }

        // Check if we're inside choices - each choice on its own line
        if (isInsideChoicesAnnotation(path)) {
          return join([",", line], args);
        }

        // Check if inside a graphical primitive - parameters one per line
        if (isInsideGraphicalPrimitive(path)) {
          return join([",", line], args);
        }

        // Default: use fill to pack arguments
        const fillItems: Doc[] = [];
        for (let i = 0; i < args.length; i++) {
          if (i > 0) {
            fillItems.push([",", line]);
          }
          fillItems.push(args[i]);
        }
        return fill(fillItems);
      }
      // Filter out comma punctuation
      const nonCommaArgs: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type !== "," && child.text !== ",") {
          nonCommaArgs.push(path.call(print, "children", i));
        }
      }
      return join([",", line], nonCommaArgs);
    }

    case "named_arguments": {
      const inAnnotation = isInsideAnnotation(path);
      // Filter out comma punctuation - commas are children but we join with commas
      if (inAnnotation) {
        const args: Doc[] = [];
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (child.type !== "," && child.text !== ",") {
            args.push(path.call(print, "children", i));
          }
        }

        // Check if we're inside choices - each choice on its own line
        if (isInsideChoicesAnnotation(path)) {
          return join([",", line], args);
        }

        // Check if inside a graphical primitive - parameters one per line
        if (isInsideGraphicalPrimitive(path)) {
          return join([",", line], args);
        }

        // Use fill to pack as many arguments as possible on each line
        const fillItems: Doc[] = [];
        for (let i = 0; i < args.length; i++) {
          if (i > 0) {
            fillItems.push([",", line]);
          }
          fillItems.push(args[i]);
        }
        return fill(fillItems);
      }
      // Filter out comma punctuation
      const nonCommaNamedArgs: Doc[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type !== "," && child.text !== ",") {
          nonCommaNamedArgs.push(path.call(print, "children", i));
        }
      }
      return join([",", line], nonCommaNamedArgs);
    }

    case "named_argument": {
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          parts.push(child.text ?? "", "=");
        } else {
          // Add indent for continuation lines when value breaks
          parts.push(indent(path.call(print, "children", i)));
        }
      }
      return parts;
    }

    case "function_partial_application":
      return ["function ", ...printChildrenWithSpaces(path, print)];

    // ===========================================
    // Names and references
    // ===========================================
    case "name": {
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "name") {
          if (parts.length > 0) parts.push(".");
          parts.push(path.call(print, "children", i));
        } else if (child.type === "IDENT") {
          if (parts.length > 0) parts.push(".");
          parts.push(child.text ?? "");
        } else if (child.text === ".") {
          // global reference prefix
          parts.push(".");
        }
      }
      return parts;
    }

    case "component_reference": {
      const parts: Doc[] = [];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "IDENT") {
          if (parts.length > 0 && !endsWithDot(parts)) {
            parts.push(".");
          }
          parts.push(child.text ?? "");
        } else if (child.type === "array_subscripts") {
          parts.push(path.call(print, "children", i));
        } else if (child.type === "component_reference") {
          if (parts.length > 0) parts.push(".");
          parts.push(path.call(print, "children", i));
        } else if (child.text === ".") {
          parts.push(".");
        }
      }
      return parts;
    }

    case "type_specifier":
      return printChildren(path, print);

    // ===========================================
    // Annotations and descriptions
    // ===========================================
    case "description_string":
      return printChildren(path, print);

    case "annotation_clause": {
      // Only add semicolon for class-level annotations (parent is long_class_specifier)
      // For annotations inside short_class_specifier, the parent named_element adds the semicolon
      // For inline annotations (in named_element, component_declaration, connect_clause, etc.),
      // the parent adds the semicolon
      const parent = path.getParentNode();
      const isClassLevel = parent?.type === "long_class_specifier";
      if (isClassLevel) {
        return ["annotation", ...printChildren(path, print), ";"];
      }
      return ["annotation", ...printChildren(path, print)];
    }

    // ===========================================
    // External functions
    // ===========================================
    case "external_clause": {
      const parts: Doc[] = ["external"];

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "language_specification") {
          parts.push(" ", path.call(print, "children", i));
        } else if (child.type === "external_function") {
          parts.push(" ", path.call(print, "children", i));
        } else if (child.type === "annotation_clause") {
          parts.push(" ", path.call(print, "children", i));
        }
      }
      parts.push(";");
      return parts;
    }

    case "language_specification":
      return printChildren(path, print);

    case "external_function":
      return printChildrenWithSpaces(path, print);

    // ===========================================
    // Default fallback
    // ===========================================
    default:
      // For any unhandled node type, print children or text
      // If no children, this is a leaf/terminal node - use its text
      if (!node.children || node.children.length === 0) {
        return node.text ?? "";
      }
      return printChildrenWithSpaces(path, print);
  }
};

// ===========================================
// Helper functions
// ===========================================

/**
 * Print all children without separators
 */
function printChildren(
  path: AstPath<ASTNode>,
  print: (path: AstPath<ASTNode>) => Doc,
): Doc[] {
  return path.map(print, "children");
}

/**
 * Print all children with space separators
 */
function printChildrenWithSpaces(
  path: AstPath<ASTNode>,
  print: (path: AstPath<ASTNode>) => Doc,
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
 * Extract prefix keywords (parameter, final, etc.) from element node text
 */
function extractElementPrefix(node: ASTNode): string {
  const text = node.text ?? "";

  // Get the start position of the first child
  const firstChild = node.children[0];
  if (!firstChild) return "";

  const startRow = node.range.start.row;
  const startCol = node.range.start.column;
  const childStartRow = firstChild.range.start.row;
  const childStartCol = firstChild.range.start.column;

  // If child starts at same position as node, no prefix
  if (startRow === childStartRow && startCol === childStartCol) {
    return "";
  }

  // Extract the prefix text from the node
  const lines = text.split("\n");
  let prefixText = "";

  if (startRow === childStartRow) {
    // Same line - extract from startCol to childStartCol
    prefixText = lines[0].substring(0, childStartCol - startCol).trim();
  } else {
    // Different lines - take the first line up to newline
    prefixText = lines[0].trim();
  }

  return prefixText;
}

/**
 * Extract prefix keywords (parameter, constant, final, etc.) from component_clause
 * These appear before the type_specifier
 */
function extractComponentClausePrefix(node: ASTNode): string {
  const text = node.text ?? "";

  // Find the type_specifier child
  const typeSpec = node.children.find((c) => c.type === "type_specifier");
  if (!typeSpec) return "";

  const startRow = node.range.start.row;
  const startCol = node.range.start.column;
  const typeStartRow = typeSpec.range.start.row;
  const typeStartCol = typeSpec.range.start.column;

  // If type_specifier starts at same position as component_clause, no prefix
  if (startRow === typeStartRow && startCol === typeStartCol) {
    return "";
  }

  // Extract the prefix text
  const lines = text.split("\n");
  let prefixText = "";

  if (startRow === typeStartRow) {
    // Same line - extract from start to type_specifier start
    prefixText = lines[0].substring(0, typeStartCol - startCol).trim();
  } else {
    // Different lines - take the first line
    prefixText = lines[0].trim();
  }

  return prefixText;
}

/**
 * Extract modification prefix (each, final) from element_modification node
 */
function extractModificationPrefix(node: ASTNode): string {
  const text = node.text ?? "";
  const firstChild = node.children[0];
  if (!firstChild) return "";

  const startRow = node.range.start.row;
  const startCol = node.range.start.column;
  const childStartRow = firstChild.range.start.row;
  const childStartCol = firstChild.range.start.column;

  if (startRow === childStartRow) {
    // Same line - extract text between node start and first child start
    if (childStartCol > startCol) {
      const lines = text.split("\n");
      const prefixText = lines[0].substring(0, childStartCol - startCol).trim();
      return prefixText;
    }
  } else {
    // Different lines - first line contains the prefix (final/each)
    const lines = text.split("\n");
    const prefixText = lines[0].trim();
    return prefixText;
  }

  return "";
}

/**
 * Extract redeclare prefix (redeclare, final, each) from redeclaration node
 */
function extractRedeclarePrefix(node: ASTNode): string {
  const text = node.text ?? "";
  const firstChild = node.children[0];
  if (!firstChild) return "redeclare";

  const startCol = node.range.start.column;
  const childStartCol = firstChild.range.start.column;

  if (
    node.range.start.row === firstChild.range.start.row &&
    childStartCol > startCol
  ) {
    const lines = text.split("\n");
    const prefixText = lines[0].substring(0, childStartCol - startCol).trim();
    if (prefixText) return prefixText;
  }

  return "redeclare";
}

/**
 * Extract operator from binary expression text by finding what's between operands
 */
function extractOperator(
  fullText: string,
  leftChild: ASTNode,
  rightChild: ASTNode,
): string {
  // Calculate positions relative to fullText
  const leftText = leftChild.text ?? "";
  const rightText = rightChild.text ?? "";

  // The operator is what's between leftText and rightText in fullText
  const leftEnd = fullText.indexOf(leftText) + leftText.length;
  const rightStart = fullText.lastIndexOf(rightText);

  if (leftEnd >= 0 && rightStart > leftEnd) {
    const operatorText = fullText.substring(leftEnd, rightStart).trim();
    if (operatorText) {
      return operatorText;
    }
  }

  // Fallback: try to detect common operators in the full text
  const operators = [
    "==",
    "<>",
    "<=",
    ">=",
    ".+",
    ".-",
    ".*",
    "./",
    ".^",
    "and",
    "or",
    "<",
    ">",
    "+",
    "-",
    "*",
    "/",
    "^",
    "=",
  ];
  for (const op of operators) {
    if (fullText.includes(` ${op} `) || fullText.includes(op)) {
      return op;
    }
  }

  return "?"; // Unknown operator
}

/**
 * Check if Doc array ends with a dot
 */
function endsWithDot(parts: Doc[]): boolean {
  const last = parts[parts.length - 1];
  return typeof last === "string" && last.endsWith(".");
}

// Track reported HTML errors to prevent duplication
const reportedHTMLErrors = new Set<string>();

/**
 * Embed function for Prettier HTML formatter integration
 * This allows HTML in Modelica annotations to be formatted using Prettier's built-in HTML parser
 */
export function embedHTML(path: AstPath<ASTNode>, _options: any) {
  const node = path.getValue();

  // Only process STRING nodes that contain HTML in annotations
  if (node.type !== "STRING") {
    return null;
  }

  const text = node.text ?? "";
  if (!text.includes("<html>")) {
    return null;
  }

  // Check if we're inside an annotation
  if (!isInsideAnnotation(path)) {
    return null;
  }

  // Extract string content (remove outer quotes)
  const match = text.match(/^"(.*)"$/s);
  if (!match) {
    return null;
  }

  const htmlContent = match[1];

  // Return an async function that Prettier will call
  return async (
    _textToDoc: (text: string, options: any) => Promise<Doc>,
    _print: (path: AstPath<ASTNode>) => Doc,
    _path: AstPath<ASTNode>,
    opts: any,
  ): Promise<Doc | undefined> => {
    try {
      // Step 1: Prepare HTML (extract preserved blocks, de-escape quotes)
      const { prepareHTMLForPrettier, postProcessHTMLFromPrettier } =
        await import("./html-embed-formatter.js");
      const { processedHtml, preservedBlocks } = prepareHTMLForPrettier(
        htmlContent,
        DEFAULT_PRESERVED_TAGS,
      );

      // Step 2: Format with Prettier's HTML parser
      const prettier = await import("prettier");
      const formattedHtml = await prettier.default.format(processedHtml, {
        parser: "html",
        printWidth: opts.printWidth || 80,
        htmlWhitespaceSensitivity: "ignore",
      });

      // Step 3: Post-process (restore preserved blocks, re-escape quotes)
      const finalHtml = postProcessHTMLFromPrettier(
        formattedHtml,
        preservedBlocks,
      );

      // Step 4: Return as a Doc (string wrapped in quotes)
      return `"${finalHtml}"`;
    } catch (error) {
      // Write clear error message to stderr (deduplicated)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorKey = `${htmlContent.substring(0, 100)}:${errorMessage.substring(0, 100)}`;

      // Only report each unique error once
      if (!reportedHTMLErrors.has(errorKey)) {
        reportedHTMLErrors.add(errorKey);

        console.error("\n" + "=".repeat(80));
        console.error("ERROR: HTML formatting failed in Modelica annotation");
        console.error("=".repeat(80));
        console.error(errorMessage);
        console.error("\n" + "=".repeat(80));
      }

      // Throw error to stop formatting completely
      throw new Error(`HTML formatting failed: ${errorMessage}`);
    }
  };
}
