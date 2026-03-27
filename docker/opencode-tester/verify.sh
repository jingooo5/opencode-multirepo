#!/usr/bin/env bash
set -euo pipefail

REPO_WORKSPACE_DIR="${REPO_WORKSPACE_DIR:-/workspace/opencode-multirepo-plugin}"
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
DRY_RUN_CONFIG_DIR="${DRY_RUN_CONFIG_DIR:-/tmp/opencode-multirepo-plugin-dry-run}"
DRY_RUN_LOG="${DRY_RUN_LOG:-/tmp/opencode-multirepo-plugin-dry-run.log}"

assert_exists() {
  local path="$1"
  if [ ! -e "$path" ]; then
    echo "Missing expected path: $path" >&2
    exit 1
  fi
}

assert_symlink() {
  local path="$1"
  local expected_target="$2"
  if [ ! -L "$path" ]; then
    echo "Expected symlink but found different type: $path" >&2
    exit 1
  fi

  local actual_target
  actual_target="$(readlink "$path")"
  if [ "$actual_target" != "$expected_target" ]; then
    echo "Unexpected symlink target for $path" >&2
    echo "Expected: $expected_target" >&2
    echo "Actual:   $actual_target" >&2
    exit 1
  fi
}

assert_contains() {
  local needle="$1"
  local file="$2"
  if ! grep -F "$needle" "$file" >/dev/null; then
    echo "Expected to find '$needle' in $file" >&2
    exit 1
  fi
}

command -v opencode >/dev/null
opencode --version >/dev/null
node --version >/dev/null
npm --version >/dev/null

cd "$REPO_WORKSPACE_DIR"

npm install
rm -rf "$DRY_RUN_CONFIG_DIR"

npm run install:plugin -- \
  --dry-run \
  --config-dir "$DRY_RUN_CONFIG_DIR" \
  --project-dir "$REPO_WORKSPACE_DIR" \
  >"$DRY_RUN_LOG"

assert_contains "plugins/multirepo.ts" "$DRY_RUN_LOG"
assert_contains "tools/multirepo_context.ts" "$DRY_RUN_LOG"
assert_contains "tools/multirepo_checkpoint.ts" "$DRY_RUN_LOG"
assert_contains "tools/multirepo_verify.ts" "$DRY_RUN_LOG"
assert_contains "agents/architecture.md" "$DRY_RUN_LOG"
assert_contains "agents/indexer.md" "$DRY_RUN_LOG"
assert_contains "skills/multirepo-git/SKILL.md" "$DRY_RUN_LOG"
assert_contains "skills/multirepo-github/SKILL.md" "$DRY_RUN_LOG"
assert_contains "commands/multirepo.md" "$DRY_RUN_LOG"
assert_contains "@opencode-ai/plugin" "$DRY_RUN_LOG"

npm run install:plugin -- \
  --config-dir "$OPENCODE_CONFIG_DIR" \
  --project-dir "$REPO_WORKSPACE_DIR"

assert_symlink "$OPENCODE_CONFIG_DIR/plugins/multirepo.ts" "$REPO_WORKSPACE_DIR/src/plugin/multirepo.ts"
assert_symlink "$OPENCODE_CONFIG_DIR/tools/multirepo_context.ts" "$REPO_WORKSPACE_DIR/src/tools/multirepo_context.ts"
assert_symlink "$OPENCODE_CONFIG_DIR/tools/multirepo_checkpoint.ts" "$REPO_WORKSPACE_DIR/src/tools/multirepo_checkpoint.ts"
assert_symlink "$OPENCODE_CONFIG_DIR/tools/multirepo_verify.ts" "$REPO_WORKSPACE_DIR/src/tools/multirepo_verify.ts"
assert_symlink "$OPENCODE_CONFIG_DIR/agents/architecture.md" "$REPO_WORKSPACE_DIR/src/agents/architecture.md"
assert_symlink "$OPENCODE_CONFIG_DIR/agents/indexer.md" "$REPO_WORKSPACE_DIR/src/agents/indexer.md"
assert_symlink "$OPENCODE_CONFIG_DIR/skills/multirepo-git/SKILL.md" "$REPO_WORKSPACE_DIR/src/skills/git/SKILL.md"
assert_symlink "$OPENCODE_CONFIG_DIR/skills/multirepo-github/SKILL.md" "$REPO_WORKSPACE_DIR/src/skills/github/SKILL.md"
assert_symlink "$OPENCODE_CONFIG_DIR/commands/multirepo.md" "$REPO_WORKSPACE_DIR/src/commands/multirepo.md"

assert_exists "$OPENCODE_CONFIG_DIR/package.json"
assert_contains '"@opencode-ai/plugin": "latest"' "$OPENCODE_CONFIG_DIR/package.json"

npm run typecheck

echo "Verification complete."
