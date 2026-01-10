/**
 * Name and reference handlers for Modelica printer
 * Handles: name, component_reference, type_specifier
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import { endsWithDot, printChildren, type PrintFn } from "./utils.js";

/**
 * Print name node
 */
export function printName(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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

/**
 * Print component_reference node
 */
export function printComponentReference(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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

/**
 * Print type_specifier node
 */
export function printTypeSpecifier(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildren(path, print);
}
