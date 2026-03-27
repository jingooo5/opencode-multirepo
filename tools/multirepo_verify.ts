import { tool } from "@opencode-ai/plugin"
import { readGraph, resolveWorkspace } from "../plugin/utils"

export default tool({
  description:
    "작업 완료 후 변경된 파일이 접근 권한을 지켰는지 검증한다. " +
    "위반이 있으면 위반 내역을 반환하고, 없으면 통과를 반환한다.",
  args: {
    writable_workspace_ids: tool.schema
      .string()
      .describe("쉼표로 구분된 쓰기 권한 워크스페이스 ID 목록"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) return "ERROR: graph.json 없음"

    const writableIds = new Set(args.writable_workspace_ids.split(",").map((s) => s.trim()))

    const violations: string[] = []
    const allChanges: string[] = []

    for (const [wsId, ws] of Object.entries(graph.workspaces)) {
      const wsPath = `${graph.project.root}/${ws.path}`

      try {
        const diffResult = await Bun.$`cd ${wsPath} && git diff --name-only HEAD 2>/dev/null`.text()
        const untrackedResult = await Bun.$`cd ${wsPath} && git ls-files --others --exclude-standard 2>/dev/null`.text()

        const changedFiles = [
          ...diffResult.trim().split("\n").filter(Boolean),
          ...untrackedResult.trim().split("\n").filter(Boolean),
        ]

        for (const file of changedFiles) {
          const fullPath = `${wsPath}/${file}`
          const fileWsId = resolveWorkspace(graph, fullPath) || wsId

          if (!writableIds.has(fileWsId)) {
            violations.push(`위반: ${file} (워크스페이스: ${fileWsId}, 권한: 읽기 전용)`)
          } else {
            allChanges.push(`${fileWsId}/${file}`)
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          continue
        }
      }
    }

    if (violations.length === 0) {
      return [
        "## 검증 통과",
        "",
        `변경된 파일 ${allChanges.length}개, 권한 위반 없음.`,
        "",
        "다음 단계: multirepo_checkpoint의 cleanup을 호출하여 checkpoint를 정리하라.",
      ].join("\n")
    }

    return [
      "## 권한 위반 감지",
      "",
      ...violations,
      "",
      `총 ${violations.length}건의 위반이 발견되었다.`,
      "",
      "다음 단계:",
      "1. multirepo_checkpoint의 rollback으로 위반된 워크스페이스를 롤백하라.",
      "2. 위반 사유를 참고하여 쓰기 권한이 있는 워크스페이스만 수정하도록 재작업하라.",
      "3. 재작업 후 다시 multirepo_verify를 호출하라.",
      "4. 최대 3회 반복 후에도 실패하면 사용자에게 보고하라.",
    ].join("\n")
  },
})
