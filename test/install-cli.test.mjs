import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectDir = path.resolve(__dirname, "..")
const installCliPath = path.join(projectDir, "src/cli/install.mjs")

function runInstall(extraArgs = [], env = {}) {
  const result = spawnSync(
    process.execPath,
    [installCliPath, "--dry-run", "--project-dir", projectDir, ...extraArgs],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        ...env,
      },
      encoding: "utf-8",
    },
  )

  assert.equal(result.status, 0, `install script failed:\n${result.stderr}`)
  return result.stdout
}

test("uses OPENCODE_CONFIG_DIR by default", () => {
  const expectedDir = "/tmp/opencode-config-dir"
  const stdout = runInstall([], {
    OPENCODE_CONFIG_DIR: expectedDir,
  })

  assert.match(stdout, new RegExp(`configDir:\\s+${expectedDir}`))
})

test("uses dirname(OPENCODE_CONFIG) when OPENCODE_CONFIG_DIR is not set", () => {
  const configFilePath = "/tmp/opencode-config/custom.json"
  const expectedDir = path.dirname(configFilePath)
  const stdout = runInstall([], {
    OPENCODE_CONFIG_DIR: "",
    OPENCODE_CONFIG: configFilePath,
  })

  assert.match(stdout, new RegExp(`configDir:\\s+${expectedDir}`))
})

test("--config-dir overrides environment defaults", () => {
  const overrideDir = "/tmp/opencode-override"
  const stdout = runInstall(["--config-dir", overrideDir], {
    OPENCODE_CONFIG_DIR: "/tmp/opencode-config-dir",
    OPENCODE_CONFIG: "/tmp/opencode-config/custom.json",
  })

  assert.match(stdout, new RegExp(`configDir:\\s+${overrideDir}`))
})
