import { tool } from "@opencode-ai/plugin"
import { readGraph, resolveWorkspace } from "../plugin/utils"

export default tool({
  description:
    "After work completes, verify whether changed files respected access permissions. " +
    "If violations exist, return violation details; otherwise return a pass result.",
  args: {
    writable_workspace_ids: tool.schema
      .string()
      .describe("Comma-separated list of workspace IDs with write permission"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json not found"

    const writableIds = new Set(args.writable_workspace_ids.split(",").map((s) => s.trim()))

    const violations: string[] = []
    const allChanges: string[] = []

    for (const [wsId, ws] of Object.entries(graph.workspaces)) {
      const wsPath = `${graph.project.root}/${ws.path}`

      try {
        const diffResult = await Bun.$`cd ${wsPath} && git diff --name-only HEAD 2>/dev/null`.text()
        const untrackedResult = await Bun.$`cd ${wsPath} && git ls-files --others --exclude-standard 2>/dev/null`.text()

        const changedFiles = [
          ...diffResult.trim().split("\n").filter(Boolean),
          ...untrackedResult.trim().split("\n").filter(Boolean),
        ]

        for (const file of changedFiles) {
          const fullPath = `${wsPath}/${file}`
          const fileWsId = resolveWorkspace(graph, fullPath) || wsId

          if (!writableIds.has(fileWsId)) {
            violations.push(`Violation: ${file} (workspace: ${fileWsId}, permission: read-only)`)
          } else {
            allChanges.push(`${fileWsId}/${file}`)
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          continue
        }
      }
    }

    if (violations.length === 0) {
      return [
        "## Verification passed",
        "",
        `${allChanges.length} changed file(s), no permission violations.`,
        "",
        "Next step: call multirepo_checkpoint cleanup to remove checkpoint commits.",
      ].join("\n")
    }

    return [
      "## Permission violations detected",
      "",
      ...violations,
      "",
      `${violations.length} violation(s) detected in total.`,
      "",
      "Next steps:",
      "1. Roll back violated workspaces using multirepo_checkpoint rollback.",
      "2. Rework based on violation reasons so only writable workspaces are modified.",
      "3. Call multirepo_verify again after rework.",
      "4. If it still fails after up to 3 attempts, report to the user.",
    ].join("\n")
  },
})
