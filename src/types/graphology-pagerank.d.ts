declare module "graphology-pagerank" {
  import type Graph from "graphology"

  export type PageRankOptions = {
    alpha?: number
    maxIterations?: number
    tolerance?: number
    weighted?: boolean
    attributes?: {
      pagerank?: string
      weight?: string
    }
  }

  type PageRank = {
    (graph: Graph, options?: PageRankOptions): Record<string, number>
    assign(graph: Graph, options?: PageRankOptions): void
  }

  const pagerank: PageRank
  export default pagerank
}
