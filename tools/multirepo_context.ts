import { tool } from "@opencode-ai/plugin"
import {
  readGraph,
  readWorkspacesMd,
  getRelatedWorkspaces,
  extractContext,
  assignPermissions,
  resolveWorktree,
} from "../plugin/utils"

export default tool({
  description:
    "Extract multirepo context. Takes active workspace IDs, traverses the dependency graph, " +
    "and returns only related sections from workspaces.md along with permission information.",
  args: {
    active_workspace_ids: tool.schema
      .string()
      .describe("Comma-separated list of active workspace IDs (e.g., frontend,auth-server)"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) {
      return "ERROR: graph.json not found. Initialize the project first with the @architecture agent."
    }

    const workspacesMd = readWorkspacesMd(context.directory)
    if (!workspacesMd) {
      return "ERROR: workspaces.md not found. Initialize the project first with the @architecture agent."
    }

    let activeIds = args.active_workspace_ids.split(",").map((s) => s.trim())
    activeIds = activeIds.map((id) => {
      const resolved = resolveWorktree(graph, id)
      return resolved ?? id
    })

    const invalid = activeIds.filter((id) => !(id in graph.workspaces))
    if (invalid.length > 0) {
      const available = Object.keys(graph.workspaces).join(", ")
      return `ERROR: non-existent workspace(s): ${invalid.join(", ")}\nAvailable: ${available}`
    }

    const allRelated = getRelatedWorkspaces(graph, activeIds)

    const permissions = assignPermissions(graph, activeIds, allRelated)

    const contextMd = extractContext(workspacesMd, allRelated)

    const permissionSummary = permissions
      .map((p) => `- ${p.id}: ${p.access === "readwrite" ? "read/write" : "read-only"}`)
      .join("\n")

    return [
      "## Multirepo context loaded\n",
      "### Active workspace permissions",
      permissionSummary,
      "",
      "### Project context",
      contextMd,
      "",
      "### Work rules",
      "- You may modify files only in read/write workspaces.",
      "- Do not modify files in read-only workspaces.",
      "- After completing work, validate permission compliance using the multirepo_verify tool.",
    ].join("\n")
  },
})
