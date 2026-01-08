#!/usr/bin/env node
/**
 * Debug script to parse Modelica code and show AST structure
 * Usage: node debug-ast.js <file.mo> [--start LINE] [--end LINE]
 */

import * as fs from 'fs';
import * as path from 'path';
import Parser from 'tree-sitter';
import Modelica from 'tree-sitter-modelica';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log('Usage: node debug-ast.js <file.mo> [--start LINE] [--end LINE]');
  console.log('');
  console.log('Options:');
  console.log('  --start LINE    Start line (1-based, inclusive)');
  console.log('  --end LINE      End line (1-based, inclusive)');
  console.log('  --help          Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  node debug-ast.js test/example.mo');
  console.log('  node debug-ast.js test/example.mo --start 39 --end 45');
  process.exit(0);
}

// Parse arguments
const inputFile = args[0];
const startIdx = args.indexOf('--start');
const endIdx = args.indexOf('--end');
const startLine = startIdx !== -1 && args[startIdx + 1] ? parseInt(args[startIdx + 1]) : null;
const endLine = endIdx !== -1 && args[endIdx + 1] ? parseInt(args[endIdx + 1]) : null;

// Read file
const sourceFile = path.resolve(inputFile);
if (!fs.existsSync(sourceFile)) {
  console.error(`Error: File not found: ${sourceFile}`);
  process.exit(1);
}

const sourceCode = fs.readFileSync(sourceFile, 'utf8');
const lines = sourceCode.split('\n');

// Filter to specific lines if requested
let codeToShow = sourceCode;
let lineOffset = 0;
if (startLine !== null && endLine !== null) {
  codeToShow = lines.slice(startLine - 1, endLine).join('\n');
  lineOffset = startLine - 1;
  console.log(`\n=== Source (lines ${startLine}-${endLine}) ===`);
  codeToShow.split('\n').forEach((line, i) => {
    console.log(`${String(startLine + i).padStart(4)}: ${line}`);
  });
} else {
  console.log('\n=== Source ===');
  console.log(sourceCode);
}

// Parse with tree-sitter
const parser = new Parser();
parser.setLanguage(Modelica);
const tree = parser.parse(sourceCode);

// Function to print AST node recursively
function printNode(node, indent = '', isLast = true, lineFilter = null) {
  // Check if this node overlaps with the line range we care about
  if (lineFilter) {
    const nodeStartLine = node.startPosition.row;
    const nodeEndLine = node.endPosition.row;
    const [filterStart, filterEnd] = lineFilter;
    
    // Skip nodes that don't overlap with our range
    if (nodeEndLine < filterStart || nodeStartLine > filterEnd) {
      return;
    }
  }
  
  const branch = isLast ? '└── ' : '├── ';
  const extension = isLast ? '    ' : '│   ';
  
  // Node type and position
  const startPos = `${node.startPosition.row + 1}:${node.startPosition.column}`;
  const endPos = `${node.endPosition.row + 1}:${node.endPosition.column}`;
  const range = `[${startPos} - ${endPos}]`;
  
  // Node text (truncated if too long)
  let text = node.text || '';
  if (text.length > 60) {
    text = text.substring(0, 57) + '...';
  }
  text = text.replace(/\n/g, '\\n');
  
  console.log(`${indent}${branch}${node.type} ${range}`);
  if (text && node.childCount === 0) {
    console.log(`${indent}${extension}    "${text}"`);
  }
  
  // Print children
  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childIsLast = i === children.length - 1;
    printNode(child, indent + extension, childIsLast, lineFilter);
  }
}

console.log('\n=== AST ===\n');

if (startLine !== null && endLine !== null) {
  // Filter to show only nodes in the specified line range
  printNode(tree.rootNode, '', true, [startLine - 1, endLine - 1]);
} else {
  printNode(tree.rootNode);
}

console.log('');