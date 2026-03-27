#!/usr/bin/env node

import fs from "fs"
import os from "os"
import path from "path"

const TARGETS = [
  {
    sourceRelativePath: "src/plugin/multirepo.ts",
    destinationRelativePath: "plugins/multirepo.ts",
    label: "플러그인",
  },
  {
    sourceRelativePath: "src/tools/multirepo_context.ts",
    destinationRelativePath: "tools/multirepo_context.ts",
    label: "커스텀 도구",
  },
  {
    sourceRelativePath: "src/tools/multirepo_checkpoint.ts",
    destinationRelativePath: "tools/multirepo_checkpoint.ts",
    label: "커스텀 도구",
  },
  {
    sourceRelativePath: "src/tools/multirepo_verify.ts",
    destinationRelativePath: "tools/multirepo_verify.ts",
    label: "커스텀 도구",
  },
  {
    sourceRelativePath: "src/agents/architecture.md",
    destinationRelativePath: "agents/architecture.md",
    label: "에이전트",
  },
  {
    sourceRelativePath: "src/agents/indexer.md",
    destinationRelativePath: "agents/indexer.md",
    label: "에이전트",
  },
  {
    sourceRelativePath: "src/skills/git/SKILL.md",
    destinationRelativePath: "skills/multirepo-git/SKILL.md",
    label: "스킬",
  },
  {
    sourceRelativePath: "src/skills/github/SKILL.md",
    destinationRelativePath: "skills/multirepo-github/SKILL.md",
    label: "스킬",
  },
  {
    sourceRelativePath: "src/commands/multirepo.md",
    destinationRelativePath: "commands/multirepo.md",
    label: "명령어",
  },
]

function printUsage() {
  console.log(`Usage: npm run install:plugin -- [options]

Options:
  --config-dir <path>   OpenCode config directory (default: ~/.config/opencode)
  --project-dir <path>  Plugin project directory (default: current working directory)
  --mode <symlink|copy> Install mode (default: symlink)
  --dry-run             Print actions without applying changes
  --help                Show this help
`)
}

function parseArgs(argv) {
  const options = {
    configDir: path.join(os.homedir(), ".config/opencode"),
    projectDir: process.cwd(),
    mode: "symlink",
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === "--help") {
      printUsage()
      process.exit(0)
    }

    if (arg === "--dry-run") {
      options.dryRun = true
      continue
    }

    if (arg === "--config-dir") {
      const value = argv[i + 1]
      if (!value) {
        throw new Error("--config-dir 옵션에는 경로 값이 필요합니다.")
      }
      options.configDir = path.resolve(value)
      i += 1
      continue
    }

    if (arg === "--project-dir") {
      const value = argv[i + 1]
      if (!value) {
        throw new Error("--project-dir 옵션에는 경로 값이 필요합니다.")
      }
      options.projectDir = path.resolve(value)
      i += 1
      continue
    }

    if (arg === "--mode") {
      const value = argv[i + 1]
      if (value !== "symlink" && value !== "copy") {
        throw new Error("--mode 옵션은 symlink 또는 copy 만 허용됩니다.")
      }
      options.mode = value
      i += 1
      continue
    }

    throw new Error(`알 수 없는 옵션입니다: ${arg}`)
  }

  return options
}

function ensureDirectory(dirPath, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] mkdir -p ${dirPath}`)
    return
  }
  fs.mkdirSync(dirPath, { recursive: true })
}

function removeIfExists(targetPath, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] rm -rf ${targetPath}`)
    return
  }

  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function installTarget(options, target) {
  const sourcePath = path.join(options.projectDir, target.sourceRelativePath)
  const destinationPath = path.join(options.configDir, target.destinationRelativePath)

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`원본 파일을 찾을 수 없습니다: ${sourcePath}`)
  }

  ensureDirectory(path.dirname(destinationPath), options.dryRun)
  removeIfExists(destinationPath, options.dryRun)

  if (options.mode === "symlink") {
    if (options.dryRun) {
      console.log(`[dry-run] ln -sf ${sourcePath} ${destinationPath}`)
    } else {
      fs.symlinkSync(sourcePath, destinationPath)
    }
    return
  }

  if (options.dryRun) {
    console.log(`[dry-run] cp ${sourcePath} ${destinationPath}`)
  } else {
    fs.copyFileSync(sourcePath, destinationPath)
  }
}

function ensurePluginDependency(options) {
  const packageJsonPath = path.join(options.configDir, "package.json")

  if (!fs.existsSync(packageJsonPath)) {
    const initialPackageJson = {
      name: "opencode-config",
      private: true,
      dependencies: {
        "@opencode-ai/plugin": "latest",
      },
    }

    if (options.dryRun) {
      console.log(`[dry-run] create ${packageJsonPath} with @opencode-ai/plugin dependency`)
      return
    }

    fs.writeFileSync(packageJsonPath, `${JSON.stringify(initialPackageJson, null, 2)}\n`, "utf-8")
    return
  }

  const raw = fs.readFileSync(packageJsonPath, "utf-8")
  const parsed = JSON.parse(raw)

  if (parsed.dependencies?.["@opencode-ai/plugin"]) {
    return
  }

  const next = {
    ...parsed,
    dependencies: {
      ...(parsed.dependencies ?? {}),
      "@opencode-ai/plugin": "latest",
    },
  }

  if (options.dryRun) {
    console.log(`[dry-run] update ${packageJsonPath}: add @opencode-ai/plugin dependency`)
    return
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
}

function summarizeByLabel(targets) {
  const summary = new Map()

  for (const target of targets) {
    summary.set(target.label, (summary.get(target.label) ?? 0) + 1)
  }

  return summary
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  console.log("=== OpenCode Multirepo Plugin 설치 ===")
  console.log(`projectDir: ${options.projectDir}`)
  console.log(`configDir:  ${options.configDir}`)
  console.log(`mode:       ${options.mode}${options.dryRun ? " (dry-run)" : ""}`)

  ensureDirectory(options.configDir, options.dryRun)

  for (const target of TARGETS) {
    installTarget(options, target)
  }

  const summary = summarizeByLabel(TARGETS)
  for (const [label, count] of summary) {
    console.log(`✓ ${label} ${count}개 등록 완료`)
  }

  ensurePluginDependency(options)
  console.log("✓ package.json 설정 완료")

  console.log("")
  console.log("=== 설치 완료 ===")
  console.log("OpenCode를 재시작하면 다음을 사용할 수 있습니다:")
  console.log("  - @architecture 에이전트: 프로젝트 구조 설계 및 초기화")
  console.log("  - @indexer 에이전트: 의존성 변경 감지 및 메모리 업데이트")
  console.log("  - /multirepo 명령어: 멀티레포 컨텍스트 기반 작업")
}

main()
