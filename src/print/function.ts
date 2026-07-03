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
  ifBreak,
  isInsideAnnotation,
  isGraphicalPrimitive,
  isFirstLevelAnnotationAttribute,
  isInsideChoicesAnnotation,
  isInsideGraphicalPrimitive,
  getAnnotationElementName,
  printAtPosition,
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
  const inAnnotation = isInsideAnnotation(path);

  if (inAnnotation) {
    const args = path.map(print, "children");
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

  // Extract all arguments from both function_arguments and named_arguments.
  // Arguments print in "mid-line" position: even when the call breaks and an
  // argument starts its own line, an if-expression argument reads best with
  // its then/else branches indented past `if`.
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
          const childIdx = i;
          const argIdx = j;
          allArgs.push(
            printAtPosition("mid-line", () =>
              path.call(print, "children", childIdx, "children", argIdx),
            ),
          );
        }
      }
    }
  }

  if (allArgs.length === 0) return "()";

  if (allArgs.length === 1) {
    return group(["(", indent([softline, allArgs[0]]), ")"]);
  }

  // Multiple arguments - three formatting options using nested ifBreak:
  // 1. All inline: func(a, b, c) - everything fits on one line
  // 2. Break after '(', args inline: func(\n  a, b, c) - outer breaks, inner doesn't
  // 3. Each arg on own line: func(\n  a,\n  b,\n  c) - both outer and inner break
  //
  // Nested ifBreak structure (like Prettier JS):
  // - Outer ifBreak: decides whether function call breaks at all
  // - Inner ifBreak: if outer broke, decides whether args inline or separate lines
  return group([
    "(",
    indent([
      ifBreak(
        // When outer breaks - line and inner ifBreak for args
        [
          line,
          group(
            ifBreak(
              join([",", line], allArgs),  // inner breaks: each arg on line
              join(", ", allArgs)           // inner doesn't break: args inline
            )
          )
        ],
        // When outer doesn't break - softline and inline args
        [softline, join(", ", allArgs)]
      )
    ]),
    ")"
  ]);
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
      // Continuation lines of a nested call's argument list (e.g. inside
      // DynamicSelect) indent one step past the line the call starts on.
      return indent(join([",", line], args));
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
      // Continuation lines of a nested call's argument list (e.g. inside
      // DynamicSelect) indent one step past the line the call starts on.
      return indent(join([",", line], args));
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
    const idx = i;
    if (child.type === "IDENT") {
      parts.push(child.text ?? "", "=");
    } else {
      // The value is glued after `name=`; it indents its own continuation
      // lines, so no indent wrapper is needed here.
      parts.push(
        printAtPosition("mid-line", () => path.call(print, "children", idx)),
      );
    }
  }
  return parts;
}

/**
 * Print function_partial_application node
 * 
 * Grammar: "function" type_specifier "(" optional(named_arguments) ")"
 */
export function printFunctionPartialApplication(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["function "];
  
  // Find type_specifier and named_arguments indices
  let typeSpecifierIdx = -1;
  let namedArgsIdx = -1;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "type_specifier") {
      typeSpecifierIdx = i;
    } else if (child.type === "named_arguments") {
      namedArgsIdx = i;
    }
  }
  
  if (typeSpecifierIdx >= 0) {
    parts.push(path.call(print, "children", typeSpecifierIdx));
  }
  
  if (namedArgsIdx >= 0) {
    // Extract individual named arguments (skip commas)
    const namedArgsNode = node.children[namedArgsIdx];
    const args: Doc[] = [];
    for (let j = 0; j < namedArgsNode.children.length; j++) {
      const argChild = namedArgsNode.children[j];
      if (argChild.type !== "," && argChild.text !== ",") {
        args.push(path.call(print, "children", namedArgsIdx, "children", j));
      }
    }
    
    if (args.length === 0) {
      parts.push("()");
    } else if (args.length === 1) {
      parts.push(group(["(", indent([softline, args[0]]), ")"]));
    } else {
      // Use group with indent so that either all args fit inline or all break
      parts.push(group([
        "(",
        indent([softline, join([",", line], args)]),
        ")",
      ]));
    }
  } else {
    parts.push("()");
  }
  
  return parts;
}
