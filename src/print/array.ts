/**
 * Array handlers for Modelica printer
 * Handles: array_constructor, array_arguments, array_concatenation, array_comprehension, array_subscripts, subscript
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  group,
  indent,
  line,
  softline,
  hardline,
  join,
  isInsideAnnotation,
  isCoordinateArray,
  isGraphicsArray,
  isGraphicalPrimitive,
  printAtPosition,
  printChildren,
  type PrintFn,
} from "./utils.js";

/**
 * Print array_constructor node
 */
export function printArrayConstructor(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const args = path.map(print, "children");
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    // Check if this is a coordinate/numerical array - keep compact
    if (isCoordinateArray(node)) {
      return ["{", join(",", args), "}"];
    }

    // Check if this is a graphics array
    if (isGraphicsArray(path)) {
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

  // Non-annotation arrays
  if (args.length === 0) return "{}";
  return group(["{", args[0], "}"]);
}

/**
 * Print array_arguments node
 */
export function printArrayArguments(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    const args = path.map(print, "children");
    if (isCoordinateArray(node)) {
      return join(",", args);
    }

    if (isGraphicsArray(path)) {
      return join([",", hardline], args);
    }

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
      return join([",", hardline], args);
    }

    return join(",", args);
  }

  // Non-annotation: first element hugs opener, subsequent elements break with continuation indent
  if (node.children.length === 0) return "";
  if (node.children.length === 1) return path.call(print, "children", 0);

  const first = path.call(print, "children", 0);
  const continuationParts: Doc[] = [];
  for (let i = 1; i < node.children.length; i++) {
    const idx = i;
    continuationParts.push(
      ",",
      group([
        line,
        printAtPosition("mid-line", () => path.call(print, "children", idx)),
      ]),
    );
  }
  return [first, indent(continuationParts)];
}

/**
 * Print array_concatenation node
 */
export function printArrayConcatenation(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const rows = path.map(print, "children");
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    return group(["[", join("; ", rows), "]"]);
  }

  return group([
    "[",
    indent([softline, join([";", line], rows)]),
    softline,
    "]",
  ]);
}

/**
 * Print array_comprehension node
 */
export function printArrayComprehension(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["{"];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "for") {
      // Skip - we add "for" manually with for_indices
    } else if (child.type === "for_indices") {
      parts.push(" for ", path.call(print, "children", i));
    } else {
      parts.push(path.call(print, "children", i));
    }
  }

  parts.push("}");
  return parts;
}

/**
 * Print array_subscripts node
 */
export function printArraySubscripts(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return ["[", join(", ", path.map(print, "children")), "]"];
}

/**
 * Print subscript node
 */
export function printSubscript(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  if (node.text === ":") {
    return ":";
  }
  return printChildren(path, print);
}
