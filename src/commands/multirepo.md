---
description: Command that activates multirepo context and specifies the working scope
agent: architecture
---

Analyze the user's instruction and execute work based on multirepo context.

## Procedure

### Step 1: Analyze input

User instruction: $ARGUMENTS

Analyze the instruction and determine one of the following:
- **General instruction**: Create a development plan and infer required workspaces.
- **@ mention**: Identify the workspace containing the mentioned file/folder.
- **GitHub URL**: Add it as read-only external context.

### Step 2: Determine workspaces

Call the `multirepo_context` tool to:
- Pass active workspace IDs.
- Review the returned dependency-graph-based context and permission info.

Output the following to the user:
- List of workspaces to access
- Permission per workspace (read/write or read-only)

### Step 3: Create checkpoint

Call the `create` tool of `multirepo_checkpoint` to:
- Create checkpoints for all workspaces with write permission.

### Step 4: Execute work

Execute the user's instruction while respecting context and permissions.

**Mandatory rules:**
- Do not modify files in read-only workspaces.
- Do not access files in workspaces not included in context.

### Step 5: Verify

After finishing work, call the `multirepo_verify` tool to validate permission compliance.

- **No violations**: Clean up checkpoints with the `cleanup` tool of `multirepo_checkpoint` and finish.
- **Violations found**:
  1. Roll back the violated workspace using the `rollback` tool of `multirepo_checkpoint`.
  2. Redo Step 4 based on the violation reason.
  3. If it still fails after up to 3 attempts, report the situation to the user and request manual intervention.

### GitHub URL handling

When the instruction includes a GitHub URL:
- Read files from the repository using GitHub MCP's `get_file_contents` tool.
- Do not clone; read only required files selectively and use them as read-only context.
