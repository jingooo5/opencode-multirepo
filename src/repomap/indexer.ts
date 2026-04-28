import { opendir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import type { Workspace } from "../types"
import { displayWorkspacePath, isPathInside, resolveWorkspaceRoot } from "../workspace/permission"

const MAX_FILES = 200
const MAX_DEPTH = 6
const MAX_SCANNED_CANDIDATES = 2_000
const MAX_FILE_BYTES = 64 * 1024
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", "coverage"])
const INDEXABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".py",
  ".go",
  ".rs",
])

export type RepoMapEntry = {
  workspace_id: string
  file: string
  symbols: string[]
  excerpt: string
  score: number
  imports: string[]
}

export type RepoMap = {
  workspace_id: string
  root: string
  entries: RepoMapEntry[]
  truncated: boolean
}

const extractSymbols = (source: string): string[] => {
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bdef\s+([A-Za-z_][\w]*)\s*\(/g,
    /\bfunc\s+([A-Za-z_][\w]*)\s*\(/g,
  ]
  const symbols = new Set<string>()
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const symbol = match[1]
      if (symbol !== undefined) {
        symbols.add(symbol)
      }
    }
  }
  return [...symbols].sort((left, right) => left.localeCompare(right))
}

const makeExcerpt = (source: string): string =>
  source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3)
    .join("\n")

const extractImports = (source: string): string[] => {
  const patterns = [
    /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"']+\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ]
  const imports = new Set<string>()
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const imported = match[1]
      if (imported !== undefined && imported.startsWith(".")) {
        imports.add(imported)
      }
    }
  }
  return [...imports].sort((left, right) => left.localeCompare(right))
}

const globToRegExp = (glob: string): RegExp => {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const pattern = escaped.replace(/\*\*/g, "::DOUBLE_STAR::").replace(/\*/g, "[^/]*").replace(/::DOUBLE_STAR::/g, ".*")
  return new RegExp(`^${pattern}$`)
}

const matchesPatterns = (relativePath: string, patterns: string[]): boolean =>
  patterns.some((pattern) => globToRegExp(pattern).test(relativePath) || globToRegExp(`${pattern}/**`).test(relativePath))

const isIncludedByWorkspaceConfig = (workspace: Workspace, relativePath: string): boolean => {
  const normalized = relativePath.split(path.sep).join("/")
  const includes = workspace.indexing.include.length === 0 ? ["**/*"] : workspace.indexing.include
  return matchesPatterns(normalized, includes) && !matchesPatterns(normalized, workspace.indexing.exclude)
}

const isExcludedByWorkspaceConfig = (workspace: Workspace, relativePath: string): boolean => {
  const normalized = relativePath.split(path.sep).join("/")
  return matchesPatterns(normalized, workspace.indexing.exclude)
}

const resolveImportFile = (fromFile: string, imported: string, indexedFiles: Set<string>): string | null => {
  const base = path.posix.dirname(fromFile)
  const candidate = path.posix.normalize(path.posix.join(base, imported))
  const candidates = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.js`,
    `${candidate}.jsx`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    path.posix.join(candidate, "index.ts"),
    path.posix.join(candidate, "index.tsx"),
    path.posix.join(candidate, "index.js"),
    path.posix.join(candidate, "index.jsx"),
  ]
  return candidates.find((item) => indexedFiles.has(item)) ?? null
}

export const buildRepoMap = async (workspace: Workspace): Promise<RepoMap> => {
  const { root } = await resolveWorkspaceRoot(workspace)
  const entries: RepoMapEntry[] = []
  let truncated = false
  let scannedCandidates = 0

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (entries.length >= MAX_FILES || depth > MAX_DEPTH || scannedCandidates >= MAX_SCANNED_CANDIDATES) {
      truncated = true
      return
    }

    const dir = await opendir(directory)
    for await (const dirEntry of dir) {
      scannedCandidates += 1
      if (entries.length >= MAX_FILES || scannedCandidates >= MAX_SCANNED_CANDIDATES) {
        truncated = true
        return
      }

      if (dirEntry.name.startsWith(".") && dirEntry.name !== ".github") {
        continue
      }

      const candidate = path.join(directory, dirEntry.name)
      const realCandidate = path.normalize(await realpath(candidate))
      if (!isPathInside(root, realCandidate)) {
        continue
      }
      const relativePath = displayWorkspacePath(root, realCandidate)
      if (isExcludedByWorkspaceConfig(workspace, relativePath)) {
        continue
      }

      if (dirEntry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(dirEntry.name)) {
          await visit(candidate, depth + 1)
        }
        continue
      }

      if (!dirEntry.isFile() || !INDEXABLE_EXTENSIONS.has(path.extname(dirEntry.name))) {
        continue
      }
      if (!isIncludedByWorkspaceConfig(workspace, relativePath)) {
        continue
      }

      const info = await stat(realCandidate)
      if (info.size > MAX_FILE_BYTES) {
        continue
      }

      const source = await Bun.file(realCandidate).text()
      const symbols = extractSymbols(source)
      entries.push({
        workspace_id: workspace.id,
        file: relativePath,
        symbols,
        excerpt: makeExcerpt(source),
        imports: extractImports(source),
        score: symbols.length,
      })
    }
  }

  await visit(root, 0)
  const indexedFiles = new Set(entries.map((entry) => entry.file))
  const resolvedEntries = entries.map((entry) => ({
    ...entry,
    imports: entry.imports
      .map((imported) => resolveImportFile(entry.file, imported, indexedFiles))
      .filter((imported): imported is string => imported !== null),
  }))
  resolvedEntries.sort((left, right) => left.file.localeCompare(right.file))
  return { workspace_id: workspace.id, root, entries: resolvedEntries, truncated }
}

export const queryRepoMap = async (workspace: Workspace, query: string): Promise<RepoMap> => {
  const normalizedQuery = query.trim().toLowerCase()
  const map = await buildRepoMap(workspace)
  if (normalizedQuery.length === 0) {
    return map
  }

  const entries = map.entries
    .map((entry) => {
      const fileMatch = entry.file.toLowerCase().includes(normalizedQuery)
      const symbolMatches = entry.symbols.filter((symbol) => symbol.toLowerCase().includes(normalizedQuery)).length
      const excerptMatch = entry.excerpt.toLowerCase().includes(normalizedQuery)
      const score = (fileMatch ? 3 : 0) + symbolMatches * 5 + (excerptMatch ? 1 : 0)
      return { entry, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.file.localeCompare(right.entry.file))
    .slice(0, 20)
    .map((item) => ({ ...item.entry, score: item.score }))

  return { ...map, entries }
}
