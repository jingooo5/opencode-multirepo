import { tool } from "@opencode-ai/plugin"
import { readGraph } from "../plugin/utils"

export const create = tool({
  description:
    "쓰기 권한이 있는 워크스페이스에 git checkpoint를 생성한다. " +
    "/multirepo 작업 시작 전에 호출하라.",
  args: {
    workspace_ids: tool.schema
      .string()
      .describe("쉼표로 구분된 쓰기 권한 워크스페이스 ID 목록"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json 없음"

    const ids = args.workspace_ids.split(",").map((s) => s.trim())
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const results: string[] = []

    for (const id of ids) {
      const ws = graph.workspaces[id]
      if (!ws) {
        results.push(`SKIP: ${id} — 존재하지 않는 워크스페이스`)
        continue
      }

      const wsPath = `${graph.project.root}/${ws.path}`

      try {
        await Bun.$`cd ${wsPath} && git add -A`.quiet()
        await Bun.$`cd ${wsPath} && git commit --allow-empty -m "multirepo-checkpoint: ${timestamp}" --no-verify`.quiet()

        const hashResult = await Bun.$`cd ${wsPath} && git rev-parse HEAD`.text()
        const hash = hashResult.trim()

        results.push(`OK: ${id} — checkpoint ${hash.substring(0, 8)} 생성 완료`)
      } catch (e) {
        results.push(`ERROR: ${id} — ${(e as Error).message}`)
      }
    }

    return results.join("\n")
  },
})

export const rollback = tool({
  description: "권한 위반이 감지된 워크스페이스를 checkpoint로 롤백한다.",
  args: {
    workspace_id: tool.schema.string().describe("롤백할 워크스페이스 ID"),
    commit_hash: tool.schema.string().describe("checkpoint 커밋 해시"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json 없음"

    const ws = graph.workspaces[args.workspace_id]
    if (!ws) return `ERROR: ${args.workspace_id} 워크스페이스 없음`

    const wsPath = `${graph.project.root}/${ws.path}`

    try {
      await Bun.$`cd ${wsPath} && git reset --hard ${args.commit_hash}`.quiet()
      await Bun.$`cd ${wsPath} && git clean -fd`.quiet()
      return `OK: ${args.workspace_id} — ${args.commit_hash.substring(0, 8)}로 롤백 완료`
    } catch (e) {
      return `ERROR: 롤백 실패 — ${(e as Error).message}`
    }
  },
})

export const cleanup = tool({
  description: "작업 정상 완료 후 checkpoint 커밋을 제거한다.",
  args: {
    workspace_ids: tool.schema.string().describe("쉼표로 구분된 워크스페이스 ID 목록"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json 없음"

    const ids = args.workspace_ids.split(",").map((s) => s.trim())
    const results: string[] = []

    for (const id of ids) {
      const ws = graph.workspaces[id]
      if (!ws) continue

      const wsPath = `${graph.project.root}/${ws.path}`

      try {
        const msg = (await Bun.$`cd ${wsPath} && git log -1 --format=%s`.text()).trim()

        if (msg.startsWith("multirepo-checkpoint:")) {
          await Bun.$`cd ${wsPath} && git reset --soft HEAD~1`.quiet()
          results.push(`OK: ${id} — checkpoint 커밋 제거 완료`)
        } else {
          results.push(`SKIP: ${id} — checkpoint 이후 새 커밋 존재, 수동 정리 필요`)
        }
      } catch (e) {
        results.push(`ERROR: ${id} — ${(e as Error).message}`)
      }
    }

    return results.join("\n")
  },
})
