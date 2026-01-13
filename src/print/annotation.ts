/**
 * Annotation handlers for Modelica printer
 * Handles: description_string, annotation_clause, external_clause, language_specification, external_function
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  group,
  indent,
  join,
  line,
  softline,
  printChildren,
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
    }
    // annotation_clause is handled separately - don't add semicolon if we have annotation
  }

  // Check if there's an annotation - if so, don't add semicolon here
  const hasAnnotation = node.children.some(
    (c) => c.type === "annotation_clause",
  );
  if (!hasAnnotation) {
    parts.push(";");
  }
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
 * Handles: component_reference = IDENT(expression_list) or just IDENT(expression_list)
 */
export function printExternalFunction(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  // Check if this has an assignment (output = func(...))
  // by looking for '=' in the raw syntax node
  const syntaxNode = node._syntaxNode;
  let hasAssignment = false;
  if (syntaxNode) {
    for (let i = 0; i < syntaxNode.childCount; i++) {
      const child = syntaxNode.child(i);
      if (child && child.type === "=") {
        hasAssignment = true;
        break;
      }
    }
  }

  // Build output: [component_reference =] IDENT(expression_list)
  let foundFuncName = false;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "component_reference" && !foundFuncName) {
      // This is the output variable (before the =)
      parts.push(path.call(print, "children", i));
      if (hasAssignment) {
        parts.push(" = ");
      }
    } else if (child.type === "IDENT") {
      // This is the function name
      foundFuncName = true;
      parts.push(path.call(print, "children", i));
    } else if (child.type === "expression_list") {
      // Format arguments like regular function calls with breaking
      const args: Doc[] = [];
      for (let j = 0; j < child.children.length; j++) {
        args.push(path.call(print, "children", i, "children", j));
      }
      if (args.length === 0) {
        parts.push("()");
      } else if (args.length === 1) {
        parts.push(group(["(", args[0], ")"]));
      } else {
        // Closing paren attached to last arg
        parts.push(
          group(["(", indent([softline, join([",", line], args), ")"]),]),
        );
      }
    }
  }

  return parts;
}
