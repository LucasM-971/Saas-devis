#!/usr/bin/env bash
# PreToolUse: refuse edits to secrets (.env*) and lockfiles. *.example files stay editable.
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
name=$(basename "$file")

case "$name" in
  *.example) exit 0 ;;
  .env|.env.*)
    echo "Blocked: $name may contain secrets. Edit it yourself, or change the matching .example file." >&2
    exit 2 ;;
  package-lock.json|yarn.lock|pnpm-lock.yaml|poetry.lock|uv.lock)
    echo "Blocked: $name is a lockfile. Change dependencies with npm/pip commands instead of editing it." >&2
    exit 2 ;;
esac
exit 0
