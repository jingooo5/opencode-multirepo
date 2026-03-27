import { tool } from "@opencode-ai/plugin"
import {
  readGraph,
  readWorkspacesMd,
  getRelatedWorkspaces,
  extractContext,
  assignPermissions,
  resolveWorktree,
} from "../plugin/utils"

export default tool({
  description:
    "Multirepo 컨텍스트 추출. 활성 워크스페이스 ID를 받아 의존성 그래프를 순회하고, " +
    "workspaces.md에서 관련 섹션만 추출하여 반환한다. 권한 정보도 함께 반환한다.",
  args: {
    active_workspace_ids: tool.schema
      .string()
      .describe("쉼표로 구분된 활성 워크스페이스 ID 목록 (예: frontend,auth-server)"),
  },
  async execute(args, context) {
    const graph = readGraph(context.directory)
    if (!graph) {
      return "ERROR: graph.json을 찾을 수 없습니다. @architecture 에이전트로 프로젝트를 먼저 초기화하세요."
    }

    const workspacesMd = readWorkspacesMd(context.directory)
    if (!workspacesMd) {
      return "ERROR: workspaces.md를 찾을 수 없습니다. @architecture 에이전트로 프로젝트를 먼저 초기화하세요."
    }

    let activeIds = args.active_workspace_ids.split(",").map((s) => s.trim())
    activeIds = activeIds.map((id) => {
      const resolved = resolveWorktree(graph, id)
      return resolved ?? id
    })

    const invalid = activeIds.filter((id) => !(id in graph.workspaces))
    if (invalid.length > 0) {
      const available = Object.keys(graph.workspaces).join(", ")
      return `ERROR: 존재하지 않는 워크스페이스: ${invalid.join(", ")}\n사용 가능: ${available}`
    }

    const allRelated = getRelatedWorkspaces(graph, activeIds)

    const permissions = assignPermissions(graph, activeIds, allRelated)

    const contextMd = extractContext(workspacesMd, allRelated)

    const permissionSummary = permissions
      .map((p) => `- ${p.id}: ${p.access === "readwrite" ? "읽기+쓰기" : "읽기 전용"}`)
      .join("\n")

    return [
      "## Multirepo 컨텍스트 로드 완료\n",
      "### 활성 워크스페이스 권한",
      permissionSummary,
      "",
      "### 프로젝트 컨텍스트",
      contextMd,
      "",
      "### 작업 규칙",
      "- 읽기+쓰기 워크스페이스의 파일만 수정할 수 있다.",
      "- 읽기 전용 워크스페이스의 파일을 수정하면 안 된다.",
      "- 작업 완료 후 multirepo_verify 도구로 권한 위반 여부를 검증하라.",
    ].join("\n")
  },
})
