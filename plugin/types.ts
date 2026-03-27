export interface GraphJson {
  version: string
  project: {
    name: string
    root: string
  }
  workspaces: Record<string, Workspace>
}

export interface Workspace {
  path: string
  depends_on: string[]
  worktrees: string[]
}

export interface WorkspacePermission {
  id: string
  access: "read" | "readwrite"
}

export interface CheckpointInfo {
  workspace_id: string
  workspace_path: string
  commit_hash: string
  timestamp: string
}
