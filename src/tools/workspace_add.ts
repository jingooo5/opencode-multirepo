import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { WorkspaceStore } from "../workspace/store"
import type { AppContext } from "../types"

export const workspaceAdd = ({ store }: { store: WorkspaceStore; ctx: AppContext }): ToolDefinition =>
  tool({
    description:
      "현재 세션에 외부 워크스페이스를 추가한다. 사용자가 다른 레포지토리나 " +
      "디렉토리를 함께 보고 싶다고 명시할 때 호출. 기본 read-only로 추가됨. " +
      "쓰기 권한이 필요하면 writable=true로 명시.",
    args: {
      path: tool.schema.string().describe("로컬 절대 경로 또는 워크트리 상대 경로"),
      remote: tool.schema
        .string()
        .nullable()
        .default(null)
        .describe('GitHub 원격 형식: "github:org/repo@branch"'),
      writable: tool.schema.boolean().default(false).describe("쓰기 권한 부여 여부"),
    },
    async execute(args) {
      const id = await store.add({
        path: args.path,
        remote: args.remote,
        permissions: { read: true, write: args.writable, exec: false },
      })
      // 백그라운드 인덱싱 시작 (await하지 않음)
      void store.startIndexing(id)
      return `워크스페이스 추가 완료 (id=${id}, write=${args.writable}). 인덱싱이 백그라운드에서 시작됩니다.`
    },
  })

// workspace_list는 같은 파일에 named export
export const workspaceList = ({ store }: { store: WorkspaceStore }): ToolDefinition =>
  tool({
    description: "현재 세션의 활성 워크스페이스 목록과 권한·인덱스 상태를 반환한다.",
    args: {},
    async execute() {
      const list = await store.list()
      return JSON.stringify(list, null, 2)
    },
  })
