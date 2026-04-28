import type { Hooks } from "@opencode-ai/plugin"
import type { AppContext } from "../types"
import type { WorkspaceStore } from "../workspace/store"
import { resolveWorkspacePath, selectWorkspace } from "../workspace/permission"

const isReadFileArgs = (value: unknown): value is { path: string; workspace_id: string | null } => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.path === "string" && (typeof record.workspace_id === "string" || record.workspace_id === null)
}

export const onToolBefore = (_input: { store: WorkspaceStore; ctx: AppContext }): Hooks["tool.execute.before"] =>
  async (input, output) => {
    if (input.tool !== "external_read_file" || !isReadFileArgs(output.args)) {
      return
    }

    const workspaces = await _input.store.list()
    const workspace = selectWorkspace(workspaces, output.args.workspace_id)
    await resolveWorkspacePath(workspace, output.args.path)
  }
