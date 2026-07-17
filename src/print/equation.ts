/**
 * Equation handlers for Modelica printer
 * Handles: equation_section, equation_list, simple_equation, connect_clause, for_equation, for_indices, for_index, if_equation, else_if_equation_clause_list, else_if_equation_clause, when_equation, else_when_equation_clause_list, else_when_equation_clause, function_application_equation
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import {
  group,
  indent,
  line,
  hardline,
  join,
  formatTrailingDescription,
  isComment,
  onSameLine,
  printAtPosition,
  printChildren,
  printListWithInlineComments,
  type PrintFn,
} from "./utils.js";

/**
 * Print equation_section node
 */
export function printEquationSection(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  const isInitial = (node.text ?? "").trimStart().startsWith("initial");
  const content: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "equation_list") {
      content.push(path.call(print, "children", i));
    } else if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
      content.push(path.call(print, "children", i));
    }
  }

  parts.push(isInitial ? "initial equation" : "equation");
  if (content.length > 0) {
    parts.push(indent([line, join(hardline, content)]));
  }
  return parts;
}

/**
 * Print equation_list node
 */
export function printEquationList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return printListWithInlineComments(path, print);
}

/**
 * Print simple_equation node
 */
export function printSimpleEquation(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const exprChildren = node.children.filter(
    (c) => c.type === "simple_expression" || c.type === "expression",
  );

  if (exprChildren.length === 2) {
    const result: Doc[] = [];
    let firstExprDone = false;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (
        (child.type === "simple_expression" ||
          child.type === "expression") &&
        !firstExprDone
      ) {
        result.push(path.call(print, "children", i), " = ");
        firstExprDone = true;
      } else if (
        child.type === "simple_expression" ||
        child.type === "expression"
      ) {
        // The right-hand side is glued after `lhs = ` and indents its own
        // continuation lines.
        const idx = i;
        result.push(
          printAtPosition("mid-line", () => path.call(print, "children", idx)),
        );
      } else if (child.type === "description_string") {
        result.push(
          formatTrailingDescription(path.call(print, "children", i)),
        );
      } else if (child.type === "comment") {
        result.push(" ", path.call(print, "children", i));
      }
    }
    result.push(";");
    return group(result);
  }

  const parts: Doc[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "simple_expression" || child.type === "expression") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "description_string") {
      parts.push(
        formatTrailingDescription(path.call(print, "children", i)),
      );
    } else if (child.type === "comment") {
      parts.push(" ", path.call(print, "children", i));
    }
  }
  parts.push(";");
  return group(parts);
}

/**
 * Print connect_clause node
 */
export function printConnectClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["connect("];
  const args: Doc[] = [];
  let hasAnnotation = false;
  let descriptionDoc: Doc | null = null;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "component_reference") {
      args.push(path.call(print, "children", i));
    } else if (child.type === "description_string") {
      descriptionDoc = path.call(print, "children", i);
    } else if (child.type === "annotation_clause") {
      hasAnnotation = true;
      parts.push(join(", ", args), ")");
      if (descriptionDoc) {
        parts.push(" ", descriptionDoc);
      }
      parts.push(indent([hardline, path.call(print, "children", i)]));
      parts.push(";");
    }
  }

  if (!hasAnnotation) {
    parts.push(join(", ", args), ")");
    if (descriptionDoc) {
      parts.push(" ", descriptionDoc);
    }
    parts.push(";");
  }
  return parts;
}

/**
 * Print for_equation node
 */
export function printForEquation(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["for "];
  const body: Doc[] = [];
  let forIndicesNode: ASTNode | null = null;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "for_indices") {
      forIndicesNode = child;
      parts.push(path.call(print, "children", i), " loop");
    } else if (child.type === "equation_list") {
      body.push(path.call(print, "children", i));
    } else if (isComment(child)) {
      if (forIndicesNode && onSameLine(forIndicesNode, child)) {
        // Comment on same line as 'loop' stays inline
        parts.push(" ", path.call(print, "children", i));
      } else {
        // Comments on different line go into the body
        body.push(path.call(print, "children", i));
      }
    }
  }

  parts.push(indent([line, join(hardline, body)]));
  parts.push(hardline, "end for;");
  return group(parts);
}

/**
 * Print for_indices node
 */
export function printForIndices(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(", ", path.map(print, "children"));
}

/**
 * Print for_index node
 */
export function printForIndex(
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
    } else if (child.type === "in") {
      // Skip - we add "in" manually below
    } else if (
      child.type === "expression" ||
      child.type === "simple_expression"
    ) {
      parts.push(" in ", path.call(print, "children", i));
    }
  }
  return parts;
}

/**
 * Print if_equation node
 */
