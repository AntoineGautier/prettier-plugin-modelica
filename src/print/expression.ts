/**
 * Expression handlers for Modelica printer
 * Handles: expression, if_expression, else_if_clause, simple_expression, range_expression, binary_expression, unary_expression, primary_expression, end_expression, literal_expression, string_literal_expression, unsigned_integer_literal_expression, unsigned_real_literal_expression, logical_literal_expression, parenthesized_expression, output_expression_list, expression_list
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  group,
  indent,
  line,
  hardline,
  join,
  conditionalGroup,
  printChildren,
  printChildrenWithSpaces,
  isInContinuationContext,
  isMidLineIfExpression,
  isInsideIfExpressionValue,
  parenContainsIfExpression,
  wrapContinuation,
  type PrintFn,
} from "./utils.js";

/**
 * Print expression node
 */
export function printExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildren(path, print);
}

/**
 * Print if_expression node
 */
export function printIfExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const children = node.children;
  let childIdx = 0;

  const inContinuation = isInContinuationContext(path);
  const midLine = isMidLineIfExpression(path);
  const nestedInIfValue = isInsideIfExpressionValue(path);

  const conditionParts: Doc[] = [];
  let thenExprDoc: Doc = "";
  let elseExprDoc: Doc = "";
  const elseIfParts: Doc[] = [];

  const skipKeywords = () => {
    while (
      childIdx < children.length &&
      (children[childIdx].type === "then" ||
        children[childIdx].type === "else")
    ) {
      childIdx++;
    }
  };

  if (children[childIdx]) {
    conditionParts.push(path.call(print, "children", childIdx));
    childIdx++;
  }

  skipKeywords();

  if (children[childIdx] && children[childIdx].type !== "else_if_clause") {
    thenExprDoc = path.call(print, "children", childIdx);
    childIdx++;
  }

  while (childIdx < children.length) {
    skipKeywords();
    if (childIdx >= children.length) break;

    const child = children[childIdx];
    if (child.type === "else_if_clause") {
      elseIfParts.push(line, path.call(print, "children", childIdx));
    } else if (child.type !== "then" && child.type !== "else") {
      elseExprDoc = path.call(print, "children", childIdx);
    }
    childIdx++;
  }

  if (inContinuation) {
    return group([
      "if ",
      ...conditionParts,
      line,
      group([
        "then ",
        indent(thenExprDoc),
        ...elseIfParts,
        line,
        "else ",
        indent(elseExprDoc),
      ]),
    ]);
  }

  if (midLine || nestedInIfValue) {
    return group([
      "if ",
      ...conditionParts,
      indent([
        line,
        group([
          "then ",
          indent(thenExprDoc),
          ...elseIfParts,
          line,
          "else ",
          indent(elseExprDoc),
        ]),
      ]),
    ]);
  }

  return group([
    "if ",
    ...conditionParts,
    line,
    group([
      "then ",
      indent(thenExprDoc),
      ...elseIfParts,
      line,
      "else ",
      indent(elseExprDoc),
    ]),
  ]);
}

/**
 * Print else_if_clause node
 */
export function printElseIfClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const conditionParts: Doc[] = [];
  let thenExprDoc: Doc = "";
  let seenCondition = false;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "then") continue;

    if (!seenCondition) {
      conditionParts.push(path.call(print, "children", i));
      seenCondition = true;
    } else {
      thenExprDoc = path.call(print, "children", i);
    }
  }

  return [
    group(["elseif ", ...conditionParts]),
    line,
    "then ",
    thenExprDoc,
  ];
}

/**
 * Print simple_expression node
 */
export function printSimpleExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildren(path, print);
}

/**
 * Print range_expression node
 */
export function printRangeExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(":", path.map(print, "children"));
}

/**
 * Helper to find operator and operand indices in a binary_expression
 */
