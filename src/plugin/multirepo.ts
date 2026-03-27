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

function getSessionIdFromEvent(event: unknown): string | undefined {
  if (typeof event !== "object" || event === null) return undefined

  const value = event as Record<string, unknown>
  const sessionId = value.session_id
  if (typeof sessionId === "string") return sessionId

  const sessionID = value.sessionID
  if (typeof sessionID === "string") return sessionID

  return undefined
}

function getFilePathFromArgs(args: unknown): string | undefined {
  if (typeof args !== "object" || args === null) return undefined

  const value = args as Record<string, unknown>

  if (typeof value.filePath === "string") return value.filePath
  if (typeof value.path === "string") return value.path

  return undefined
}

function getWritableWorkspaceIds(args: unknown): string[] {
  if (typeof args !== "object" || args === null) return []

  const value = args as Record<string, unknown>
  const writableIds = value.writable_workspace_ids
  if (typeof writableIds !== "string") return []

  return writableIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
}

function isVerificationPassed(metadata: unknown, output: string): boolean {
  if (typeof metadata === "object" && metadata !== null) {
    const value = metadata as Record<string, unknown>
    if (typeof value.verificationPassed === "boolean") {
      return value.verificationPassed
    }
  }

  return output.startsWith("## Verification passed")
}

function getChangedFiles(metadata: unknown): string[] {
  if (typeof metadata !== "object" || metadata === null) return []

  const value = metadata as Record<string, unknown>
  if (!Array.isArray(value.changedFiles)) return []

  return value.changedFiles.filter((item): item is string => typeof item === "string")
}

export const MultirepoPlugin: Plugin = async ({ client, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      const sessionId = getSessionIdFromEvent(event)

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

      const filePath = getFilePathFromArgs(output.args)
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

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "multirepo_verify") return
      if (!isVerificationPassed(output.metadata, output.output)) return

      const writableWorkspaceIds = getWritableWorkspaceIds(input.args)
      const changedFiles = getChangedFiles(output.metadata)

      const indexerPrompt = [
        "Task completion confirmed after multirepo verification.",
        `Project root: ${directory}`,
        `Current worktree path: ${worktree}`,
        writableWorkspaceIds.length > 0
          ? `Writable workspaces: ${writableWorkspaceIds.join(", ")}`
          : "Writable workspaces: (not provided)",
        changedFiles.length > 0
          ? `Detected changed files (${changedFiles.length}):\n${changedFiles.map((file) => `- ${file}`).join("\n")}`
          : "Detected changed files: (not provided by verify metadata)",
        "",
        "Run in background and update multirepo memory using this order:",
        "1. Detect task changes by checking git diff/untracked files per workspace.",
        "2. If change scope is unclear, traverse the entire project root to refresh workspace-level context.",
        "3. Detect git worktree usage with `git worktree list --porcelain` and sync worktree paths.",
        "4. Update `.opencode/plugins/multirepo/graph.json` and `.opencode/plugins/multirepo/project.md`.",
        "5. Always mirror the same markdown into `.opencode/plugins/multirepo/workspaces.md` for backward compatibility.",
        "",
        "Verification output:",
        output.output,
      ].join("\n")

      try {
        await client.session.promptAsync({
          path: { id: input.sessionID },
          query: { directory },
          body: {
            agent: "indexer",
            noReply: true,
            parts: [{ type: "text", text: indexerPrompt }],
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[multirepo] @indexer background trigger failed: ${message}`)
      }
    },
  }
}
