#!/bin/bash
# PostToolUse hook (Write|Edit): after a source or test file changes, typecheck
# and run tests. Exit 2 + stderr is the Claude Code convention for "block and
# feed this back to Claude" -- so a failure lands in the model's context
# automatically, without the user needing to paste it in.
set -uo pipefail

project="${CLAUDE_PROJECT_DIR:-/Users/markuskragh/Documents/Claude/TD Game}"
file="$(jq -r '.tool_input.file_path // empty')"

case "$file" in
  "$project"/src/*.ts | "$project"/tests/*.ts) ;;
  *) exit 0 ;;
esac

cd "$project" || exit 0

output="$(npm run typecheck --silent 2>&1 && npm test --silent 2>&1)"
status=$?

if [ "$status" -ne 0 ]; then
  echo "typecheck/test failed after editing $file:" >&2
  echo "$output" >&2
  exit 2
fi