function findBinaryParts(
  n: ASTNode,
): {
  leftIdx: number;
  opIdx: number;
  rightIdx: number;
  operator: string;
  commentIndices: number[];
} | null {
  if (!n.children || n.children.length < 3) return null;
  const operatorTypes = new Set([
    "and",
    "or",
    "+",
    "-",
    "*",
    "/",
    "^",
    ".+",
    ".-",
    ".*",
    "./",
    ".^",
    "==",
    "<>",
    "<",
    ">",
    "<=",
    ">=",
  ]);
  let opIdx = -1;
  for (let i = 0; i < n.children.length; i++) {
    const child = n.children[i];
    if (operatorTypes.has(child.type)) {
      opIdx = i;
      break;
    }
  }
  if (opIdx === -1) return null;
  let leftIdx = -1;
  const commentIndices: number[] = [];
  for (let i = 0; i < opIdx; i++) {
    const child = n.children[i];
    if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
      commentIndices.push(i);
    } else if (leftIdx === -1) {
      leftIdx = i;
    }
  }
  let rightIdx = -1;
  for (let i = opIdx + 1; i < n.children.length; i++) {
    const child = n.children[i];
    if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
      commentIndices.push(i);
    } else if (rightIdx === -1) {
      rightIdx = i;
    }
  }
  if (leftIdx === -1 || rightIdx === -1) return null;
  return {
    leftIdx,
    opIdx,
    rightIdx,
    operator: n.children[opIdx].text ?? n.children[opIdx].type,
    commentIndices,
  };
}

/**
 * Print binary_expression node
 */
