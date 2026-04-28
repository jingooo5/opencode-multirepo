import type { Hooks } from "@opencode-ai/plugin"
import type { AppContext } from "../types"
import type { WorkspaceStore } from "../workspace/store"

export const onSessionCreated = (_input: { store: WorkspaceStore; ctx: AppContext }): Hooks["event"] =>
  async (input) => {
    if (input.event.type === "session.created" || input.event.type === "file.edited") {
      await _input.store.load()
    }
  }
