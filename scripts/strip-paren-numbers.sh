#!/usr/bin/env bash
# Recursively rename files and directories under the current working
# directory, stripping " (NNN)" patterns (a literal space + parens with
# one or more digits inside). Multiple occurrences per name are all
# stripped. Names that don't contain the pattern are left alone.
#
# Usage:
#   ./strip-paren-numbers.sh           # dry-run, prints what would change
#   ./strip-paren-numbers.sh --apply   # actually rename
#
# Depth-first so we rename children before their parent directories.

set -euo pipefail

APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
fi

# -depth: process directory contents before the directory itself
# -print0 / read -d '': handle names containing spaces, newlines, etc.
find . -depth -mindepth 1 -print0 |
while IFS= read -r -d '' path; do
  base=$(basename "$path")
  parent=$(dirname "$path")

  # Strip every occurrence of optional-space + (digits).
  # The leading [[:space:]]* eats the space that usually precedes the
  # parens so we don't leave a trailing space behind.
  new_base=$(printf '%s' "$base" | perl -pe 's/[[:space:]]*\(\d+\)//g')

  # Also collapse any leftover trailing whitespace.
  new_base=$(printf '%s' "$new_base" | perl -pe 's/[[:space:]]+$//')

  if [[ "$base" == "$new_base" ]]; then
    continue
  fi

  if [[ -z "$new_base" ]]; then
    echo "SKIP (would be empty): $path"
    continue
  fi

  new_path="$parent/$new_base"

  if [[ -e "$new_path" ]]; then
    echo "SKIP (target exists): $path -> $new_path"
    continue
  fi

  if [[ "$APPLY" == "1" ]]; then
    mv -- "$path" "$new_path"
    echo "RENAMED: $path -> $new_path"
  else
    echo "WOULD: $path -> $new_path"
  fi
done

if [[ "$APPLY" == "0" ]]; then
  echo ""
  echo "Dry run. Re-run with --apply to perform the renames."
fi
