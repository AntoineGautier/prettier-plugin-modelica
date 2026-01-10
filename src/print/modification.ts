/**
 * Modification handlers for Modelica printer
 * Handles: modification, class_modification, argument_list, element_modification, element_replaceable, class_redeclaration, component_redeclaration, short_class_definition
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
  fill,
  conditionalGroup,
  formatAssignmentRhs,
  isInsideAnnotation,
  isChoicesLevel,
  isInsideChoicesAnnotation,
  isInsideGraphicalPrimitive,
  extractModificationPrefix,
  printChildrenWithSpaces,
  type PrintFn,
} from "./utils.js";

/**
 * Print modification node
 */
export function printModification(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
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
        parts.push(formatAssignmentRhs(path.call(print, "children", i)));
      } else {
        parts.push("=", path.call(print, "children", i));
      }
    }
  }
  return parts;
}

/**
 * Print class_modification node
 */
export function printClassModification(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();

  if (node.children.length === 0) {
    return "()";
  }

  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    const parent = path.getParentNode();
    const isTopLevelAnnotation = parent?.type === "annotation_clause";

    if (isTopLevelAnnotation) {
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

      if (elementArgs.length === 1) {
        return group(["(", elementArgs[0], ")"]);
      }

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
        return group([
          "(",
          indent([hardline, join([",", hardline], elementArgs)]),
          ")",
        ]);
      }

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
        return group(["(", indent(join([",", line], elementArgs)), ")"]);
      }

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
          return conditionalGroup([
            ["(", elementArgs[0], ")"],
            ["(", indent([softline, elementArgs[0], ")"])],
          ]);
        }
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
      return group(["(", indent([softline, join([",", line], args), ")"])]);
    }
  }

  const args = path.map(print, "children");
  return group(["(", indent([softline, join([",", line], args), ")"])]);
}

/**
 * Print argument_list node
 */
export function printArgumentList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const inAnnotation = isInsideAnnotation(path);
  if (inAnnotation) {
    const args = path.map(print, "children");

    if (isInsideChoicesAnnotation(path)) {
      return join([",", line], args);
    }

    if (isInsideGraphicalPrimitive(path)) {
      return join([",", line], args);
    }

    const parent = path.getParentNode();
    const grandparent = path.getParentNode(1);
    const isTopLevelAnnotationArgs =
      parent?.type === "class_modification" &&
      grandparent?.type === "annotation_clause";

    if (isTopLevelAnnotationArgs) {
      return join([",", line], args);
    }

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

/**
 * Print element_modification node
 */
export function printElementModification(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  const prefix = extractModificationPrefix(node);
  if (prefix) {
    parts.push(prefix, " ");
  }

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
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type === "each") {
        parts.push(path.call(print, "children", i), " ");
      } else if (child.type === "final") {
        parts.push(path.call(print, "children", i), " ");
      } else if (child.type === "name") {
        parts.push(path.call(print, "children", i));
      } else if (child.type === "modification") {
        parts.push(path.call(print, "children", i));
      } else if (child.type === "description_string") {
        parts.push(indent([line, path.call(print, "children", i)]));
      }
    }
    return group(parts);
  }

  const inAnnotation = isInsideAnnotation(path);

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "each") {
      parts.push(path.call(print, "children", i), " ");
    } else if (child.type === "final") {
      parts.push(path.call(print, "children", i), " ");
    } else if (child.type === "name") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "modification") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "description_string") {
      if (inAnnotation) {
        parts.push(" ", indent([line, path.call(print, "children", i)]));
      } else {
        parts.push(" ", path.call(print, "children", i));
      }
    }
  }
  return inAnnotation ? group(parts) : parts;
}

/**
 * Print element_replaceable node
 */
export function printElementReplaceable(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildrenWithSpaces(path, print);
}

/**
 * Print class_redeclaration node
 */
export function printClassRedeclaration(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      child.type === "redeclare" ||
      child.type === "each" ||
      child.type === "final" ||
      child.type === "replaceable"
    ) {
      if (parts.length > 0) parts.push(" ");
      parts.push(child.text ?? "");
    } else if (
      child.type === "short_class_definition" ||
      child.type === "class_definition"
    ) {
      parts.push(" ", path.call(print, "children", i));
    }
  }
  return parts;
}

/**
 * Print component_redeclaration node
 */
export function printComponentRedeclaration(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      child.type === "redeclare" ||
      child.type === "each" ||
      child.type === "final" ||
      child.type === "replaceable"
    ) {
      if (parts.length > 0) parts.push(" ");
      parts.push(child.text ?? "");
    } else if (child.type === "component_clause") {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "constraining_clause") {
      parts.push(indent([line, path.call(print, "children", i)]));
    }
  }
  return group(parts);
}

/**
 * Print short_class_definition node
 */
export function printShortClassDefinition(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
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
