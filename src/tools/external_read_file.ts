import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { WorkspaceStore } from "../workspace/store"
import { displayWorkspacePath, resolveWorkspacePath, selectWorkspace } from "../workspace/permission"

const MAX_FILE_BYTES = 256 * 1024

export const externalReadFile = ({ store }: { store: WorkspaceStore }): ToolDefinition =>
  tool({
    description: "등록된 외부 워크스페이스 내부 파일을 read 권한과 realpath containment 확인 후 읽는다.",
    args: {
      path: tool.schema.string().describe("읽을 파일 경로"),
      workspace_id: tool.schema.string().nullable().default(null).describe("대상 워크스페이스 id"),
    },
    async execute(args) {
      const workspaces = await store.list()
      const workspace = selectWorkspace(workspaces, args.workspace_id)
      const resolved = await resolveWorkspacePath(workspace, args.path)
      const file = Bun.file(resolved.path)
      const info = await file.stat()
      if (!info.isFile()) {
        throw new Error(`Path is not a file: ${args.path}`)
      }
      if (info.size > MAX_FILE_BYTES) {
        throw new Error(`Path exceeds external_read_file size limit: ${args.path}`)
      }

      return {
        output: await file.text(),
        metadata: {
          path: displayWorkspacePath(resolved.root, resolved.path),
          workspace_id: workspace.id,
          workspace_count: workspaces.length,
        },
      }
    },
  })