export function printIfEquation(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    const maybeTrailingComment = (): Doc[] => {
      if (i + 1 < node.children.length) {
        const nextChild = node.children[i + 1];
        if (isComment(nextChild) && onSameLine(child, nextChild)) {
          i++;
          return [" ", path.call(print, "children", i)];
        }
      }
      return [];
    };

    if (child.type === "expression") {
      const condExpr = path.call(print, "children", i);
      if (
        i + 1 < node.children.length &&
        node.children[i + 1].type === "then"
      ) {
        i++;
        const thenComment = maybeTrailingComment();
        parts.push(group(["if ", condExpr, line, "then", ...thenComment]));
      } else {
        parts.push(group(["if ", condExpr, line, "then"]));
      }
    } else if (child.type === "then") {
      // 'then' already consumed with expression above
    } else if (child.type === "else") {
      parts.push(hardline, "else", ...maybeTrailingComment());
    } else if (isComment(child)) {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "equation_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "else_if_equation_clause_list") {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "else_clause") {
      parts.push(hardline, path.call(print, "children", i));
    }
  }

  parts.push(hardline, "end if;");
  return group(parts);
}

/**
 * Print else_if_equation_clause_list node
 */
export function printElseIfEquationClauseList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(hardline, path.map(print, "children"));
}

/**
 * Print else_if_equation_clause node
 */
export function printElseIfEquationClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    const maybeTrailingComment = (): Doc[] => {
      if (i + 1 < node.children.length) {
        const nextChild = node.children[i + 1];
        if (isComment(nextChild) && onSameLine(child, nextChild)) {
          i++;
          return [" ", path.call(print, "children", i)];
        }
      }
      return [];
    };

    if (child.type === "expression") {
      const condExpr = path.call(print, "children", i);
      if (
        i + 1 < node.children.length &&
        node.children[i + 1].type === "then"
      ) {
        i++;
        const thenComment = maybeTrailingComment();
        parts.push(
          group([
            "elseif ",
            condExpr,
            line,
            "then",
            ...thenComment,
          ]),
        );
      } else {
        parts.push(group(["elseif ", condExpr, line, "then"]));
      }
    } else if (child.type === "then") {
      // 'then' already consumed
    } else if (isComment(child)) {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "equation_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    }
  }
  return parts;
}

/**
 * Print when_equation node
 */
export function printWhenEquation(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  const body: Doc[] = [];
  let seenCondition = false;
  let thenNode: ASTNode | null = null;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    if (child.type === "expression") {
      if (!seenCondition) {
        parts.push("when ", path.call(print, "children", i));
        seenCondition = true;
      } else {
        parts.push(path.call(print, "children", i));
      }
    } else if (child.type === "then") {
      parts.push(" then");
      thenNode = child;
    } else if (isComment(child)) {
      if (thenNode && onSameLine(thenNode, child)) {
        // Comment on same line as 'then' stays inline
        parts.push(" ", path.call(print, "children", i));
      } else if (thenNode) {
        // Comments after 'then' on different line go into the body
        body.push(path.call(print, "children", i));
      } else {
        parts.push(" ", path.call(print, "children", i));
      }
    } else if (child.type === "equation_list") {
      body.push(path.call(print, "children", i));
    } else if (child.type === "else_when_equation_clause_list") {
      if (body.length > 0) {
        parts.push(indent([line, join(hardline, body)]));
      }
      parts.push(hardline, path.call(print, "children", i));
      return group([...parts, hardline, "end when;"]);
    }
  }

  if (body.length > 0) {
    parts.push(indent([line, join(hardline, body)]));
  }
  parts.push(hardline, "end when;");
  return group(parts);
}

/**
 * Print else_when_equation_clause_list node
 */
export function printElseWhenEquationClauseList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(hardline, path.map(print, "children"));
}

/**
 * Print else_when_equation_clause node
 */
export function printElseWhenEquationClause(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  let seenCondition = false;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    const maybeTrailingComment = (): Doc[] => {
      if (i + 1 < node.children.length) {
        const nextChild = node.children[i + 1];
        if (isComment(nextChild) && onSameLine(child, nextChild)) {
          i++;
          return [" ", path.call(print, "children", i)];
        }
      }
      return [];
    };

    if (child.type === "expression") {
      if (!seenCondition) {
        parts.push("elsewhen ", path.call(print, "children", i));
        seenCondition = true;
      } else {
        parts.push(path.call(print, "children", i));
      }
    } else if (child.type === "then") {
      parts.push(" then", ...maybeTrailingComment());
    } else if (isComment(child)) {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "equation_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    }
  }
  return parts;
}

/**
 * Print function_application_equation node
 */
export function printFunctionApplicationEquation(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return [...printChildren(path, print), ";"];
}
