#!/usr/bin/env bash
# PostToolUse: format + lint dashboard files that Claude just edited.
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
dash="$root/dashboard"
case "$file" in
  "$dash"/src/*) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

cd "$dash" || exit 0
case "$file" in
  *.ts|*.tsx|*.css|*.js|*.jsx|*.json) npx --no-install prettier --write "$file" >/dev/null 2>&1 ;;
esac
case "$file" in
  *.ts|*.tsx|*.js|*.jsx)
    if ! out=$(npx --no-install eslint --fix "$file" 2>&1); then
      echo "ESLint issues remaining in $file:" >&2
      echo "$out" >&2
      exit 2  # feed errors back to Claude
    fi
    ;;
esac
exit 0
