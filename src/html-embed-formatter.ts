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
 * @param html - The formatted HTML string
 * @param preservedBlocks - Blocks that were preserved during formatting
 * @param trimIndent - Whether to trim the 2-space base indent (true for top-level, false for nested in named_element)
 */
export function postProcessHTMLFromPrettier(
  html: string,
  preservedBlocks: PreservedBlock[],
  trimIndent: boolean = true,
): string {
  // 1. Remove Prettier's 2-space base indent from each line (only for top-level annotations)
  const trimmedIndent = trimIndent ? trimBaseIndent(html) : html;

  // 2. Move closing </html> to end of previous line (keep it attached to quote)
  // Only strip indent before </html> for top-level annotations
  const htmlFixed = attachClosingHtmlTag(trimmedIndent, trimIndent);

  // 3. Re-escape quotes
  const reescaped = reescapeQuotes(htmlFixed);

  // 4. Restore preserved blocks
  const restoredPreserved = restorePreservedBlocks(reescaped, preservedBlocks);

  const final = formatAnchorTags(restoredPreserved);

  return final;
}

/**
 * Normalize closing </html> tag.
 * Prettier puts </html> on its own line with varying indent.
 * @param html - The HTML string
 * @param stripIndent - Whether to strip indent before </html> (true for top-level, false for nested)
 */
function attachClosingHtmlTag(html: string, stripIndent: boolean = true): string {
  if (stripIndent) {
    // For top-level: remove indent before </html>
    return html.replace(/\n\s*<\/html>\s*$/i, "\n</html>");
  } else {
    // For nested: ensure </html> has consistent 2-space indent
    return html.replace(/\n\s*<\/html>\s*$/i, "\n  </html>");
  }
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

    // Add newline before <a if there's non-whitespace content before it
    // Only add newline if there's actual content (not just whitespace) before <a
    processedLine = processedLine.replace(
      /^(\s*)(\S.*?)(\s*)(<a\s)/g,
      (match, leadingIndent, content, _space, anchor) => {
        // Only add newline if content is not empty after trimming
        if (content.trim()) {
          return `${leadingIndent}${content}\n${indent}${anchor}`;
        }
        return match;
      },
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
 * Generate a placeholder of exact same length as the match, preserving newlines.
 * Uses __PSBL as the root marker, padded with underscores to match length.
 * For short matches, may slightly exceed the match length to fit the marker.
 * The prefix __PSBL{index}_ is always kept intact (never split by newlines).
 */
function generatePlaceholder(match: string, blockIndex: number): string {
  const targetLength = match.length;
  const indexStr = blockIndex.toString();
  const prefix = `__PSBL${indexStr}_`;
  const suffix = "__";
  const minLength = prefix.length + suffix.length;

  // Count newlines and their positions in the original match
  const newlinePositions: number[] = [];
  for (let i = 0; i < match.length; i++) {
    if (match[i] === "\n") {
      newlinePositions.push(i);
    }
  }

  if (newlinePositions.length === 0) {
    // No newlines - simple case
    if (targetLength <= minLength) {
      // Short match - allow slightly exceeding length
      return prefix + suffix;
    }
    // Pad with underscores to match length
    const padding = "_".repeat(targetLength - minLength);
    return prefix + padding + suffix;
  }

  // Has newlines - preserve their positions but keep prefix/suffix intact
  // Shift newlines that would fall within prefix or suffix
  const safeNewlinePositions = newlinePositions.filter(
    (pos) => pos >= prefix.length && pos < targetLength - suffix.length,
  );

  // Build the placeholder
  const chars: string[] = [];

  // Add prefix first
  for (let i = 0; i < prefix.length && i < targetLength; i++) {
    chars.push(prefix[i]);
  }

  // Add middle section with preserved newlines
  const middleStart = prefix.length;
  const middleEnd = targetLength - suffix.length;

  for (let i = middleStart; i < middleEnd; i++) {
    if (safeNewlinePositions.includes(i)) {
      chars.push("\n");
    } else {
      chars.push("_");
    }
  }

  // Add suffix
  for (let i = 0; i < suffix.length; i++) {
    chars.push(suffix[i]);
  }

  return chars.join("");
}

/**
 * Extract preserved blocks and replace with placeholders
 * Preserved blocks (like <pre>, <code>, <a>) won't be formatted by Prettier
 * Placeholders maintain the same length and newline positions as the original
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
      const placeholder = generatePlaceholder(match, blockIndex);
      preservedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    });
  }

  return { processedHtml, preservedBlocks };
}

/**
 * Restore preserved blocks by replacing placeholders with original content
 * Uses regex to match placeholders that may have been reformatted (whitespace changes)
 */
function restorePreservedBlocks(
  html: string,
  preservedBlocks: PreservedBlock[],
): string {
  let result = html;
  for (const block of preservedBlocks) {
    // Extract the index from the placeholder to build a flexible regex
    // Placeholder format: __PSBL{index}_ followed by underscores and ending with __
    const indexMatch = block.placeholder.match(/__PSBL(\d+)_/);
    if (indexMatch) {
      const index = indexMatch[1];
      // Match __PSBL{index}_ followed by any underscores/whitespace, ending with __
      // Allow whitespace (including newlines) to be interspersed
      const pattern = new RegExp(`__PSBL${index}_[_\\s]*__`, "g");
      result = result.replace(pattern, block.content);
    } else {
      // Fallback to exact match
      result = result.replace(block.placeholder, block.content);
    }
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
    console.error("Prettier HTML formatting failed:", error);
    return html;
  }
}
