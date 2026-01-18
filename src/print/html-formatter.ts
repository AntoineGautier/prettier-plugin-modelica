/**
 * HTML formatter for documentation strings
 * Handles formatting of HTML content with support for preserving content in specific tags
 */

export interface HTMLFormatterOptions {
  maxWidth?: number;
  baseIndent?: string;
  removeEmptyLines?: boolean;
  preservedTags?: string[];
}

export const DEFAULT_PRESERVED_TAGS = ["pre", "code", "a"];

// Block-level tags that should be on their own lines
const BLOCK_LEVEL_TAGS = [
  "p",
  "div",
  "img",
  "td",
  "tr",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "html",
  "head",
  "body",
];

/**
 * Format HTML string while preserving structure and respecting line length
 * Content within preserved tags (like <pre> and <code>) remains unchanged
 *
 * @param html - The HTML string to format
 * @param options - Formatting options
 * @returns Formatted HTML string
 */
export function formatHTMLString(
  html: string,
  options: HTMLFormatterOptions = {},
): string {
  const {
    maxWidth = 80,
    baseIndent = "",
    removeEmptyLines = true,
    preservedTags = DEFAULT_PRESERVED_TAGS,
  } = options;

  // Preprocess: normalize whitespace by removing newlines from HTML
  // This simplifies formatting by ensuring we start with a clean slate
  const normalizedHtml = normalizeHTMLWhitespace(html, preservedTags);

  // Tokenize HTML, treating preserved tags as atomic units
  const tokens = tokenizeHTML(normalizedHtml, preservedTags);

  // Format tokens with lookahead optimization
  const lines: string[] = [];
  let currentLine = baseIndent;

  for (const token of tokens) {
    if (token.type === "preserved") {
      // Preserved content: never break it, treat as atomic unit
      if (
        currentLine.length + token.content.length > maxWidth &&
        currentLine.trim().length > 0
      ) {
        // Would exceed limit, start new line
        lines.push(currentLine.trimEnd());
        currentLine = baseIndent + token.content;
      } else {
        currentLine += token.content;
      }
    } else if (token.type === "tag") {
      // Check if this is a br tag
      const isBrTag = /^<br\s*\/?>$/i.test(token.content);

      if (isBrTag) {
        // br tag: add to current line then force line break
        currentLine += token.content;
        if (currentLine.trim().length > 0) {
          lines.push(currentLine.trimEnd());
          currentLine = baseIndent;
        }
      } else {
        // Check if this is a block-level tag
        const isBlockTag = isBlockLevelTag(token.content);

        if (isBlockTag) {
          // Block-level tags go on their own line
          if (currentLine.trim().length > 0) {
            lines.push(currentLine.trimEnd());
            currentLine = baseIndent;
          }
          lines.push(baseIndent + token.content);
          currentLine = baseIndent;
        } else {
          // Inline tag: add to current line
          if (
            currentLine.length + token.content.length > maxWidth &&
            currentLine.trim().length > 0
          ) {
            // Tag would exceed limit, start new line
            lines.push(currentLine.trimEnd());
            currentLine = baseIndent + token.content;
          } else {
            currentLine += token.content;
          }
        }
      }
    } else {
      // Text content: can break at word boundaries
      // Trim leading space if current line is empty (just after a block tag)
      let textContent = token.content;
      if (currentLine.trim().length === 0) {
        textContent = textContent.trimStart();
      }
      const result = addTextToLine(
        textContent,
        currentLine,
        maxWidth,
        baseIndent,
      );
      currentLine = result.currentLine;
      if (result.completedLines.length > 0) {
        lines.push(...result.completedLines);
      }
    }
  }

  // Add any remaining content
  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trimEnd());
  }

  let result = lines.join("\n");

  if (removeEmptyLines) {
    result = result
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .join("\n");
  }

  return result;
}

/**
 * Normalize HTML whitespace by removing newlines and collapsing spaces
 * Preserves content within preserved tags (like <pre> and <code>)
 */
