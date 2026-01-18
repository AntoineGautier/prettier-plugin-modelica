/**
 * Terminal node handlers for Modelica printer
 * Handles: IDENT, UNSIGNED_INTEGER, UNSIGNED_REAL, STRING, BLOCK_COMMENT, comment
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "../parser.js";
import { formatBlockComment, isInsideAnnotation, isPartOfStringConcatenation, type PrintFn } from "./utils.js";
import { formatHTMLString, DEFAULT_PRESERVED_TAGS } from "./html-formatter.js";

// HTML formatter toggle - will be set from printer.ts
let usePrettierHTMLFormatter = true;

export function setUsePrettierHTMLFormatter(useEmbed: boolean): void {
  usePrettierHTMLFormatter = useEmbed;
}

export function getUsePrettierHTMLFormatter(): boolean {
  return usePrettierHTMLFormatter;
}

/**
 * Print IDENT node
 */
export function printIdent(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}

/**
 * Print UNSIGNED_INTEGER node
 */
export function printUnsignedInteger(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}

/**
 * Print UNSIGNED_REAL node
 */
export function printUnsignedReal(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}

/**
 * Print STRING node
 * Handles HTML content in annotations specially
 */
export function printString(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  const text = node.text ?? "";

  // Check if this is HTML documentation in an annotation
  const inAnnotation = isInsideAnnotation(path);
  if (inAnnotation && text.includes("<html>")) {
    // Skip HTML formatting for concatenated strings (may have incomplete HTML)
    if (isPartOfStringConcatenation(path)) {
      console.warn("⚠ Skipping HTML formatting for concatenated string (may have incomplete HTML tags)");
      return text;
    }
    
    if (usePrettierHTMLFormatter) {
      // HTML formatting is handled by embedHTML - if we reach here with HTML content,
      // it means the embed formatter failed and Prettier fell back to print.
      throw new Error(
        "HTML formatting failed: embed formatter error (see above for details)",
      );
    } else {
      // Use builtin formatter (no embed)
      const match = text.match(/^"(.*)"$/s);
      if (match) {
        const htmlContent = match[1];
        const formatted = formatHTMLString(htmlContent, {
          maxWidth: 80,
          baseIndent: "",
          removeEmptyLines: true,
          preservedTags: DEFAULT_PRESERVED_TAGS,
        });
        return `"${formatted}"`;
      }
    }
  }

  return text;
}

/**
 * Print BLOCK_COMMENT node
 */
export function printBlockComment(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  const text = node.text ?? "";
  return formatBlockComment(text);
}

/**
 * Print comment node (line comment)
 */
export function printComment(
  path: AstPath<ASTNode>,
  _options: object,
  _print: PrintFn,
): Doc {
  const node = path.getValue();
  return node.text ?? "";
}
