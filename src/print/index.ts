/**
 * Main router for Modelica printer
 * Delegates to specialized handler modules based on node type
 */

import type { AstPath, Doc, Printer } from "prettier";
import type { ASTNode } from "../parser.js";
import { printChildrenWithSpaces, type PrintFn } from "./utils.js";

// Import terminal handlers
import {
  printIdent,
  printUnsignedInteger,
  printUnsignedReal,
  printString,
  printBlockComment,
  printComment,
} from "./terminal.js";

// Import class handlers
import {
  printStoredDefinitions,
  printStoredDefinition,
  printWithinClause,
  printClassDefinition,
  printClassPrefixes,
  printLongClassSpecifier,
  printShortClassSpecifier,
  printDerivativeClassSpecifier,
  printExtendsClassSpecifier,
  printEnumerationClassSpecifier,
  printEnumList,
  printEnumerationLiteral,
  printBasePrefix,
} from "./class.js";

// Import element handlers
import {
  printElementList,
  printPublicElementList,
  printProtectedElementList,
  printNamedElement,
  printImportClause,
  printImportList,
  printExtendsClause,
  printConstrainingClause,
} from "./element.js";

// Import component handlers
import {
  printComponentClause,
  printComponentList,
  printComponentDeclaration,
  printConditionAttribute,
  printDeclaration,
} from "./component.js";

// Import modification handlers
import {
  printModification,
  printClassModification,
  printArgumentList,
  printElementModification,
  printElementReplaceable,
  printClassRedeclaration,
  printComponentRedeclaration,
  printShortClassDefinition,
} from "./modification.js";

// Import equation handlers
import {
  printEquationSection,
  printEquationList,
  printSimpleEquation,
  printConnectClause,
  printForEquation,
  printForIndices,
  printForIndex,
  printIfEquation,
  printElseIfEquationClauseList,
  printElseIfEquationClause,
  printWhenEquation,
  printElseWhenEquationClauseList,
  printElseWhenEquationClause,
  printFunctionApplicationEquation,
} from "./equation.js";

// Import statement handlers
import {
  printAlgorithmSection,
  printStatementList,
  printAssignmentStatement,
  printBreakStatement,
  printReturnStatement,
  printWhileStatement,
  printForStatement,
  printIfStatement,
  printElseIfStatementClauseList,
  printElseIfStatementClause,
  printWhenStatement,
  printElseWhenStatementClauseList,
  printElseWhenStatementClause,
  printFunctionApplicationStatement,
  printMultipleOutputFunctionApplicationStatement,
} from "./statement.js";

// Import expression handlers
import {
  printExpression,
  printIfExpression,
  printElseIfClause,
  printSimpleExpression,
  printRangeExpression,
  printBinaryExpression,
  printUnaryExpression,
  printPrimaryExpression,
  printEndExpression,
  printLiteralExpression,
  printStringLiteralExpression,
  printUnsignedIntegerLiteralExpression,
  printUnsignedRealLiteralExpression,
  printLogicalLiteralExpression,
  printParenthesizedExpression,
  printOutputExpressionList,
  printExpressionList,
} from "./expression.js";

// Import array handlers
import {
  printArrayConstructor,
  printArrayArguments,
  printArrayConcatenation,
  printArrayComprehension,
  printArraySubscripts,
  printSubscript,
} from "./array.js";

// Import function handlers
import {
  printFunctionApplication,
  printFunctionCallArgs,
  printFunctionArguments,
  printNamedArguments,
  printNamedArgument,
  printFunctionPartialApplication,
} from "./function.js";

// Import name handlers
import {
  printName,
  printComponentReference,
  printTypeSpecifier,
} from "./name.js";

// Import annotation handlers
import {
  printDescriptionString,
  printAnnotationClause,
  printExternalClause,
  printLanguageSpecification,
  printExternalFunction,
} from "./annotation.js";

// Type for print handler functions
type PrintHandler = (
  path: AstPath<ASTNode>,
  options: object,
  print: PrintFn,
) => Doc;