export function printBinaryExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts = findBinaryParts(node);

  if (parts) {
    const { leftIdx, rightIdx, operator, commentIndices } = parts;

    // Logical operators (and/or) - flatten SAME operator only
    if (operator === "and" || operator === "or") {
      const operands: { doc: Doc; trailingComments: Doc[] }[] = [];
      const ops: string[] = [];

      const flattenLogical = (p: AstPath<ASTNode>): void => {
        const n = p.getValue();

        if (n.type === "binary_expression") {
          const innerParts = findBinaryParts(n);
          if (innerParts && innerParts.operator === operator) {
            p.call(
              (leftPath) => flattenLogical(leftPath),
              "children",
              innerParts.leftIdx,
            );
            if (
              innerParts.commentIndices.length > 0 &&
              operands.length > 0
            ) {
              const lastOp = operands[operands.length - 1];
              for (const ci of innerParts.commentIndices) {
                lastOp.trailingComments.push(p.call(print, "children", ci));
              }
            }
            ops.push(innerParts.operator);
            p.call(
              (rightPath) => flattenLogical(rightPath),
              "children",
              innerParts.rightIdx,
            );
            return;
          }
        }
        if (n.type === "simple_expression" && n.children?.length === 1) {
          const child = n.children[0];
          if (child.type === "binary_expression") {
            const innerParts = findBinaryParts(child);
            if (innerParts && innerParts.operator === operator) {
              p.call(
                (innerPath) => {
                  innerPath.call(
                    (leftPath) => flattenLogical(leftPath),
                    "children",
                    innerParts.leftIdx,
                  );
                  if (
                    innerParts.commentIndices.length > 0 &&
                    operands.length > 0
                  ) {
                    const lastOp = operands[operands.length - 1];
                    for (const ci of innerParts.commentIndices) {
                      lastOp.trailingComments.push(
                        innerPath.call(print, "children", ci),
                      );
                    }
                  }
                  ops.push(innerParts.operator);
                  innerPath.call(
                    (rightPath) => flattenLogical(rightPath),
                    "children",
                    innerParts.rightIdx,
                  );
                },
                "children",
                0,
              );
              return;
            }
          }
        }
        operands.push({ doc: print(p), trailingComments: [] });
      };

      flattenLogical(path);

      if (ops.length === 0) {
        const op = operands[0];
        if (op.trailingComments.length > 0) {
          return [op.doc, hardline, join(hardline, op.trailingComments)];
        }
        return op.doc;
      }

      const formatOperand = (op: {
        doc: Doc;
        trailingComments: Doc[];
      }): Doc => {
        if (op.trailingComments.length === 0) return op.doc;
        return [op.doc, hardline, join(hardline, op.trailingComments)];
      };

      const inContinuation = isInContinuationContext(path);

      if (inContinuation) {
        const resultParts: Doc[] = [formatOperand(operands[0])];
        for (let i = 0; i < ops.length; i++) {
          resultParts.push(
            " ",
            ops[i],
            group([line, formatOperand(operands[i + 1])]),
          );
        }
        return group(resultParts);
      } else {
        const continuationParts: Doc[] = [];
        for (let i = 0; i < ops.length; i++) {
          continuationParts.push(
            line,
            ops[i],
            " ",
            formatOperand(operands[i + 1]),
          );
        }
        return group([
          formatOperand(operands[0]),
          indent(continuationParts),
        ]);
      }
    }

    // Arithmetic operators
    const additiveOperators = ["+", "-", ".+", ".-"];
    const multiplicativeOperators = ["*", "/", ".*", "./"];
    const arithmeticOperators = [
      ...additiveOperators,
      ...multiplicativeOperators,
    ];

    if (arithmeticOperators.includes(operator)) {
      const operands: Doc[] = [];
      const operandNodes: ASTNode[] = [];
      const ops: string[] = [];

      const unwrapToBinary = (n: ASTNode): ASTNode | null => {
        if (n.type === "binary_expression") return n;
        if (n.type === "simple_expression" && n.children?.length === 1) {
          return unwrapToBinary(n.children[0]);
        }
        return null;
      };

      const unwrapToCore = (n: ASTNode): ASTNode => {
        if (
          (n.type === "simple_expression" ||
            n.type === "primary_expression" ||
            n.type === "expression") &&
          n.children?.length === 1
        ) {
          return unwrapToCore(n.children[0]);
        }
        return n;
      };

      const flatten = (p: AstPath<ASTNode>): void => {
        const n = p.getValue();

        const binaryNode = unwrapToBinary(n);
        if (binaryNode) {
          const innerParts = findBinaryParts(binaryNode);
          if (
            innerParts &&
            arithmeticOperators.includes(innerParts.operator)
          ) {
            if (
              n.type === "simple_expression" &&
              n.children?.length === 1
            ) {
              p.call(
                (innerPath) => {
                  const innerNode = innerPath.getValue();
                  if (innerNode.type === "binary_expression") {
                    const ip = findBinaryParts(innerNode);
                    if (ip) {
                      innerPath.call(flatten, "children", ip.leftIdx);
                      ops.push(ip.operator);
                      innerPath.call(flatten, "children", ip.rightIdx);
                    } else {
                      flatten(innerPath);
                    }
                  } else {
                    flatten(innerPath);
                  }
                },
                "children",
                0,
              );
              return;
            } else if (n.type === "binary_expression") {
              p.call(flatten, "children", innerParts.leftIdx);
              ops.push(innerParts.operator);
              p.call(flatten, "children", innerParts.rightIdx);
              return;
            }
          }
        }
        operands.push(print(p));
        operandNodes.push(unwrapToCore(n));
      };

      flatten(path);

      if (ops.length === 0) {
        return operands[0];
      }

      const inContinuation = isInContinuationContext(path);

      const isHuggable = (n: ASTNode): boolean => {
        return (
          n.type === "function_application" ||
          n.type === "parenthesized_expression" ||
          n.type === "array_constructor"
        );
      };

      const exprParts: Doc[] = [operands[0]];

      for (let i = 0; i < ops.length; i++) {
        const operand = operands[i + 1];
        const operandNode = operandNodes[i + 1];

        if (operandNode && isHuggable(operandNode)) {
          const option3: Doc = inContinuation
            ? [" ", ops[i], group([line, operand])]
            : [" ", ops[i], indent(group([line, operand]))];
          // For option 2: parenthesized_expression with if_expression needs indent wrapper
          // BUT only if the binary expression itself is NOT in continuation context
          // If binary expression is already in continuation context (e.g., inside another paren),
          // the parent already provides indent, so don't add another
          const option2Operand =
            operandNode.type === "parenthesized_expression" &&
            !inContinuation &&
            parenContainsIfExpression(operandNode)
              ? indent(group(operand, { shouldBreak: true }))
              : operandNode.type === "function_application"
              ? group(operand, { shouldBreak: true })
              : group(operand, { shouldBreak: true });
          exprParts.push(
            conditionalGroup([
              [" ", ops[i], " ", operand],
              [" ", ops[i], " ", option2Operand],
              option3,
            ]),
          );
        } else {
          if (inContinuation) {
            exprParts.push(" ", ops[i], group([line, operand]));
          } else {
            exprParts.push(" ", ops[i], indent(group([line, operand])));
          }
        }
      }

      return group(exprParts);
    }

    // Comparison operators
    const comparisonOperators = ["==", "<>", "<", ">", "<=", ">="];
    if (comparisonOperators.includes(operator)) {
      const commentDocs: Doc[] = commentIndices.map((ci) =>
        path.call(print, "children", ci),
      );
      const leftDoc = path.call(print, "children", leftIdx);
      const rightDoc = path.call(print, "children", rightIdx);
      if (commentDocs.length > 0) {
        return group([
          leftDoc,
          hardline,
          join(hardline, commentDocs),
          " ",
          operator,
          wrapContinuation(rightDoc, path),
        ]);
      }
      return group([
        leftDoc,
        " ",
        operator,
        wrapContinuation(rightDoc, path),
      ]);
    }

    // Other operators
    const commentDocs: Doc[] = commentIndices.map((ci) =>
      path.call(print, "children", ci),
    );
    const leftDoc = path.call(print, "children", leftIdx);
    const rightDoc = path.call(print, "children", rightIdx);
    if (commentDocs.length > 0) {
      return group([
        leftDoc,
        hardline,
        join(hardline, commentDocs),
        " ",
        operator,
        group([line, rightDoc]),
      ]);
    }
    return group([leftDoc, " ", operator, group([line, rightDoc])]);
  }

  // Fallback
  return printChildrenWithSpaces(path, print);
}

