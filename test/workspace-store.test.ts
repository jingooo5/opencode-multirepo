import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { PluginInput, ToolContext, ToolResult } from "@opencode-ai/plugin"
import { MultirepoPlugin } from "../src/index"
import { externalReadFile } from "../src/tools/external_read_file"
import { externalWorkspaceExplore } from "../src/tools/external_workspace_explore"
import { repomapQuery } from "../src/tools/repomap_query"
import { WorkspaceStore } from "../src/workspace/store"

const tempRoots: string[] = []

const makeTempWorktree = async () => {
  const root = await mkdtemp(join(tmpdir(), "opencode-multirepo-test-"))
  tempRoots.push(root)
  return root
}

const toolContext = undefined as unknown as ToolContext

const objectResult = (result: ToolResult) => {
  expect(typeof result).toBe("object")
  if (typeof result === "string") {
    throw new Error("Expected object tool result")
  }
  return result
}

afterEach(async () => {
  const roots = tempRoots.splice(0)
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })))
})

describe("WorkspaceStore", () => {
  test("loads a missing workspaces config as an empty workspace list", async () => {
    const worktree = await makeTempWorktree()
    const store = new WorkspaceStore({ worktree })

    await store.init()

    expect(await store.list()).toEqual([])
    expect(await Bun.file(join(worktree, ".opencode", "workspaces.json")).exists()).toBe(false)
  })

  test("persists an add/list round-trip in the worktree .opencode directory", async () => {
    const worktree = await makeTempWorktree()
    await mkdir(join(worktree, "packages", "api"), { recursive: true })
    const store = new WorkspaceStore({ worktree })
    await store.init()

    const id = await store.add({ path: "packages/api", remote: "github:acme/api@main" })

    const reloaded = new WorkspaceStore({ worktree })
    await reloaded.init()
    const list = await reloaded.list()

    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id,
      path: join(worktree, "packages", "api"),
      remote: "github:acme/api@main",
    })
  })

  test("applies read-only default permissions and default indexing", async () => {
    const worktree = await makeTempWorktree()
    await mkdir(join(worktree, "..", "shared"), { recursive: true })
    const store = new WorkspaceStore({ worktree })
    await store.init()

    await store.add({ path: "../shared" })

    const [workspace] = await store.list()
    expect(workspace?.permissions).toEqual({ read: true, write: false, exec: false })
    expect(workspace?.indexing).toEqual({ include: ["**/*"], exclude: [], manifest: "auto" })
  })
})

describe("MultirepoPlugin", () => {
  test("initializes basic plugin hooks without a real OpenCode server", async () => {
    const worktree = await makeTempWorktree()
    const input: PluginInput = {
      client: undefined as unknown as PluginInput["client"],
      project: undefined as unknown as PluginInput["project"],
      directory: worktree,
      worktree,
      experimental_workspace: {
        register() {
          return
        },
      },
      serverUrl: new URL("http://localhost"),
      $: undefined as unknown as PluginInput["$"],
    }

    const hooks = await MultirepoPlugin(input)

    expect(hooks.tool?.workspace_add).toBeDefined()
    expect(hooks.tool?.workspace_list).toBeDefined()
    expect(hooks["tool.execute.before"]).toBeFunction()
    expect(hooks.event).toBeFunction()
  })
})

