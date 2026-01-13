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
  ifBreak,
  isInsideAnnotation,
  isGraphicalPrimitive,
  isFirstLevelAnnotationAttribute,
  isInsideChoicesAnnotation,
  isInsideGraphicalPrimitive,
  getAnnotationElementName,
  isInContinuationContext,
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

  // Multiple arguments - three formatting options using nested ifBreak:
  // 1. All inline: func(a, b, c) - everything fits on one line
  // 2. Break after '(', args inline: func(\n  a, b, c) - outer breaks, inner doesn't
  // 3. Each arg on own line: func(\n  a,\n  b,\n  c) - both outer and inner break
  //
  // Nested ifBreak structure (like Prettier JS):
  // - Outer ifBreak: decides whether function call breaks at all
  // - Inner ifBreak: if outer broke, decides whether args inline or separate lines
  //
  // Check if we're inside a binary expression by walking up the tree
  // Don't stop at function_call_args - we need to find binary expressions further up
  // Binary expressions add indent for continuation lines, so operands need indent
  let insideBinaryExpression = false;
  for (let i = 1; i < 15; i++) {
    const ancestor = path.getParentNode(i);
    if (!ancestor) break;
    if (ancestor.type === "binary_expression") {
      insideBinaryExpression = true;
      break;
    }
    // Stop at boundaries that reset context (but not function_call_args)
    // Note: Don't stop at "declaration" because binary expressions inside
    // declarations (like parameter assignments) need to be detected
    if (ancestor.type === "if_expression" ||
        ancestor.type === "named_argument" ||
        ancestor.type === "equation" ||
        ancestor.type === "statement") {
      break;
    }
  }

  // In continuation context OR inside binary expression, handle specially
  // Binary expressions only wrap continuation lines in indent, so we need to add indent for args
  // But if-expressions wrap the entire value in indent, so we don't need to add indent
  if (insideBinaryExpression) {
    // Inside binary expression: function call must provide its own indent
    // Binary expression option 2 sets shouldBreak but doesn't add indent
    // Use conditionalGroup to try three explicit formatting options
    // Option 1: All inline - func(a, b, c)
    // Option 2: Break after '(', args inline - func(\n  a, b, c)
    // Option 3: Break after '(', each arg on line - func(\n  a,\n  b,\n  c)
    return conditionalGroup([
      // Option 1: all inline
      ["(", join(", ", allArgs), ")"],
      // Option 2: break with indent, args inline
      ["(", indent([line, join(", ", allArgs)]), ")"],
      // Option 3: break with indent, each arg on own line
      ["(", indent([line, join([",", line], allArgs)]), ")"],
    ]);
  }

  if (inContinuation) {
    // Already in continuation context - no additional indent
    return group([
      "(",
      ifBreak(
        [
          line,
          group(
            ifBreak(
              join([",", line], allArgs),  // inner breaks: each arg on line
              join(", ", allArgs)           // inner doesn't break: args inline
            )
          )
        ],
        // When outer doesn't break - everything inline
        join(", ", allArgs)
      ),
      ")"
    ]);
  }

  // Not in continuation context - wrap entire content in indent
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
  
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "type_specifier") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "named_arguments") {
      parts.push("(", path.call(print, "children", i), ")");
    }
  }
  
  // If there were no named_arguments, still add empty parens
  if (!node.children.some(c => c.type === "named_arguments")) {
    parts.push("()");
  }
  
  return parts;
}
