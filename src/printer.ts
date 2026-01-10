/**
 * Prettier printer for Modelica AST
 * Entry point that delegates to modular print handlers
 */

import type { AstPath, Doc } from "prettier";
import type { ASTNode } from "./parser.js";
import { DEFAULT_PRESERVED_TAGS } from "./html-formatter.js";
import { isInsideAnnotation, isInsideNamedElement } from "./print/utils.js";
import {
  setUsePrettierHTMLFormatter as setTerminalHTMLFormatter,
  getUsePrettierHTMLFormatter,
} from "./print/terminal.js";

// Re-export the main print function from the modular structure
export { printModelica } from "./print/index.js";

// ===========================================
// HTML Formatter Configuration
// ===========================================

/**
 * Toggle between embed formatter (Prettier's HTML parser) and builtin formatter.
 * - true: Use Prettier's HTML parser via embed (default, better formatting)
 * - false: Use builtin html-formatter.ts (no embed, simpler but less capable)
 */
export let usePrettierHTMLFormatter = true;

/**
 * Set whether to use the embed HTML formatter or the builtin formatter.
 * @param useEmbed - true for embed formatter, false for builtin
 */
export function setUsePrettierHTMLFormatter(useEmbed: boolean): void {
  usePrettierHTMLFormatter = useEmbed;
  // Also update the terminal module's copy
  setTerminalHTMLFormatter(useEmbed);
}

// Track reported HTML errors to prevent duplication
const reportedHTMLErrors = new Set<string>();

/**
 * Embed function for Prettier HTML formatter integration
 * This allows HTML in Modelica annotations to be formatted using Prettier's built-in HTML parser
 */
export function embedHTML(path: AstPath<ASTNode>, _options: any) {
  // Skip embed when using builtin formatter
  if (!getUsePrettierHTMLFormatter()) {
    return null;
  }

  const node = path.getValue();

  // Only process STRING nodes that contain HTML in annotations
  if (node.type !== "STRING") {
    return null;
  }

  const text = node.text ?? "";
  if (!text.includes("<html>")) {
    return null;
  }

  // Check if we're inside an annotation
  if (!isInsideAnnotation(path)) {
    return null;
  }

  // Check if we're inside a named_element (nested annotation) vs top-level class annotation
  const insideNamedElement = isInsideNamedElement(path);

  // Extract string content (remove outer quotes)
  const match = text.match(/^"(.*)"$/s);
  if (!match) {
    return null;
  }

  const htmlContent = match[1];

  // Return an async function that Prettier will call
  return async (
    _textToDoc: (text: string, options: any) => Promise<Doc>,
    _print: (path: AstPath<ASTNode>) => Doc,
    _path: AstPath<ASTNode>,
    opts: any,
  ): Promise<Doc | undefined> => {
    try {
      // Step 1: Prepare HTML (extract preserved blocks, de-escape quotes)
      const { prepareHTMLForPrettier, postProcessHTMLFromPrettier } =
        await import("./html-embed-formatter.js");
      const { processedHtml, preservedBlocks } = prepareHTMLForPrettier(
        htmlContent,
        DEFAULT_PRESERVED_TAGS,
      );

      // Step 2: Format with Prettier's HTML parser
      const prettier = await import("prettier");
      const formattedHtml = await prettier.default.format(processedHtml, {
        parser: "html",
        printWidth: opts.printWidth || 80,
        htmlWhitespaceSensitivity: "css",
      });

      // Step 3: Post-process (restore preserved blocks, re-escape quotes)
      // Trim indent only for top-level annotations (NOT inside named_element)
      const finalHtml = postProcessHTMLFromPrettier(
        formattedHtml,
        preservedBlocks,
        !insideNamedElement,
      );

      // Step 4: Return as a Doc (string wrapped in quotes)
      return `"${finalHtml}"`;
    } catch (error) {
      // Write clear error message to stderr (deduplicated)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorKey = `${htmlContent.substring(0, 100)}:${errorMessage.substring(0, 100)}`;

      // Only report each unique error once
      if (!reportedHTMLErrors.has(errorKey)) {
        reportedHTMLErrors.add(errorKey);

        console.error("\n" + "=".repeat(80));
        console.error("ERROR: HTML formatting failed in Modelica annotation");
        console.error("=".repeat(80));
        console.error(errorMessage);
        console.error("\n" + "=".repeat(80));
      }

      // Throw error to stop formatting completely
      throw new Error(`HTML formatting failed: ${errorMessage}`);
    }
  };
}
