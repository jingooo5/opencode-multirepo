import type { Plugin } from "@opencode-ai/plugin"
import { readGraph, resolveWorkspace } from "./utils"
import type { CheckpointInfo } from "./types"

interface SessionState {
  activeWorkspaces: string[]
  permissions: Array<{ id: string; access: "read" | "readwrite" }>
  checkpoints: CheckpointInfo[]
  retryCount: number
}

const sessions = new Map<string, SessionState>()

export const MultirepoPlugin: Plugin = async ({ client, $, directory }) => {
  return {
    event: async ({ event }) => {
      const sessionId = (event as any).session_id || (event as any).sessionID

      if (event.type === "session.created" && sessionId) {
        sessions.set(sessionId, {
          activeWorkspaces: [],
          permissions: [],
          checkpoints: [],
          retryCount: 0,
        })
      }

      if (event.type === "session.deleted" && sessionId) {
        sessions.delete(sessionId)
      }
    },

    "tool.execute.before": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return

      const sessionState = sessions.get(input.sessionID)
      if (!sessionState || sessionState.permissions.length === 0) return

      const graph = readGraph(directory)
      if (!graph) return

      const filePath = (output.args as any).filePath || (output.args as any).path
      if (!filePath) return

      const wsId = resolveWorkspace(graph, filePath)
      if (!wsId) return

      const perm = sessionState.permissions.find((p) => p.id === wsId)
      if (perm && perm.access === "read") {
        throw new Error(
          `[multirepo] 접근 거부: '${wsId}' 워크스페이스는 읽기 전용입니다. ` +
            `파일 '${filePath}' 쓰기가 차단되었습니다.`
        )
      }
    },
  }
}
