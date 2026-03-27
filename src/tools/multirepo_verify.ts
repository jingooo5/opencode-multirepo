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

    const writableWorkspaceIds = args.writable_workspace_ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const writableIds = new Set(writableWorkspaceIds)

    const violations: string[] = []
    const allowedChanges: string[] = []
    const detectedChanges: string[] = []

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
          const changeRef = `${fileWsId}/${file}`
          detectedChanges.push(changeRef)

          if (!writableIds.has(fileWsId)) {
            violations.push(`Violation: ${file} (workspace: ${fileWsId}, permission: read-only)`)
          } else {
            allowedChanges.push(changeRef)
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          continue
        }
      }
    }

    if (violations.length === 0) {
      context.metadata({
        title: "Verification passed",
        metadata: {
          verificationPassed: true,
          writableWorkspaceIds,
          changedFiles: detectedChanges,
          changedFileCount: detectedChanges.length,
          violationCount: 0,
        },
      })

      return [
        "## Verification passed",
        "",
        `${allowedChanges.length} changed file(s), no permission violations.`,
        "",
        "Next step: call multirepo_checkpoint cleanup to remove checkpoint commits.",
      ].join("\n")
    }

    context.metadata({
      title: "Permission violations detected",
      metadata: {
        verificationPassed: false,
        writableWorkspaceIds,
        changedFiles: detectedChanges,
        changedFileCount: detectedChanges.length,
        violationCount: violations.length,
      },
    })

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