// Map of node types to handler functions
const handlers: Record<string, PrintHandler> = {
  // Terminal nodes
  IDENT: printIdent,
  UNSIGNED_INTEGER: printUnsignedInteger,
  UNSIGNED_REAL: printUnsignedReal,
  STRING: printString,
  BLOCK_COMMENT: printBlockComment,
  comment: printComment,

  // Class definitions
  stored_definitions: printStoredDefinitions,
  stored_definition: printStoredDefinition,
  within_clause: printWithinClause,
  class_definition: printClassDefinition,
  class_prefixes: printClassPrefixes,
  long_class_specifier: printLongClassSpecifier,
  short_class_specifier: printShortClassSpecifier,
  derivative_class_specifier: printDerivativeClassSpecifier,
  extends_class_specifier: printExtendsClassSpecifier,
  enumeration_class_specifier: printEnumerationClassSpecifier,
  enum_list: printEnumList,
  enumeration_literal: printEnumerationLiteral,
  base_prefix: printBasePrefix,

  // Element lists
  element_list: printElementList,
  public_element_list: printPublicElementList,
  protected_element_list: printProtectedElementList,
  named_element: printNamedElement,
  import_clause: printImportClause,
  import_list: printImportList,
  extends_clause: printExtendsClause,
  constraining_clause: printConstrainingClause,

  // Components
  component_clause: printComponentClause,
  component_list: printComponentList,
  component_declaration: printComponentDeclaration,
  condition_attribute: printConditionAttribute,
  declaration: printDeclaration,

  // Modifications
  modification: printModification,
  class_modification: printClassModification,
  argument_list: printArgumentList,
  element_modification: printElementModification,
  element_replaceable: printElementReplaceable,
  class_redeclaration: printClassRedeclaration,
  component_redeclaration: printComponentRedeclaration,
  short_class_definition: printShortClassDefinition,

  // Equations
  equation_section: printEquationSection,
  equation_list: printEquationList,
  simple_equation: printSimpleEquation,
  connect_clause: printConnectClause,
  for_equation: printForEquation,
  for_indices: printForIndices,
  for_index: printForIndex,
  if_equation: printIfEquation,
  else_if_equation_clause_list: printElseIfEquationClauseList,
  else_if_equation_clause: printElseIfEquationClause,
  when_equation: printWhenEquation,
  else_when_equation_clause_list: printElseWhenEquationClauseList,
  else_when_equation_clause: printElseWhenEquationClause,
  function_application_equation: printFunctionApplicationEquation,

  // Statements
  algorithm_section: printAlgorithmSection,
  statement_list: printStatementList,
  assignment_statement: printAssignmentStatement,
  break_statement: printBreakStatement,
  return_statement: printReturnStatement,
  while_statement: printWhileStatement,
  for_statement: printForStatement,
  if_statement: printIfStatement,
  else_if_statement_clause_list: printElseIfStatementClauseList,
  else_if_statement_clause: printElseIfStatementClause,
  when_statement: printWhenStatement,
  else_when_statement_clause_list: printElseWhenStatementClauseList,
  else_when_statement_clause: printElseWhenStatementClause,
  function_application_statement: printFunctionApplicationStatement,
  multiple_output_function_application_statement:
    printMultipleOutputFunctionApplicationStatement,

  // Expressions
  expression: printExpression,
  if_expression: printIfExpression,
  else_if_clause: printElseIfClause,
  simple_expression: printSimpleExpression,
  range_expression: printRangeExpression,
  binary_expression: printBinaryExpression,
  unary_expression: printUnaryExpression,
  primary_expression: printPrimaryExpression,
  end_expression: printEndExpression,
  literal_expression: printLiteralExpression,
  string_literal_expression: printStringLiteralExpression,
  unsigned_integer_literal_expression: printUnsignedIntegerLiteralExpression,
  unsigned_real_literal_expression: printUnsignedRealLiteralExpression,
  logical_literal_expression: printLogicalLiteralExpression,
  parenthesized_expression: printParenthesizedExpression,
  output_expression_list: printOutputExpressionList,
  expression_list: printExpressionList,

  // Arrays
  array_constructor: printArrayConstructor,
  array_arguments: printArrayArguments,
  array_concatenation: printArrayConcatenation,
  array_comprehension: printArrayComprehension,
  array_subscripts: printArraySubscripts,
  subscript: printSubscript,

  // Function calls
  function_application: printFunctionApplication,
  function_call_args: printFunctionCallArgs,
  function_arguments: printFunctionArguments,
  named_arguments: printNamedArguments,
  named_argument: printNamedArgument,
  function_partial_application: printFunctionPartialApplication,

  // Names and references
  name: printName,
  component_reference: printComponentReference,
  type_specifier: printTypeSpecifier,

  // Annotations
  description_string: printDescriptionString,
  annotation_clause: printAnnotationClause,
  external_clause: printExternalClause,
  language_specification: printLanguageSpecification,
  external_function: printExternalFunction,
};

/**
 * Main print function for Modelica AST
 */
export const printModelica: Printer<ASTNode>["print"] = (
  path: AstPath<ASTNode>,
  options: object,
  print: (path: AstPath<ASTNode>) => Doc,
): Doc => {
  const node = path.getValue();

  if (!node) {
    return "";
  }

  // Look up handler for this node type
  const handler = handlers[node.type];
  if (handler) {
    return handler(path, options, print);
  }

  // Default fallback for unhandled node types
  if (!node.children || node.children.length === 0) {
    return node.text ?? "";
  }
  return printChildrenWithSpaces(path, print);
};
