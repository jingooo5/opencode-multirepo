import type { Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { workspaceAdd, workspaceList } from "./tools/workspace_add"
import { repomapQuery } from "./tools/repomap_query"
import { externalReadFile } from "./tools/external_read_file"
import { externalWorkspaceExplore } from "./tools/external_workspace_explore"
import { onSessionCreated } from "./hooks/on_session_created"
import { onToolBefore } from "./hooks/on_tool_before"
import { onToolAfter } from "./hooks/on_tool_after"
import { onCompacting } from "./hooks/on_compacting"
import { WorkspaceStore } from "./workspace/store"

export const MultirepoPlugin: Plugin = async (input: PluginInput, _options?: PluginOptions): Promise<Hooks> => {
  // 워크스페이스 스토어를 플러그인 인스턴스에 1회 초기화
  const store = new WorkspaceStore({
    worktree: input.worktree,
    client: input.client,
  })
  await store.init()
  const ctx = {
    client: input.client,
    project: input.project,
    directory: input.directory,
    worktree: input.worktree,
    serverUrl: input.serverUrl,
    $: input.$,
  }

  return {
    tool: {
      workspace_add: workspaceAdd({ store, ctx }),
      workspace_list: workspaceList({ store }),
      repomap_query: repomapQuery({ store, ctx }),
      external_read_file: externalReadFile({ store }),
      external_workspace_explore: externalWorkspaceExplore({ store, ctx }),
    },
    "tool.execute.before": onToolBefore({ store, ctx }),
    "tool.execute.after": onToolAfter({ store }),
    "experimental.session.compacting": onCompacting({ store, ctx }),
    event: onSessionCreated({ store, ctx }),
  }
}

export default MultirepoPlugin