/**
 * Print unary_expression node
 */
export function printUnaryExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "not") {
      parts.push("not ");
    } else if (
      child.type === "-" ||
      child.type === "+" ||
      child.type === ".-" ||
      child.type === ".+"
    ) {
      parts.push(child.text ?? child.type);
    } else {
      parts.push(path.call(print, "children", i));
    }
  }
  return parts;
}

/**
 * Print primary_expression node
 */
export function printPrimaryExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printChildren(path, print);
}

/**
 * Print end_expression node
 */
export function printEndExpression(
  _path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  return "end";
}

/**
 * Print literal_expression node
 */
export function printLiteralExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  if (node.children.length === 0) {
    return node.text ?? "";
  }
  return printChildren(path, print);
}

/**
 * Print string_literal_expression node
 */
export function printStringLiteralExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  if (node.children.length === 0) {
    return node.text ?? "";
  }
  return printChildren(path, print);
}

/**
 * Print unsigned_integer_literal_expression node
 */
export function printUnsignedIntegerLiteralExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  if (node.children.length === 0) {
    return node.text ?? "";
  }
  return printChildren(path, print);
}

/**
 * Print unsigned_real_literal_expression node
 */
export function printUnsignedRealLiteralExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  if (node.children.length === 0) {
    return node.text ?? "";
  }
  return printChildren(path, print);
}

/**
 * Print logical_literal_expression node
 */
export function printLogicalLiteralExpression(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}

/**
 * Print parenthesized_expression node
 */
export function printParenthesizedExpression(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const content = path.map(print, "children");
  return group(["(", content, ")"]);
}

/**
 * Print output_expression_list node
 * 
 * Handles the case where some output slots are empty, indicated by
 * consecutive commas or a leading comma. For example:
 *   (,labels,cluSiz) - empty first slot
 *   (a,,c) - empty middle slot
 * 
 * Uses the raw tree-sitter node to access comma tokens that are
 * normally filtered out by the parser.
 */
export function printOutputExpressionList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const syntaxNode = node._syntaxNode;
  
  // If we don't have access to the raw syntax node, fall back to simple join
  if (!syntaxNode) {
    return join([",", line], path.map(print, "children"));
  }
  
  // Build a map from expression positions to their printed representations
  const exprMap = new Map<string, { index: number }>();
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const key = `${child.range.start.row}:${child.range.start.column}`;
    exprMap.set(key, { index: i });
  }
  
  const parts: Doc[] = [];
  
  // Iterate through all children of the raw syntax node (including commas)
  for (let i = 0; i < syntaxNode.childCount; i++) {
    const rawChild = syntaxNode.child(i);
    if (!rawChild) continue;
    
    if (rawChild.type === ",") {
      // Add comma - space will come before next expression
      parts.push(",");
    } else if (rawChild.isNamed) {
      // Expression - add line break before if after a comma
      if (parts.length > 0) {
        parts.push(line);
      }
      // Find and print the corresponding AST child
      const key = `${rawChild.startPosition.row}:${rawChild.startPosition.column}`;
      const exprInfo = exprMap.get(key);
      if (exprInfo !== undefined) {
        parts.push(path.call(print, "children", exprInfo.index));
      }
    }
  }
  
  return parts;
}

/**
 * Print expression_list node
 */
export function printExpressionList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(", ", path.map(print, "children"));
}
