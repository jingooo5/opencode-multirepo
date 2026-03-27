import * as fs from "fs"
import * as path from "path"
import type { GraphJson, WorkspacePermission } from "./types"

const MEMORY_DIR = ".opencode/plugins/multirepo"
const PROJECT_MD_FILE = "project.md"
const LEGACY_WORKSPACES_MD_FILE = "workspaces.md"

export function readGraph(projectRoot: string): GraphJson | null {
  const graphPath = path.join(projectRoot, MEMORY_DIR, "graph.json")
  if (!fs.existsSync(graphPath)) return null
  return JSON.parse(fs.readFileSync(graphPath, "utf-8"))
}

export function writeGraph(projectRoot: string, graph: GraphJson): void {
  const dir = path.join(projectRoot, MEMORY_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "graph.json"), JSON.stringify(graph, null, 2))
}

export function readProjectMd(projectRoot: string): string | null {
  const projectMdPath = path.join(projectRoot, MEMORY_DIR, PROJECT_MD_FILE)
  if (fs.existsSync(projectMdPath)) {
    return fs.readFileSync(projectMdPath, "utf-8")
  }

  const legacyPath = path.join(projectRoot, MEMORY_DIR, LEGACY_WORKSPACES_MD_FILE)
  if (!fs.existsSync(legacyPath)) return null
  return fs.readFileSync(legacyPath, "utf-8")
}

export function writeProjectMd(projectRoot: string, content: string): void {
  const dir = path.join(projectRoot, MEMORY_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, PROJECT_MD_FILE), content)
  fs.writeFileSync(path.join(dir, LEGACY_WORKSPACES_MD_FILE), content)
}

export function readWorkspacesMd(projectRoot: string): string | null {
  return readProjectMd(projectRoot)
}

export function writeWorkspacesMd(projectRoot: string, content: string): void {
  writeProjectMd(projectRoot, content)
}

export function getRelatedWorkspaces(graph: GraphJson, activeIds: string[]): string[] {
  const workspaces = graph.workspaces
  const result = new Set<string>()

  function collect(wsId: string) {
    if (result.has(wsId) || !(wsId in workspaces)) return
    result.add(wsId)
    for (const dep of workspaces[wsId].depends_on) {
      collect(dep)
    }
  }

  for (const id of activeIds) {
    collect(id)
  }

  return Array.from(result)
}

export function resolveWorktree(graph: GraphJson, currentPath: string): string | null {
  for (const [wsId, ws] of Object.entries(graph.workspaces)) {
    if (ws.worktrees.includes(currentPath)) return wsId
  }
  return null
}

export function resolveWorkspace(graph: GraphJson, filePath: string): string | null {
  const relPath = path.relative(graph.project.root, filePath)
  for (const [wsId, ws] of Object.entries(graph.workspaces)) {
    if (relPath.startsWith(ws.path + "/") || relPath === ws.path) return wsId
  }
  return resolveWorktree(graph, filePath)
}

export function extractContext(workspacesMd: string, wsIds: string[]): string {
  const sections = workspacesMd.split(/^## /m)

  const header = sections[0]

  const matched: string[] = []
  for (const section of sections.slice(1)) {
    const sectionId = section.split("\n")[0].trim()
    if (wsIds.includes(sectionId)) {
      matched.push(`## ${section}`)
    }
  }

  return header.trim() + "\n\n" + matched.join("\n")
}

export function assignPermissions(
  graph: GraphJson,
  activeIds: string[],
  allRelatedIds: string[]
): WorkspacePermission[] {
  const activeSet = new Set(activeIds)
  return allRelatedIds.map((id) => ({
    id,
    access: activeSet.has(id) ? "readwrite" : "read",
  }))
}
