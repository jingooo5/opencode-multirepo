import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { opendir, realpath } from "node:fs/promises"
import path from "node:path"
import type { AppContext } from "../types"
import type { WorkspaceStore } from "../workspace/store"
import { displayWorkspacePath, isPathInside, resolveWorkspaceRoot, selectWorkspace } from "../workspace/permission"

const MAX_DEPTH = 3
const MAX_ENTRIES = 100
const MAX_SCANNED_CANDIDATES = 1_000
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"])

type ExploreEntry = {
  path: string
  type: "directory" | "file"
}

export const externalWorkspaceExplore = ({ store }: { store: WorkspaceStore; ctx: AppContext }): ToolDefinition =>
  tool({
    description: "등록된 외부 워크스페이스를 read 권한과 realpath containment 확인 후 bounded listing으로 탐색한다.",
    args: {
      workspace_id: tool.schema.string().nullable().default(null).describe("대상 워크스페이스 id"),
      query: tool.schema.string().nullable().default(null).describe("탐색 질의"),
    },
    async execute(args) {
      const workspaces = await store.list()
      const workspace = selectWorkspace(workspaces, args.workspace_id)
      const { root } = await resolveWorkspaceRoot(workspace)
      const query = args.query?.trim().toLowerCase() ?? ""
      const entries: ExploreEntry[] = []
      let truncated = false
      let scannedCandidates = 0

      const visit = async (directory: string, depth: number): Promise<void> => {
        if (entries.length >= MAX_ENTRIES || depth > MAX_DEPTH || scannedCandidates >= MAX_SCANNED_CANDIDATES) {
          truncated = true
          return
        }

        const dir = await opendir(directory)
        for await (const dirEntry of dir) {
          scannedCandidates += 1
          if (entries.length >= MAX_ENTRIES || scannedCandidates >= MAX_SCANNED_CANDIDATES) {
            truncated = true
            return
          }
          if (dirEntry.name.startsWith(".")) {
            continue
          }

          const candidate = path.join(directory, dirEntry.name)
          const realCandidate = path.normalize(await realpath(candidate))
          if (!isPathInside(root, realCandidate)) {
            continue
          }
          const relativePath = displayWorkspacePath(root, realCandidate)
          const matchesQuery = query.length === 0 || relativePath.toLowerCase().includes(query)

          if (dirEntry.isDirectory()) {
            if (matchesQuery) {
              entries.push({ path: relativePath, type: "directory" })
            }
            if (!SKIP_DIRECTORIES.has(dirEntry.name)) {
              await visit(candidate, depth + 1)
            }
            continue
          }

          if (dirEntry.isFile() && matchesQuery) {
            entries.push({ path: relativePath, type: "file" })
          }
        }
      }

      await visit(root, 0)
      return {
        output: JSON.stringify({ workspace_id: workspace.id, entries, truncated }, null, 2),
        metadata: {
          query: args.query,
          workspace_id: workspace.id,
          workspace_count: workspaces.length,
          result_count: entries.length,
          truncated,
        },
      }
    },
  })
