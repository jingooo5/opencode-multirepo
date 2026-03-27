---
name: multirepo-git
description: A skill for multirepo git initialization, worktree detection, and checkpoint-based rollback. Used by @architecture for workspace initialization, @indexer for worktree synchronization, and /multirepo rollback workflows.
---

# Multirepo Git Skill

## Workspace git initialization

Run in each workspace directory:

```bash
cd <workspace-path>
git init
git add -A
git commit -m "init: <workspace-id> workspace initialization"
```

## Worktree detection

```bash
cd <workspace-path>
git worktree list --porcelain
```

Output parsing: From `worktree <path>` lines, add entries that are not the primary path to the `worktrees` array in `graph.json`.

## Create checkpoint (before work)

```bash
cd <workspace-path>
git add -A
git commit --allow-empty -m "multirepo-checkpoint: <ISO-timestamp>" --no-verify
```

## Rollback (on permission violation)

```bash
cd <workspace-path>
git reset --hard <checkpoint-commit-hash>
git clean -fd
```

## Cleanup checkpoint (after successful work)

```bash
cd <workspace-path>
# When the latest commit is a checkpoint
git reset --soft HEAD~1
```

## Rules

- Checkpoint commit messages must start with `multirepo-checkpoint:`.
- During rollback, remove untracked files as well using `git clean -fd`.
- Cleanup checkpoints only when the latest commit is a checkpoint.
- If new commits are stacked on top of a checkpoint, notify the user that manual cleanup is required.
