/**
 * Annotation handlers for Modelica printer
 * Handles: description_string, annotation_clause, external_clause, language_specification, external_function
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  printChildren,
  printChildrenWithSpaces,
  type PrintFn,
} from "./utils.js";

/**
 * Print description_string node
 */
export function printDescriptionString(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildren(path, print);
}

/**
 * Print annotation_clause node
 */
export function printAnnotationClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  // Only add semicolon for class-level annotations (parent is long_class_specifier)
  const parent = path.getParentNode();
  const isClassLevel = parent?.type === "long_class_specifier";
  if (isClassLevel) {
    return ["annotation", ...printChildren(path, print), ";"];
  }
  return ["annotation", ...printChildren(path, print)];
}

/**
 * Print external_clause node
 */
export function printExternalClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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

/**
 * Print language_specification node
 */
export function printLanguageSpecification(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildren(path, print);
}

/**
 * Print external_function node
 */
export function printExternalFunction(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildrenWithSpaces(path, print);
}
