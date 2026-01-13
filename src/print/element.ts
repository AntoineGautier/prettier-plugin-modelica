/**
 * Element list handlers for Modelica printer
 * Handles: element_list, public_element_list, protected_element_list, named_element, import_clause, import_list, extends_clause, constraining_clause
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  group,
  indent,
  line,
  hardline,
  join,
  isClassDefinitionElement,
  type PrintFn,
} from "./utils.js";

/**
 * Helper to find the start of a comment block that precedes a class definition
 */
function findCommentBlockStart(
  children: ASTNode[],
  classDefIndex: number,
): number {
  let firstCommentIndex = -1;
  for (let j = classDefIndex - 1; j >= 0; j--) {
    const c = children[j];
    if (c.type === "comment" || c.type === "BLOCK_COMMENT") {
      firstCommentIndex = j;
    } else {
      break;
    }
  }
  return firstCommentIndex;
}

/**
 * Build element list with blank lines around class definitions
 */
function buildElementList(
  node: ASTNode,
  elements: Doc[],
): Doc[] {
  const result: Doc[] = [];
  const blankLineBefore = new Set<number>();

  // First pass: identify where blank lines should go
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const isClassDef = isClassDefinitionElement(child);
    const prevChild = i > 0 ? node.children[i - 1] : null;
    const prevIsClassDef = prevChild ? isClassDefinitionElement(prevChild) : false;

    if (isClassDef && i > 0) {
      const commentBlockStart = findCommentBlockStart(node.children, i);
      if (commentBlockStart > 0) {
        blankLineBefore.add(commentBlockStart);
      } else if (commentBlockStart === -1) {
        blankLineBefore.add(i);
      }
    } else if (prevIsClassDef && i > 0) {
      blankLineBefore.add(i);
    }
  }

  // Second pass: build the result with appropriate blank lines
  for (let i = 0; i < elements.length; i++) {
    if (i > 0) {
      if (blankLineBefore.has(i)) {
        result.push(hardline, hardline);
      } else {
        result.push(hardline);
      }
    }
    result.push(elements[i]);
  }

  return result;
}

/**
 * Print element_list node
 */
export function printElementList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const elements = path.map(print, "children");
  return buildElementList(node, elements);
}

/**
 * Print public_element_list node
 */
export function printPublicElementList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const elements = path.map(print, "children");
  const result = buildElementList(node, elements);
  return [hardline, "public", hardline, result];
}

/**
 * Print protected_element_list node
 */
export function printProtectedElementList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const elements = path.map(print, "children");
  const result = buildElementList(node, elements);
  return [hardline, "protected", hardline, result];
}

/**
 * Print named_element node
 */
export function printNamedElement(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  const hasConstrainingClause = node.children.some(
    (c) => c.type === "constraining_clause",
  );
  const hasDescriptionString = node.children.some(
    (c) => c.type === "description_string",
  );
  const hasAnnotationClause = node.children.some(
    (c) => c.type === "annotation_clause",
  );

  const hasShortClassDefinition = node.children.some(
    (c) =>
      c.type === "class_definition" &&
      c.children.some(
        (cc: ASTNode) =>
          cc.type === "short_class_specifier" ||
          cc.type === "enumeration_class_specifier" ||
          cc.type === "derivative_class_specifier",
      ),
  );

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      child.type === "final" ||
      child.type === "replaceable" ||
      child.type === "redeclare" ||
      child.type === "inner" ||
      child.type === "outer"
    ) {
      if (parts.length > 0) parts.push(" ");
      parts.push(child.text ?? "");
    } else if (child.type === "component_clause") {
      if (parts.length > 0) parts.push(" ");
      parts.push(path.call(print, "children", i));
      if (
        !hasConstrainingClause &&
        !hasDescriptionString &&
        !hasAnnotationClause
      ) {
        parts.push(";");
      }
    } else if (child.type === "class_definition") {
      if (parts.length > 0) parts.push(" ");
      parts.push(path.call(print, "children", i));
    } else if (child.type === "constraining_clause") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "description_string") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "annotation_clause") {
      parts.push(indent([line, path.call(print, "children", i)]));
    }
  }

  if (hasConstrainingClause || hasDescriptionString || hasAnnotationClause) {
    if (
      node.children.some((c) => c.type === "component_clause") ||
      hasShortClassDefinition
    ) {
      parts.push(";");
    }
  } else if (hasShortClassDefinition) {
    parts.push(";");
  }
  return group(parts);
}

/**
 * Print import_clause node
 * Handles: import name; | import IDENT = name; | import name.*; | import name.{...};
 */
export function printImportClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["import "];

  // Check if this is an aliased import (import IDENT = name)
  // by looking for the '=' token in the raw syntax node
  const syntaxNode = node._syntaxNode;
  let hasAlias = false;
  if (syntaxNode) {
    for (let i = 0; i < syntaxNode.childCount; i++) {
      const child = syntaxNode.child(i);
      if (child && child.type === "=") {
        hasAlias = true;
        break;
      }
    }
  }

  // Check for trailing elements (description_string, annotation_clause)
  const hasTrailingElements = node.children.some(
    (c) => c.type === "description_string" || c.type === "annotation_clause",
  );

  // Build output based on children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "import") {
      // Skip - already added "import " above
      continue;
    }
    if (child.type === "description_string" || child.type === "annotation_clause") {
      // Description string and annotation go on new indented line
      parts.push(indent([line, path.call(print, "children", i)]));
      continue;
    }
    if (i > 0 && node.children[i - 1].type !== "import") {
      // Add space between non-import children, but insert "= " after IDENT if aliased
      if (hasAlias && node.children[i - 1].type === "IDENT" && child.type === "name") {
        parts.push(" = ");
      } else {
        parts.push(" ");
      }
    }
    parts.push(path.call(print, "children", i));
  }

  parts.push(";");
  return hasTrailingElements ? group(parts) : parts;
}

/**
 * Print import_list node
 */
export function printImportList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(", ", path.map(print, "children"));
}

/**
 * Print extends_clause node
 */
export function printExtendsClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["extends "];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "extends") {
      // Skip - we already added "extends " manually above
    } else if (child.type === "type_specifier") {
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

/**
 * Print constraining_clause node
 */
export function printConstrainingClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["constrainedby "];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "type_specifier") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "class_modification") {
      parts.push(path.call(print, "children", i));
    }
  }
  return group(parts);
}
