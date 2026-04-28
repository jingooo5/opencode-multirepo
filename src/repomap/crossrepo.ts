import type { WorkspacesFile } from "../types"

export const summarizeCrossRepoEdges = (file: WorkspacesFile): string[] =>
  file.crossref.explicit_edges.map((edge) => `${edge.from} -> ${edge.to} (${edge.via})`).sort()
