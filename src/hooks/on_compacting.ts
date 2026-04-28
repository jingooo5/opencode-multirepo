import type { Hooks } from "@opencode-ai/plugin"
import type { AppContext } from "../types"
import type { WorkspaceStore } from "../workspace/store"

export const onCompacting = (_input: { store: WorkspaceStore; ctx: AppContext }): Hooks["experimental.session.compacting"] =>
  async (_inputHook, output) => {
    const workspaces = await _input.store.list()
    if (workspaces.length === 0) {
      return
    }

    const summaries = workspaces.map((workspace) => {
      const permission = workspace.permissions.read ? "read" : "no-read"
      const summary = workspace.summary === undefined ? "" : ` — ${workspace.summary}`
      return `- ${workspace.id}: ${workspace.path} (${permission})${summary}`
    })
    output.context.push(["Registered external workspaces:", ...summaries].join("\n"))
  }
