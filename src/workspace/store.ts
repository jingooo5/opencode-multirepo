import { WorkspaceManager, type WorkspaceAddInput, type WorkspaceManagerOptions } from "./manager"
import type { Workspace, WorkspacesFile } from "../types"

export type WorkspaceStoreOptions = WorkspaceManagerOptions & {
  client?: unknown
}

export class WorkspaceStore {
  private readonly manager: WorkspaceManager
  private readonly client?: unknown

  constructor(options: WorkspaceStoreOptions) {
    this.manager = new WorkspaceManager(options)
    this.client = options.client
  }

  async init(): Promise<void> {
    await this.manager.init()
  }

  async load(): Promise<WorkspacesFile> {
    return this.manager.load()
  }

  async save(file?: WorkspacesFile): Promise<void> {
    await this.manager.save(file)
  }

  async add(input: WorkspaceAddInput): Promise<string> {
    return this.manager.add(input)
  }

  async list(): Promise<Workspace[]> {
    return this.manager.list()
  }

  async startIndexing(id: string): Promise<void> {
    await this.manager.startIndexing(id)
  }

  isIndexing(id: string): boolean {
    return this.manager.isIndexing(id)
  }

  normalizeWorkspacePath(workspacePath: string): string {
    return this.manager.normalizeWorkspacePath(workspacePath)
  }

  getWorkspacesFilePath(): string {
    return this.manager.getWorkspacesFilePath()
  }

  getClient(): unknown {
    return this.client
  }
}

export type { WorkspaceAddInput }
