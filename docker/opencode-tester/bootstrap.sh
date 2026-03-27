#!/usr/bin/env bash
set -euo pipefail

REPO_SOURCE_DIR="${REPO_SOURCE_DIR:-/host-workspace/opencode-multirepo-plugin}"
REPO_WORKSPACE_DIR="${REPO_WORKSPACE_DIR:-/workspace/opencode-multirepo-plugin}"
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
BOOTSTRAP_SYNC_ONLY="${BOOTSTRAP_SYNC_ONLY:-0}"

if [ ! -d "$REPO_SOURCE_DIR" ]; then
  echo "Repository source directory not found: $REPO_SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$REPO_WORKSPACE_DIR")" "$OPENCODE_CONFIG_DIR"

sync_workspace() {
  rsync -a --delete \
    --exclude .git \
    --exclude node_modules \
    --exclude .opencode-test-logs \
    --exclude docker/opencode-tester/logs \
    "$REPO_SOURCE_DIR/" "$REPO_WORKSPACE_DIR/"
}

sync_workspace

if [ "$BOOTSTRAP_SYNC_ONLY" = "1" ]; then
  echo "Workspace sync complete."
  echo "Workspace: $REPO_WORKSPACE_DIR"
  exit 0
fi

cd "$REPO_WORKSPACE_DIR"

npm install
npm run install:plugin -- \
  --config-dir "$OPENCODE_CONFIG_DIR" \
  --project-dir "$REPO_WORKSPACE_DIR" \
  --mode symlink

echo "Bootstrap complete."
echo "Workspace: $REPO_WORKSPACE_DIR"
echo "OpenCode config: $OPENCODE_CONFIG_DIR"
