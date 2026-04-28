import { z } from "zod"
import type { PluginInput } from "@opencode-ai/plugin"

export type AppContext = Pick<
  PluginInput,
  "client" | "project" | "directory" | "worktree" | "serverUrl" | "$"
>

// .opencode/workspaces.json 스키마
export const WorkspaceSchema = z.object({
  id: z.string(),
  path: z.string(),                    // 절대 경로 또는 워크트리 상대
  remote: z.string().nullable(),       // "github:org/repo@main" 또는 null
  permissions: z.object({
    read: z.boolean().default(true),
    write: z.boolean().default(false), // deny-by-default (D6)
    exec: z.boolean().default(false),
  }),
  indexing: z.object({
    include: z.array(z.string()).default(["**/*"]),
    exclude: z.array(z.string()).default([]),
    manifest: z.enum(["auto", "npm", "go", "cargo", "python", "none"]).default("auto"),
  }),
  summary: z.string().optional(),      // D2의 "카드" 컨텐츠
})

export const WorkspacesFileSchema = z.object({
  $schema: z.string().optional(),
  workspaces: z.array(WorkspaceSchema).default([]),
  crossref: z.object({
    explicit_edges: z.array(z.object({
      from: z.string(),
      to: z.string(),
      via: z.enum(["rest", "grpc", "graphql", "import", "manual"]),
    })).default([]),
  }).default({ explicit_edges: [] }),
})

export type Workspace = z.infer<typeof WorkspaceSchema>
export type WorkspacesFile = z.infer<typeof WorkspacesFileSchema>