function normalizeHTMLWhitespace(
  html: string,
  preservedTags: string[],
): string {
  // Extract preserved blocks first
  const preservedBlocks: { placeholder: string; content: string }[] = [];
  let processed = html;
  let blockIndex = 0;

  // Replace preserved tags with placeholders
  for (const tag of preservedTags) {
    const pattern = new RegExp(`<${tag}([^>]*)>(.*?)<\\/${tag}>`, "gis");
    processed = processed.replace(pattern, (match) => {
      const placeholder = `__PRESERVED_BLOCK_${blockIndex}__`;
      preservedBlocks.push({ placeholder, content: match });
      blockIndex++;
      return placeholder;
    });
  }

  // Normalize all whitespace - remove newlines and collapse spaces
  processed = processed.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ");

  // Restore preserved blocks
  for (const block of preservedBlocks) {
    processed = processed.replace(block.placeholder, block.content);
  }

  return processed;
}

/**
 * Check if a tag is a block-level tag
 */
function isBlockLevelTag(tagContent: string): boolean {
  // Extract tag name from tag content like "<p>", "</p>", "<div class='x'>"
  const match = tagContent.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
  if (!match) return false;

  const tagName = match[1].toLowerCase();
  return BLOCK_LEVEL_TAGS.includes(tagName);
}

interface Token {
  type: "preserved" | "tag" | "text";
  content: string;
}

/**
 * Tokenize HTML into preserved blocks, tags, and text
 */
function tokenizeHTML(html: string, preservedTags: string[]): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  // Build regex pattern for preserved tags
  const preservedPattern =
    preservedTags.length > 0
      ? new RegExp(`<(${preservedTags.join("|")})([^>]*)>(.*?)<\\/\\1>`, "gis")
      : null;

  while (position < html.length) {
    // Check for preserved tags first
    if (preservedPattern) {
      preservedPattern.lastIndex = position;
      const preservedMatch = preservedPattern.exec(html);

      if (preservedMatch && preservedMatch.index === position) {
        // Found a preserved tag at current position
        tokens.push({
          type: "preserved",
          content: preservedMatch[0],
        });
        position = preservedMatch.index + preservedMatch[0].length;
        continue;
      }
    }

    // Check for regular tags
    if (html[position] === "<") {
      const tagMatch = html.substring(position).match(/^<[^>]+>/);
      if (tagMatch) {
        tokens.push({
          type: "tag",
          content: tagMatch[0],
        });
        position += tagMatch[0].length;
        continue;
      }
    }

    // Otherwise, it's text content
    const textMatch = html.substring(position).match(/^[^<]+/);
    if (textMatch) {
      tokens.push({
        type: "text",
        content: textMatch[0],
      });
      position += textMatch[0].length;
    } else {
      // Safety: advance by one character if nothing matched
      position++;
    }
  }

  return tokens;
}

/**
 * Check if a word starts with punctuation that shouldn't start a line
 */
function startsWithPunctuation(word: string): boolean {
  return /^[.,;:!?)\]}\-]/.test(word);
}

/**
 * Add text to current line, potentially breaking it across multiple lines
 * Returns completed lines and the new current line
 */
function addTextToLine(
  text: string,
  currentLine: string,
  maxWidth: number,
  baseIndent: string,
): { completedLines: string[]; currentLine: string } {
  const completedLines: string[] = [];

  // Check if text fits on current line as-is
  if (currentLine.length + text.length <= maxWidth) {
    return { completedLines: [], currentLine: currentLine + text };
  }

  // Need to break text - preserve leading/trailing whitespace
  const leadingSpace = text.match(/^\s*/)?.[0] || "";
  const trailingSpace = text.match(/\s*$/)?.[0] || "";
  const trimmedText = text.trim();

  if (!trimmedText) {
    // Only whitespace, add if there's room
    if (currentLine.length + text.length <= maxWidth) {
      return { completedLines: [], currentLine: currentLine + text };
    }
    return { completedLines: [], currentLine };
  }

  const words = trimmedText.split(/\s+/);
  let newLine = currentLine;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const isFirst = i === 0;
    const isLast = i === words.length - 1;
    const prefix = isFirst ? leadingSpace : " ";
    const suffix = isLast ? trailingSpace : "";

    if (
      newLine.length + prefix.length + word.length + suffix.length > maxWidth &&
      newLine.trim().length > 0
    ) {
      // Don't start a new line with punctuation - keep it with previous line
      if (startsWithPunctuation(word)) {
        newLine += prefix + word + suffix;
      } else {
        // Start new line
        completedLines.push(newLine.trimEnd());
        newLine = baseIndent + word + suffix;
      }
    } else {
      newLine += prefix + word + suffix;
    }
  }

  return { completedLines, currentLine: newLine };
}
