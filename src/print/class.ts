/**
 * Class definition handlers for Modelica printer
 * Handles: stored_definitions, stored_definition, within_clause, class_definition, class_prefixes, long_class_specifier, short_class_specifier, derivative_class_specifier, extends_class_specifier, enumeration_class_specifier, enum_list, enumeration_literal, base_prefix
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
  formatAssignmentRhs,
  formatAssignmentRhsCompact,
  formatTrailingDescription,
  isInsideClassModification,
  isInsideChoicesAnnotation,
  isClassDefinitionElement,
  printChildrenWithSpaces,
  type PrintFn,
} from "./utils.js";

/**
 * Print stored_definitions node
 */
export function printStoredDefinitions(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return [join(hardline, path.map(print, "children")), hardline];
}

/**
 * Print stored_definition node
 */
export function printStoredDefinition(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  let needsSemicolon = false;
  const classDefChild = node.children.find(
    (c) => c.type === "class_definition",
  );
  if (classDefChild) {
    const hasShortSpecifier = classDefChild.children.some(
      (cc) =>
        cc.type === "short_class_specifier" ||
        cc.type === "enumeration_class_specifier" ||
        cc.type === "derivative_class_specifier",
    );
    needsSemicolon = hasShortSpecifier;
  }

  for (let i = 0; i < node.children.length; i++) {
    if (parts.length > 0) {
      parts.push(hardline);
    }
    parts.push(path.call(print, "children", i));
  }

  if (needsSemicolon) {
    parts.push(";");
  }

  return parts;
}

/**
 * Print within_clause node
 */
export function printWithinClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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

/**
 * Print class_definition node
 */
export function printClassDefinition(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  for (let i = 0; i < node.children.length; i++) {
    if (i > 0) parts.push(" ");
    parts.push(path.call(print, "children", i));
  }
  return parts;
}

/**
 * Print class_prefixes node
 */
export function printClassPrefixes(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}

/**
 * Print long_class_specifier node
 */
export function printLongClassSpecifier(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  let className = "";

  const elementListEndsWithClassDef = (n: ASTNode): boolean => {
    if (
      n.type !== "element_list" &&
      n.type !== "public_element_list" &&
      n.type !== "protected_element_list"
    ) {
      return false;
    }
    const lastChild = n.children[n.children.length - 1];
    return lastChild ? isClassDefinitionElement(lastChild) : false;
  };

  const findCommentBlockStart = (targetIndex: number): number => {
    let firstCommentIndex = -1;
    for (let j = targetIndex - 1; j >= 0; j--) {
      const c = node.children[j];
      if (c.type === "comment" || c.type === "BLOCK_COMMENT") {
        firstCommentIndex = j;
      } else {
        break;
      }
    }
    return firstCommentIndex;
  };

  const blankLineBeforeComment = new Set<number>();

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      child.type === "public_element_list" ||
      child.type === "protected_element_list"
    ) {
      const commentBlockStart = findCommentBlockStart(i);
      if (commentBlockStart >= 0) {
        const beforeComment =
          commentBlockStart > 0
            ? node.children[commentBlockStart - 1]
            : null;
        if (beforeComment && elementListEndsWithClassDef(beforeComment)) {
          blankLineBeforeComment.add(commentBlockStart);
        }
      }
    }
  }

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const prevChild = i > 0 ? node.children[i - 1] : null;

    if (child.type === "IDENT" && !className) {
      className = child.text ?? "";
      parts.push(className);
    } else if (child.type === "description_string") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "extends_clause") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "element_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (
      child.type === "public_element_list" ||
      child.type === "protected_element_list"
    ) {
      parts.push(indent([path.call(print, "children", i)]));
    } else if (
      child.type === "equation_section" ||
      child.type === "algorithm_section"
    ) {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "annotation_clause") {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "external_clause") {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
      if (blankLineBeforeComment.has(i)) {
        parts.push(
          hardline,
          indent([hardline, path.call(print, "children", i)]),
        );
      } else if (prevChild && elementListEndsWithClassDef(prevChild)) {
        parts.push(
          hardline,
          indent([hardline, path.call(print, "children", i)]),
        );
      } else {
        parts.push(indent([line, path.call(print, "children", i)]));
      }
    }
  }

  parts.push(hardline, "end ", className, ";");
  return group(parts);
}

/**
 * Print short_class_specifier node
 */
export function printShortClassSpecifier(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  const inChoices = isInsideChoicesAnnotation(path);
  const inClassMod = isInsideClassModification(path);

  const rhsParts: Doc[] = [];
  const trailingParts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "IDENT") {
      parts.push(child.text ?? "");
    } else if (child.type === "base_prefix") {
      rhsParts.push(path.call(print, "children", i), " ");
    } else if (child.type === "type_specifier") {
      rhsParts.push(path.call(print, "children", i));
    } else if (child.type === "class_modification") {
      rhsParts.push(path.call(print, "children", i));
    } else if (child.type === "description_string") {
      trailingParts.push(
        formatTrailingDescription(
          path.call(print, "children", i),
          inChoices,
        ),
      );
    } else if (child.type === "annotation_clause") {
      trailingParts.push(
        formatTrailingDescription(
          path.call(print, "children", i),
          inChoices,
        ),
      );
    }
  }

  if (rhsParts.length > 0) {
    if (inClassMod) {
      parts.push(formatAssignmentRhsCompact(rhsParts, inChoices));
    } else {
      parts.push(formatAssignmentRhs(rhsParts));
    }
  }

  parts.push(...trailingParts);

  return group(parts);
}

/**
 * Print derivative_class_specifier node
 */
export function printDerivativeClassSpecifier(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildrenWithSpaces(path, print);
}

/**
 * Print extends_class_specifier node
 */
export function printExtendsClassSpecifier(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  let className = "";
  let hasAnnotation = false;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "extends") {
      parts.push("extends ");
    } else if (child.type === "IDENT" && !className) {
      className = child.text ?? "";
      parts.push(className);
    } else if (child.type === "IDENT") {
      // Second IDENT at the end after 'end' keyword - skip
    } else if (child.type === "class_modification") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "description_string") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "element_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "public_element_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "protected_element_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "algorithm_section") {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "equation_section") {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "annotation_clause") {
      parts.push(hardline, path.call(print, "children", i));
      hasAnnotation = true;
    } else if (child.type === "end") {
      // Skip
    }
  }

  if (hasAnnotation) {
    parts.push(";");
  }

  parts.push(hardline, "end ", className, ";");
  return group(parts);
}

/**
 * Print enumeration_class_specifier node
 */
export function printEnumerationClassSpecifier(
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
      parts.push(" = enumeration(");
    } else if (child.type === "enum_list") {
      parts.push(indent([softline, path.call(print, "children", i)]));
      parts.push(")");
    } else if (child.type === "description_string") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "annotation_clause") {
      parts.push(hardline, path.call(print, "children", i));
    }
  }

  return group(parts);
}

/**
 * Print enum_list node
 */
export function printEnumList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
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

/**
 * Print enumeration_literal node
 */
export function printEnumerationLiteral(
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
    } else if (child.type === "description_string") {
      parts.push(" ", path.call(print, "children", i));
    }
  }
  return parts;
}

/**
 * Print base_prefix node
 */
export function printBasePrefix(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}
