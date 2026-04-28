import type { RepoMapEntry } from "./indexer"
import Graph from "graphology"
import pagerank from "graphology-pagerank"

const buildGraph = (entries: RepoMapEntry[]): Graph => {
  const graph = new Graph({ type: "directed", allowSelfLoops: false })
  const indexedFiles = new Set(entries.map((entry) => entry.file))

  for (const entry of entries) {
    graph.mergeNode(entry.file)
  }

  for (const entry of entries) {
    for (const imported of entry.imports) {
      if (indexedFiles.has(imported) && imported !== entry.file) {
        graph.mergeDirectedEdge(entry.file, imported)
      }
    }
  }

  return graph
}

export const rankRepoMapEntries = (entries: RepoMapEntry[]): RepoMapEntry[] => {
  if (entries.length === 0) {
    return []
  }

  const graph = buildGraph(entries)
  const ranks = pagerank(graph, { alpha: 0.85, weighted: false })
  return [...entries]
    .map((entry) => ({
      ...entry,
      score: entry.score + (ranks[entry.file] ?? 0),
    }))
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file))
}
