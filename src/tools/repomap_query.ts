import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { AppContext } from "../types"
import type { WorkspaceStore } from "../workspace/store"
import { queryRepoMap } from "../repomap/indexer"
import { rankRepoMapEntries } from "../repomap/pagerank"
import { selectWorkspace } from "../workspace/permission"

export const repomapQuery = ({ store }: { store: WorkspaceStore; ctx: AppContext }): ToolDefinition =>
  tool({
    description: "등록된 외부 워크스페이스를 read 권한으로 bounded scan하여 파일과 간단한 심볼을 조회한다.",
    args: {
      query: tool.schema.string().describe("조회할 심볼, 파일명, 또는 자연어 질의"),
      workspace_id: tool.schema.string().nullable().default(null).describe("대상 워크스페이스 id"),
    },
    async execute(args) {
      const workspaces = await store.list()
      const workspace = selectWorkspace(workspaces, args.workspace_id)
      const map = await queryRepoMap(workspace, args.query)
      const entries = rankRepoMapEntries(map.entries).slice(0, 20)
      return {
        output: JSON.stringify({ workspace_id: map.workspace_id, entries, truncated: map.truncated }, null, 2),
        metadata: {
          query: args.query,
          workspace_id: workspace.id,
          workspace_count: workspaces.length,
          result_count: entries.length,
          truncated: map.truncated,
        },
      }
    },
  })
