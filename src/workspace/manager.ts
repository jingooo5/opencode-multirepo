import { createHash } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import path from "node:path"
import { WorkspaceSchema, WorkspacesFileSchema, type Workspace, type WorkspacesFile } from "../types"

export type WorkspaceAddInput = {
  path: string
  remote?: string | null
  permissions?: Partial<Workspace["permissions"]>
  indexing?: Partial<Workspace["indexing"]>
  summary?: string
}

export type WorkspaceManagerOptions = {
  worktree: string
  configPath?: string
}

const WORKSPACES_SCHEMA_URL = "https://opencode.ai/schemas/workspaces.json"

const emptyWorkspacesFile = (): WorkspacesFile => WorkspacesFileSchema.parse({})

const stableWorkspaceId = (workspacePath: string): string => {
  const name = path.basename(workspacePath) || "workspace"
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"
  const digest = createHash("sha256").update(workspacePath).digest("hex").slice(0, 12)
  return `${slug}-${digest}`
}

export class WorkspaceManager {
  private readonly worktree: string
  private readonly configPath: string
  private file: WorkspacesFile = emptyWorkspacesFile()
  private initialized = false
  private readonly indexing = new Set<string>()

  constructor(options: WorkspaceManagerOptions) {
    this.worktree = path.resolve(options.worktree)
    this.configPath = options.configPath ?? path.join(this.worktree, ".opencode", "workspaces.json")
  }

  async init(): Promise<void> {
    this.file = await this.load()
    this.initialized = true
  }

  getWorkspacesFilePath(): string {
    return this.configPath
  }

  async load(): Promise<WorkspacesFile> {
    const file = Bun.file(this.configPath)

    if (!(await file.exists())) {
      const empty = emptyWorkspacesFile()
      this.file = empty
      return empty
    }

    const text = await file.text()
    const raw: unknown = text.trim().length === 0 ? {} : JSON.parse(text)
    const parsed = WorkspacesFileSchema.parse(raw)
    this.file = parsed
    return parsed
  }

  async save(file: WorkspacesFile = this.file): Promise<void> {
    const parsed = WorkspacesFileSchema.parse(file)
    await mkdir(path.dirname(this.configPath), { recursive: true })
    await Bun.write(this.configPath, `${JSON.stringify(parsed, null, 2)}\n`)
    this.file = parsed
    this.initialized = true
  }

  async list(): Promise<Workspace[]> {
    await this.ensureInitialized()
    return this.file.workspaces.map((workspace) => ({ ...workspace }))
  }

  async add(input: WorkspaceAddInput): Promise<string> {
    await this.ensureInitialized()

    const workspacePath = await this.canonicalWorkspacePath(input.path)
    const id = stableWorkspaceId(workspacePath)
    const workspace = WorkspaceSchema.parse({
      id,
      path: workspacePath,
      remote: input.remote ?? null,
      permissions: {
        read: input.permissions?.read ?? true,
        write: input.permissions?.write ?? false,
        exec: input.permissions?.exec ?? false,
      },
      indexing: {
        include: input.indexing?.include ?? ["**/*"],
        exclude: input.indexing?.exclude ?? [],
        manifest: input.indexing?.manifest ?? "auto",
      },
      summary: input.summary,
    })

    const existingIndex = this.file.workspaces.findIndex((item) => item.id === id)
    const workspaces = [...this.file.workspaces]
    if (existingIndex === -1) {
      workspaces.push(workspace)
    } else {
      workspaces[existingIndex] = workspace
    }

    await this.save({ ...this.file, $schema: this.file.$schema ?? WORKSPACES_SCHEMA_URL, workspaces })
    return id
  }

  async startIndexing(id: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.file.workspaces.some((workspace) => workspace.id === id)) {
      throw new Error(`Workspace not found: ${id}`)
    }

    // MVP indexing is built on demand by repomap_query. Track requested
    // workspace ids transiently so callers can safely trigger warm-up signals
    // without noisy writes or unsafe background filesystem scans.
    this.indexing.add(id)
  }

  isIndexing(id: string): boolean {
    return this.indexing.has(id)
  }

  normalizeWorkspacePath(workspacePath: string): string {
    const resolved = path.isAbsolute(workspacePath)
      ? path.resolve(workspacePath)
      : path.resolve(this.worktree, workspacePath)
    return path.normalize(resolved)
  }

  private async canonicalWorkspacePath(workspacePath: string): Promise<string> {
    return path.normalize(await realpath(this.normalizeWorkspacePath(workspacePath)))
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init()
    }
  }
}
