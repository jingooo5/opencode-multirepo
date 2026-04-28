import type { Hooks } from "@opencode-ai/plugin"
import type { WorkspaceStore } from "../workspace/store"

export const onToolAfter = (_input: { store: WorkspaceStore }): Hooks["tool.execute.after"] =>
  async (input, output) => {
    if (input.tool.startsWith("external_") || input.tool === "repomap_query") {
      output.title = output.title.length > 0 ? output.title : `multirepo:${input.tool}`
    }
    if (input.tool === "edit" || input.tool === "write" || input.tool === "patch") {
      await _input.store.load()
    }
  }
