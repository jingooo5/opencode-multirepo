import { tool } from "@opencode-ai/plugin"
import { readGraph } from "../plugin/utils"

export const create = tool({
  description:
    "Create git checkpoints for workspaces with write permission. " +
    "Call this before starting /multirepo work.",
  args: {
    workspace_ids: tool.schema
      .string()
      .describe("Comma-separated list of workspace IDs with write permission"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json not found"

    const ids = args.workspace_ids.split(",").map((s) => s.trim())
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const results: string[] = []

    for (const id of ids) {
      const ws = graph.workspaces[id]
      if (!ws) {
        results.push(`SKIP: ${id} — workspace does not exist`)
        continue
      }

      const wsPath = `${graph.project.root}/${ws.path}`

      try {
        await Bun.$`cd ${wsPath} && git add -A`.quiet()
        await Bun.$`cd ${wsPath} && git commit --allow-empty -m "multirepo-checkpoint: ${timestamp}" --no-verify`.quiet()

        const hashResult = await Bun.$`cd ${wsPath} && git rev-parse HEAD`.text()
        const hash = hashResult.trim()

        results.push(`OK: ${id} — checkpoint ${hash.substring(0, 8)} created`)
      } catch (e) {
        results.push(`ERROR: ${id} — ${(e as Error).message}`)
      }
    }

    return results.join("\n")
  },
})

export const rollback = tool({
  description: "Roll back a workspace with detected permission violations to a checkpoint.",
  args: {
    workspace_id: tool.schema.string().describe("Workspace ID to roll back"),
    commit_hash: tool.schema.string().describe("Checkpoint commit hash"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json not found"

    const ws = graph.workspaces[args.workspace_id]
    if (!ws) return `ERROR: ${args.workspace_id} workspace not found`

    const wsPath = `${graph.project.root}/${ws.path}`

    try {
      await Bun.$`cd ${wsPath} && git reset --hard ${args.commit_hash}`.quiet()
      await Bun.$`cd ${wsPath} && git clean -fd`.quiet()
      return `OK: ${args.workspace_id} — rolled back to ${args.commit_hash.substring(0, 8)}`
    } catch (e) {
      return `ERROR: rollback failed — ${(e as Error).message}`
    }
  },
})

export const cleanup = tool({
  description: "Remove checkpoint commits after successful completion.",
  args: {
    workspace_ids: tool.schema.string().describe("Comma-separated list of workspace IDs"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json not found"

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
          results.push(`OK: ${id} — checkpoint commit removed`)
        } else {
          results.push(`SKIP: ${id} — new commits exist after checkpoint, manual cleanup required`)
        }
      } catch (e) {
        results.push(`ERROR: ${id} — ${(e as Error).message}`)
      }
    }

    return results.join("\n")
  },
})
