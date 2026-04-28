import { realpath } from "node:fs/promises"
import path from "node:path"
import type { Workspace } from "../types"

export type ResolvedWorkspace = {
  workspace: Workspace
  root: string
}

export type ResolvedWorkspacePath = ResolvedWorkspace & {
  path: string
}

export class WorkspacePermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspacePermissionError"
  }
}

export const selectWorkspace = (workspaces: Workspace[], workspaceId: string | null): Workspace => {
  if (workspaceId !== null) {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace === undefined) {
      throw new WorkspacePermissionError(`Workspace not found: ${workspaceId}`)
    }
    return workspace
  }

  if (workspaces.length === 1) {
    const workspace = workspaces[0]
    if (workspace !== undefined) {
      return workspace
    }
  }

  if (workspaces.length === 0) {
    throw new WorkspacePermissionError("No external workspaces are registered")
  }

  throw new WorkspacePermissionError("workspace_id is required when multiple workspaces are registered")
}

export const requireReadPermission = (workspace: Workspace): void => {
  if (!workspace.permissions.read) {
    throw new WorkspacePermissionError(`Read permission denied for workspace: ${workspace.id}`)
  }
}

export const resolveWorkspaceRoot = async (workspace: Workspace): Promise<ResolvedWorkspace> => {
  requireReadPermission(workspace)
  const root = await realpath(workspace.path)
  return { workspace, root: path.normalize(root) }
}

export const isPathInside = (root: string, target: string): boolean => {
  const normalizedRoot = path.normalize(root)
  const normalizedTarget = path.normalize(target)
  if (normalizedTarget === normalizedRoot) {
    return true
  }
  const relative = path.relative(normalizedRoot, normalizedTarget)
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative)
}

export const resolveWorkspacePath = async (
  workspace: Workspace,
  requestedPath: string,
): Promise<ResolvedWorkspacePath> => {
  const resolved = await resolveWorkspaceRoot(workspace)
  const lexicalTarget = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(resolved.root, requestedPath)

  if (!isPathInside(resolved.root, lexicalTarget)) {
    throw new WorkspacePermissionError(`Path escapes workspace before realpath resolution: ${requestedPath}`)
  }

  const target = path.normalize(await realpath(lexicalTarget))
  if (!isPathInside(resolved.root, target)) {
    throw new WorkspacePermissionError(`Path escapes workspace after realpath resolution: ${requestedPath}`)
  }

  return { ...resolved, path: target }
}

export const displayWorkspacePath = (root: string, target: string): string => {
  const relative = path.relative(root, target)
  return relative.length === 0 ? "." : relative.split(path.sep).join("/")
}
