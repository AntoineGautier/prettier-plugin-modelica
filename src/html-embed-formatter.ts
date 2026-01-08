/**
 * HTML embed formatter using Prettier's built-in HTML parser
 * This is an alternative to the manual html-formatter.ts
 * Uses Prettier's embed feature to delegate HTML formatting to the HTML parser
 */

import { DEFAULT_PRESERVED_TAGS } from "./html-formatter.js";

export interface HTMLEmbedFormatterOptions {
  preservedTags?: string[];
}

interface PreservedBlock {
  placeholder: string;
  content: string;
}

/**
 * Prepare HTML for Prettier formatting
 * Extracts preserved blocks and de-escapes quotes
 */
export function prepareHTMLForPrettier(
  html: string,
  preservedTags: string[] = DEFAULT_PRESERVED_TAGS,
): { processedHtml: string; preservedBlocks: PreservedBlock[] } {
  // 1. Extract preserved blocks
  const { processedHtml, preservedBlocks } = extractPreservedBlocks(
    html,
    preservedTags,
  );

  // 2. De-escape quotes for Prettier
  const unescaped = deescapeQuotes(processedHtml);

  return { processedHtml: unescaped, preservedBlocks };
}

/**
 * Post-process HTML after Prettier formatting
 * Removes base indent, re-escapes quotes and restores preserved blocks
 */
export function postProcessHTMLFromPrettier(
  html: string,
  preservedBlocks: PreservedBlock[],
): string {
  // 1. Remove Prettier's 2-space base indent from each line
  const trimmedIndent = trimBaseIndent(html);

  // 3. Re-escape quotes
  const reescaped = reescapeQuotes(trimmedIndent);

  // 4. Restore preserved blocks
  const restoredPreserved = restorePreservedBlocks(reescaped, preservedBlocks);

  const final = formatAnchorTags(restoredPreserved);

  return final;
}

/**
 * Add newlines around anchor tags:
 * - Newline before <a if preceded by non-empty content (preserving indent)
 * - Newline after </a> if followed by whitespace (not punctuation like . , etc.)
 */
function formatAnchorTags(html: string): string {
  const lines = html.split("\n");
  const result: string[] = [];
  let insideAnchor = false;
  let anchorIndent = "";

  for (const line of lines) {
    // Get the current line's indent
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";

    let processedLine = line;

    // Check if this line opens an anchor tag
    if (/<a\s/.test(processedLine) && !/<\/a>/.test(processedLine)) {
      // Anchor opens but doesn't close on this line
      insideAnchor = true;
      anchorIndent = indent;
    }

    // If we're inside an anchor (content line between <a> and </a>), add indent
    if (insideAnchor && !/<a\s/.test(processedLine)) {
      // This is a continuation line inside the anchor - add extra indent
      processedLine = anchorIndent + "  " + processedLine.trimStart();
    }

    // Check if this line closes the anchor
    if (/<\/a>/.test(processedLine)) {
      insideAnchor = false;
    }

    // Add newline before <a if there's content before it (not at start of line)
    // Capture the indent and content before <a, then put <a on new line with same indent
    processedLine = processedLine.replace(
      /^(\s*)(.+?)(\s*)(<a\s)/g,
      `$1$2\n${indent}$4`,
    );

    result.push(processedLine);
  }

  return result.join("\n");
}

/**
 * Remove 2-space base indent from each line of HTML content
 * Prettier adds a base indentation that we want to remove
 */
function trimBaseIndent(html: string): string {
  const lines = html.split("\n");
  const trimmedLines = lines.map((line) => {
    // Remove up to 2 leading spaces from each line
    if (line.startsWith("  ")) {
      return line.slice(2);
    }
    return line;
  });
  return trimmedLines.join("\n");
}

/**
 * Extract preserved blocks and replace with placeholders
 * Preserved blocks (like <pre>, <code>, <a>) won't be formatted by Prettier
 */
function extractPreservedBlocks(
  html: string,
  preservedTags: string[],
): { processedHtml: string; preservedBlocks: PreservedBlock[] } {
  const preservedBlocks: PreservedBlock[] = [];
  let processedHtml = html;
  let blockIndex = 0;

  for (const tag of preservedTags) {
    // Match opening tag with any attributes, content, and closing tag
    const pattern = new RegExp(`<${tag}([^>]*)>(.*?)<\\/${tag}>`, "gis");
    processedHtml = processedHtml.replace(pattern, (match) => {
      const placeholder = `__PRESERVED_BLOCK_${blockIndex}__`;
      preservedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    });
  }

  return { processedHtml, preservedBlocks };
}

/**
 * Restore preserved blocks by replacing placeholders with original content
 */
function restorePreservedBlocks(
  html: string,
  preservedBlocks: PreservedBlock[],
): string {
  let result = html;
  for (const block of preservedBlocks) {
    result = result.replace(block.placeholder, block.content);
  }
  return result;
}

/**
 * De-escape quotes in HTML content
 * Converts \" to " so Prettier can parse HTML properly
 */
function deescapeQuotes(html: string): string {
  return html.replace(/\\"/g, '"');
}

/**
 * Re-escape quotes in HTML content
 * Converts " back to \" for Modelica string literal
 */
function reescapeQuotes(html: string): string {
  return html.replace(/"/g, '\\"');
}

/**
 * Format HTML string using Prettier's format function (synchronous wrapper)
 * This is an alternative approach that doesn't use embed
 * Can be used directly in printer.ts for simpler integration
 */
export async function formatHTMLStringWithPrettier(
  html: string,
  prettierFormat: (text: string, options: any) => Promise<string>,
  options: any = {},
): Promise<string> {
  const preservedTags = options.preservedTags || DEFAULT_PRESERVED_TAGS;

  // 1. Prepare HTML (extract preserved blocks, de-escape)
  const { processedHtml, preservedBlocks } = prepareHTMLForPrettier(
    html,
    preservedTags,
  );

  try {
    // 2. Format with Prettier's HTML parser
    const formatted = await prettierFormat(processedHtml, {
      parser: "html",
      printWidth: options.printWidth || 80,
    });

    // 3. Post-process (re-escape, restore preserved blocks)
    const final = postProcessHTMLFromPrettier(formatted, preservedBlocks);

    return final;
  } catch (error) {
    // If Prettier formatting fails, return original HTML
    console.warn("Prettier HTML formatting failed:", error);
    return html;
  }
}
