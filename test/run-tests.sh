#!/bin/bash

# Test script for prettier-plugin-modelica
# For each .mo file not containing '_formatted', run prettier and output to _formatted.mo
# Then check if there are any git diffs

set -e

# Parse command line arguments
INDENT_CHECK=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --indent-check)
            INDENT_CHECK=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--indent-check]"
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMATTER_DIR="$(dirname "$SCRIPT_DIR")"
TEST_DIR="$SCRIPT_DIR/data"

cd "$FORMATTER_DIR"

echo "Running formatter tests..."

# Find all .mo files not containing '_formatted' in the name
for file in "$TEST_DIR"/*.mo; do
    filename=$(basename "$file")

    echo "Formatting: $filename"

    # Format inplace w/ idempotence check
    npx tsx src/cli.ts "$TEST_DIR/$filename" --write --check

    # Check that no line has more than +2 spaces compared to previous non-empty line
    if [ "$INDENT_CHECK" = true ]; then
        prev_indent=0
        line_num=0
        while IFS= read -r line; do
            line_num=$((line_num + 1))

            # Stop checking when hitting HTML tag
            if echo "$line" | grep -q '<html>'; then
                break
            fi

            # Skip empty lines
            if [ -z "$(echo "$line" | tr -d '[:space:]')" ]; then
                continue
            fi

            # Count leading spaces
            current_indent=$(echo "$line" | sed 's/[^ ].*//' | wc -c)
            current_indent=$((current_indent - 1))  # wc -c counts newline

            # Check if indentation increased by more than 2
            indent_diff=$((current_indent - prev_indent))
            if [ $indent_diff -gt 2 ]; then
                echo "✗ Excessive indentation in $filename:$line_num"
                echo "  Previous non-empty line indent: $prev_indent spaces"
                echo "  Current line indent: $current_indent spaces"
                echo "  Difference: $indent_diff spaces (max allowed: 2)"
                exit 1
            fi

            prev_indent=$current_indent
        done < "$TEST_DIR/$filename"
    fi
done

echo ""
echo "Checking for differences..."

# Check for git diffs in the test directory
if git diff --exit-code --quiet HEAD -- "$TEST_DIR"/*.mo; then
    echo "✓ No formatting differences detected."
else
    echo "✗ Formatting differences detected:"
    echo ""
    git diff HEAD -- "$TEST_DIR"/*.mo
    exit 1
fi
