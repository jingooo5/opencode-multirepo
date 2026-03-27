---
name: multirepo-github
description: A skill for creating remote repositories and reading code via GitHub MCP. Used by @architecture for GitHub integration and by /multirepo for reading external code.
---

# Multirepo GitHub Skill

## MCP server

Use the GitHub MCP server: https://github.com/github/github-mcp-server

## Create remote repository

Executed by the @architecture agent after workspace initialization, with user approval:

1. Create the repository using GitHub MCP's `create_repository` tool.
2. In the local repository:
```bash
cd <workspace-path>
git remote add origin <repository-url>
git branch -M main
git push -u origin main
```

## Inspect remote repository

```bash
git remote -v
```

## Read web code (without clone)

When a GitHub URL is provided in the `/multirepo` command:

1. Parse `owner`, `repo`, and `path` from the URL.
2. Retrieve file/directory content using GitHub MCP's `get_file_contents` tool.
3. Selectively read only required files and return them as read-only context.
4. Do not clone the repository.

## Rules

- Remote repository creation must only run after explicit user approval.
- Web code reading is read-only and must not create local files.
- Minimize GitHub API usage to what is necessary, considering rate limits.
