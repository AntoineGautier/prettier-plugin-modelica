/**
 * Component handlers for Modelica printer
 * Handles: component_clause, component_list, component_declaration, condition_attribute, declaration
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  group,
  indent,
  line,
  join,
  extractComponentClausePrefix,
  formatTrailingDescription,
  isInsideChoicesAnnotation,
  type PrintFn,
} from "./utils.js";

/**
 * Print component_clause node
 */
export function printComponentClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

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
  return parts;
}

/**
 * Print component_list node
 */
export function printComponentList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join([",", line], path.map(print, "children"));
}

/**
 * Print component_declaration node
 */
export function printComponentDeclaration(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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
      parts.push(indent([line, "if ", path.call(print, "children", i)]));
    } else if (child.type === "description_string") {
      parts.push(
        formatTrailingDescription(
          path.call(print, "children", i),
          isInsideChoicesAnnotation(path),
        ),
      );
    } else if (child.type === "annotation_clause") {
      parts.push(formatTrailingDescription(path.call(print, "children", i), false, true));
    } else if (child.type === "comment") {
      parts.push(" ", path.call(print, "children", i));
    }
  }
  return group(parts);
}

/**
 * Print condition_attribute node
 */
export function printConditionAttribute(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["if "];
  for (let i = 0; i < node.children.length; i++) {
    parts.push(path.call(print, "children", i));
  }
  return parts;
}

/**
 * Print declaration node
 */
export function printDeclaration(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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
