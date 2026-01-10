/**
 * Function call handlers for Modelica printer
 * Handles: function_application, function_call_args, function_arguments, named_arguments, named_argument, function_partial_application
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
  isInsideAnnotation,
  isGraphicalPrimitive,
  isFirstLevelAnnotationAttribute,
  isInsideChoicesAnnotation,
  isInsideGraphicalPrimitive,
  getAnnotationElementName,
  isInContinuationContext,
  printChildrenWithSpaces,
  type PrintFn,
} from "./utils.js";

/**
 * Print function_application node
 */
export function printFunctionApplication(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "component_reference" || child.type === "name") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "function_call_args") {
      parts.push(path.call(print, "children", i));
    } else if (
      child.type === "initial" ||
      child.type === "der" ||
      child.type === "pure"
    ) {
      parts.push(child.text ?? child.type);
    }
  }
  return parts;
}

/**
 * Print function_call_args node
 */
export function printFunctionCallArgs(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();

  if (node.children.length === 0) {
    return "()";
  }
  const args = path.map(print, "children");
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    const parent = path.getParentNode();
    const funcName = parent ? getAnnotationElementName(parent) : null;

    if (
      parent &&
      parent.type === "function_application" &&
      isGraphicalPrimitive(parent)
    ) {
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
      if (args.length === 0) return "()";
      if (args.length === 1) return ["(", args[0], ")"];
      return [
        "(",
        args[0],
        ",",
        indent([hardline, join([",", hardline], args.slice(1)), ")"]),
      ];
    }

    if (funcName === "choices") {
      if (args.length === 0) return "()";
      return group([
        "(",
        indent([hardline, join([",", hardline], args)]),
        ")",
      ]);
    }

    const isFirstLevel = isFirstLevelAnnotationAttribute(path);

    if (isFirstLevel) {
      if (args.length === 0) return "()";
      if (args.length === 1) return ["(", args[0], ")"];
      return [
        "(",
        args[0],
        ",",
        indent([hardline, join([",", hardline], args.slice(1)), ")"]),
      ];
    }

    if (args.length === 0) return "()";
    if (args.length === 1) {
      return group(["(", args[0], ")"]);
    }
    return group(["(", indent([softline, join([",", line], args), ")"])]);
  }

  // Check for iterator/comprehension syntax
  const hasForClause = node.children.some((c) => c.type === "for");
  if (hasForClause) {
    const parts: Doc[] = ["("];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (
        child.type === "expression" ||
        child.type === "simple_expression"
      ) {
        parts.push(path.call(print, "children", i));
      } else if (child.type === "for") {
        parts.push(" for ");
      } else if (child.type === "for_indices") {
        parts.push(path.call(print, "children", i));
      }
    }
    parts.push(")");
    return group(parts);
  }

  // Extract all arguments from both function_arguments and named_arguments
  const allArgs: Doc[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (
      child.type === "function_arguments" ||
      child.type === "named_arguments"
    ) {
      for (let j = 0; j < child.children.length; j++) {
        const argChild = child.children[j];
        if (argChild.type !== "," && argChild.text !== ",") {
          allArgs.push(path.call(print, "children", i, "children", j));
        }
      }
    }
  }

  if (allArgs.length === 0) return "()";

  const inContinuation = isInContinuationContext(path);

  if (allArgs.length === 1) {
    if (inContinuation) {
      return group(["(", softline, allArgs[0], ")"]);
    }
    return group(["(", indent([softline, allArgs[0]]), ")"]);
  }

  const argsInline = ["(", join(", ", allArgs), ")"];

  if (inContinuation) {
    const argsBroken = group(
      ["(", softline, join([",", line], allArgs), ")"],
      { shouldBreak: true },
    );
    return conditionalGroup([argsInline, argsBroken]);
  }
  const argsBroken = group(
    ["(", indent([softline, join([",", line], allArgs)]), ")"],
    { shouldBreak: true },
  );
  return conditionalGroup([argsInline, argsBroken]);
}

/**
 * Print function_arguments node
 */
export function printFunctionArguments(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    const args: Doc[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type !== "," && child.text !== ",") {
        args.push(path.call(print, "children", i));
      }
    }

    if (isInsideChoicesAnnotation(path)) {
      return join([",", line], args);
    }

    if (isInsideGraphicalPrimitive(path)) {
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

  const nonCommaArgs: Doc[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type !== "," && child.text !== ",") {
      nonCommaArgs.push(path.call(print, "children", i));
    }
  }
  return join([",", line], nonCommaArgs);
}

/**
 * Print named_arguments node
 */
export function printNamedArguments(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    const args: Doc[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (child.type !== "," && child.text !== ",") {
        args.push(path.call(print, "children", i));
      }
    }

    if (isInsideChoicesAnnotation(path)) {
      return join([",", line], args);
    }

    if (isInsideGraphicalPrimitive(path)) {
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

  const nonCommaNamedArgs: Doc[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type !== "," && child.text !== ",") {
      nonCommaNamedArgs.push(path.call(print, "children", i));
    }
  }
  return join([",", line], nonCommaNamedArgs);
}

/**
 * Print named_argument node
 */
export function printNamedArgument(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "IDENT") {
      parts.push(child.text ?? "", "=");
    } else {
      parts.push(indent(path.call(print, "children", i)));
    }
  }
  return parts;
}

/**
 * Print function_partial_application node
 */
export function printFunctionPartialApplication(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return ["function ", ...printChildrenWithSpaces(path, print)];
}