describe("external workspace tools", () => {
  test("external_read_file allows reading a file inside a registered readable workspace", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(join(workspaceRoot, "README.md"), "hello from shared\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot })

    const result = objectResult(
      await externalReadFile({ store }).execute({ path: "README.md", workspace_id: workspaceId }, toolContext),
    )

    expect(result.output).toBe("hello from shared\n")
    expect(result.metadata?.path).toBe("README.md")
  })

  test("external_read_file rejects path traversal outside the registered workspace", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(join(worktree, "secret.txt"), "secret\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot })

    await expect(
      externalReadFile({ store }).execute({ path: "../secret.txt", workspace_id: workspaceId }, toolContext),
    ).rejects.toThrow("Path escapes workspace")
  })

  test("external_read_file rejects absolute paths outside the registered workspace", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    const outsidePath = join(worktree, "outside.txt")
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(outsidePath, "outside\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot })

    await expect(
      externalReadFile({ store }).execute({ path: outsidePath, workspace_id: workspaceId }, toolContext),
    ).rejects.toThrow("Path escapes workspace")
  })

  test("external_read_file rejects symlink escapes after realpath resolution", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    const outsidePath = join(worktree, "outside.txt")
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(outsidePath, "outside\n")
    await symlink(outsidePath, join(workspaceRoot, "link.txt"))

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot })

    await expect(
      externalReadFile({ store }).execute({ path: "link.txt", workspace_id: workspaceId }, toolContext),
    ).rejects.toThrow("Path escapes workspace")
  })

  test("external_read_file and repomap_query require read permission", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    await mkdir(workspaceRoot, { recursive: true })
    await writeFile(join(workspaceRoot, "index.ts"), "export const value = 1\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot, permissions: { read: false } })

    await expect(
      externalReadFile({ store }).execute({ path: "index.ts", workspace_id: workspaceId }, toolContext),
    ).rejects.toThrow("Read permission denied")
    await expect(
      repomapQuery({ store, ctx: undefined as unknown as PluginInput }).execute(
        { query: "value", workspace_id: workspaceId },
        toolContext,
      ),
    ).rejects.toThrow("Read permission denied")
  })

  test("external_workspace_explore returns bounded deterministic workspace entries", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    await mkdir(join(workspaceRoot, "src"), { recursive: true })
    await mkdir(join(workspaceRoot, "node_modules"), { recursive: true })
    await writeFile(join(workspaceRoot, "src", "index.ts"), "export const targetValue = 1\n")
    await writeFile(join(workspaceRoot, "node_modules", "ignored.js"), "ignored\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot })

    const result = objectResult(
      await externalWorkspaceExplore({ store, ctx: undefined as unknown as PluginInput }).execute(
        { workspace_id: workspaceId, query: "src" },
        toolContext,
      ),
    )

    expect(result.output).toContain("src")
    expect(result.output).toContain("src/index.ts")
    expect(result.output).not.toContain("node_modules/ignored.js")
  })

  test("repomap_query returns simple symbol and file matches", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    await mkdir(join(workspaceRoot, "src"), { recursive: true })
    await writeFile(join(workspaceRoot, "src", "index.ts"), "export function targetSymbol() {\n  return 1\n}\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot })

    const result = objectResult(
      await repomapQuery({ store, ctx: undefined as unknown as PluginInput }).execute(
        { query: "targetSymbol", workspace_id: workspaceId },
        toolContext,
      ),
    )

    expect(result.output).toContain("src/index.ts")
    expect(result.output).toContain("targetSymbol")
  })

  test("repomap_query honors workspace indexing exclude patterns", async () => {
    const worktree = await makeTempWorktree()
    const workspaceRoot = join(worktree, "shared")
    await mkdir(join(workspaceRoot, "src"), { recursive: true })
    await mkdir(join(workspaceRoot, "secret"), { recursive: true })
    await writeFile(join(workspaceRoot, "src", "index.ts"), "export const publicSymbol = 1\n")
    await writeFile(join(workspaceRoot, "secret", "token.ts"), "export const secretSymbol = 1\n")

    const store = new WorkspaceStore({ worktree })
    await store.init()
    const workspaceId = await store.add({ path: workspaceRoot, indexing: { exclude: ["secret/**"] } })

    const publicResult = objectResult(
      await repomapQuery({ store, ctx: undefined as unknown as PluginInput }).execute(
        { query: "publicSymbol", workspace_id: workspaceId },
        toolContext,
      ),
    )
    const secretResult = objectResult(
      await repomapQuery({ store, ctx: undefined as unknown as PluginInput }).execute(
        { query: "secretSymbol", workspace_id: workspaceId },
        toolContext,
      ),
    )

    expect(publicResult.output).toContain("src/index.ts")
    expect(secretResult.output).not.toContain("secret/token.ts")
    expect(secretResult.output).not.toContain("secretSymbol")
  })
})
