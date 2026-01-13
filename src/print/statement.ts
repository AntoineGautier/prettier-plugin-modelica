/**
 * Statement/algorithm handlers for Modelica printer
 * Handles: algorithm_section, statement_list, assignment_statement, break_statement, return_statement, while_statement, for_statement, if_statement, else_if_statement_clause_list, else_if_statement_clause, when_statement, else_when_statement_clause_list, else_when_statement_clause, function_application_statement, multiple_output_function_application_statement
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
  printChildren,
  type PrintFn,
} from "./utils.js";

/**
 * Print algorithm_section node
 */
export function printAlgorithmSection(
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
    if (child.type === "statement_list") {
      content.push(path.call(print, "children", i));
    } else if (child.type === "comment" || child.type === "BLOCK_COMMENT") {
      content.push(path.call(print, "children", i));
    }
  }

  parts.push(isInitial ? "initial algorithm" : "algorithm");
  if (content.length > 0) {
    parts.push(indent([line, join(hardline, content)]));
  }
  return parts;
}

/**
 * Print statement_list node
 */
export function printStatementList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(hardline, path.map(print, "children"));
}

/**
 * Print assignment_statement node
 */
export function printAssignmentStatement(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];
  let hasRef = false;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "component_reference") {
      parts.push(path.call(print, "children", i));
      hasRef = true;
    } else if (
      child.type === "expression" ||
      child.type === "simple_expression"
    ) {
      if (hasRef) {
        parts.push(" := ");
      }
      parts.push(path.call(print, "children", i));
    } else if (child.type === "description_string") {
      parts.push(
        formatTrailingDescription(path.call(print, "children", i)),
      );
    } else if (child.type === "comment") {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "annotation_clause") {
      parts.push(indent([hardline, path.call(print, "children", i)]));
    }
  }
  parts.push(";");
  return group(parts);
}

/**
 * Print break_statement node
 */
export function printBreakStatement(
  _path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  return "break;";
}

/**
 * Print return_statement node
 */
export function printReturnStatement(
  _path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  return "return;";
}

/**
 * Print while_statement node
 */
export function printWhileStatement(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = ["while "];
  const body: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "expression") {
      parts.push(path.call(print, "children", i), " loop");
    } else if (child.type === "statement_list") {
      body.push(path.call(print, "children", i));
    } else if (isComment(child)) {
      // Comments between 'loop' and statement_list
      body.push(path.call(print, "children", i));
    }
  }

  parts.push(indent([line, join(hardline, body)]));
  parts.push(hardline, "end while;");
  return group(parts);
}

/**
 * Print for_statement node
 */
export function printForStatement(
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
    } else if (child.type === "statement_list") {
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
 * Print if_statement node
 */
export function printIfStatement(
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
      // 'then' already consumed
    } else if (child.type === "else") {
      parts.push(hardline, "else", ...maybeTrailingComment());
    } else if (isComment(child)) {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "statement_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "else_if_statement_clause_list") {
      parts.push(hardline, path.call(print, "children", i));
    } else if (child.type === "else_clause") {
      parts.push(hardline, path.call(print, "children", i));
    }
  }

  parts.push(hardline, "end if;");
  return group(parts);
}

/**
 * Print else_if_statement_clause_list node
 */
export function printElseIfStatementClauseList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(hardline, path.map(print, "children"));
}

/**
 * Print else_if_statement_clause node
 */
export function printElseIfStatementClause(
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
            indent(condExpr),
            line,
            "then",
            ...thenComment,
          ]),
        );
      } else {
        parts.push(group(["elseif ", indent(condExpr), line, "then"]));
      }
    } else if (child.type === "then") {
      // 'then' already consumed
    } else if (isComment(child)) {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "statement_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    }
  }
  return parts;
}

/**
 * Print when_statement node
 */
export function printWhenStatement(
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
        parts.push("when ", path.call(print, "children", i));
        seenCondition = true;
      } else {
        parts.push(path.call(print, "children", i));
      }
    } else if (child.type === "then") {
      parts.push(" then", ...maybeTrailingComment());
    } else if (isComment(child)) {
      parts.push(" ", path.call(print, "children", i));
    } else if (child.type === "statement_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    } else if (child.type === "else_when_statement_clause_list") {
      parts.push(hardline, path.call(print, "children", i));
    }
  }

  parts.push(hardline, "end when;");
  return group(parts);
}

/**
 * Print else_when_statement_clause_list node
 */
export function printElseWhenStatementClauseList(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return join(hardline, path.map(print, "children"));
}

/**
 * Print else_when_statement_clause node
 */
export function printElseWhenStatementClause(
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
    } else if (child.type === "statement_list") {
      parts.push(indent([line, path.call(print, "children", i)]));
    }
  }
  return parts;
}

/**
 * Print function_application_statement node
 */
export function printFunctionApplicationStatement(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  return [...printChildren(path, print), ";"];
}

/**
 * Print multiple_output_function_application_statement node
 */
export function printMultipleOutputFunctionApplicationStatement(
  path: AstPath<ASTNode>,
  _options: object,
  print: PrintFn,
): Doc {
  const node = path.getValue();
  const parts: Doc[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "parenthesized_expression") {
      parts.push(path.call(print, "children", i));
    } else if (child.type === "output_expression_list") {
      parts.push("(", path.call(print, "children", i), ")");
    } else if (child.type === "component_reference") {
      parts.push(" := ", path.call(print, "children", i));
    } else if (child.type === "function_application") {
      parts.push(" := ", path.call(print, "children", i));
    } else if (child.type === "function_call_args") {
      parts.push(path.call(print, "children", i));
    }
  }

  parts.push(";");
  return parts;
}
