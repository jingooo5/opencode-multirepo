#!/bin/bash
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_CONFIG="$HOME/.config/opencode"

echo "=== OpenCode Multirepo Plugin 설치 ==="

mkdir -p "$GLOBAL_CONFIG/plugins"
ln -sf "$PLUGIN_DIR/plugin/multirepo.ts" "$GLOBAL_CONFIG/plugins/multirepo.ts"
echo "✓ 플러그인 등록 완료"

mkdir -p "$GLOBAL_CONFIG/tools"
ln -sf "$PLUGIN_DIR/tools/multirepo_context.ts" "$GLOBAL_CONFIG/tools/multirepo_context.ts"
ln -sf "$PLUGIN_DIR/tools/multirepo_checkpoint.ts" "$GLOBAL_CONFIG/tools/multirepo_checkpoint.ts"
ln -sf "$PLUGIN_DIR/tools/multirepo_verify.ts" "$GLOBAL_CONFIG/tools/multirepo_verify.ts"
echo "✓ 커스텀 도구 등록 완료"

mkdir -p "$GLOBAL_CONFIG/agents"
ln -sf "$PLUGIN_DIR/agents/architecture.md" "$GLOBAL_CONFIG/agents/architecture.md"
ln -sf "$PLUGIN_DIR/agents/indexer.md" "$GLOBAL_CONFIG/agents/indexer.md"
echo "✓ 에이전트 등록 완료"

mkdir -p "$GLOBAL_CONFIG/skills/multirepo-git"
mkdir -p "$GLOBAL_CONFIG/skills/multirepo-github"
ln -sf "$PLUGIN_DIR/skills/git/SKILL.md" "$GLOBAL_CONFIG/skills/multirepo-git/SKILL.md"
ln -sf "$PLUGIN_DIR/skills/github/SKILL.md" "$GLOBAL_CONFIG/skills/multirepo-github/SKILL.md"
echo "✓ 스킬 등록 완료"

mkdir -p "$GLOBAL_CONFIG/commands"
ln -sf "$PLUGIN_DIR/commands/multirepo.md" "$GLOBAL_CONFIG/commands/multirepo.md"
echo "✓ /multirepo 명령어 등록 완료"

if [ -f "$GLOBAL_CONFIG/package.json" ]; then
  cd "$GLOBAL_CONFIG"
  if ! grep -q "@opencode-ai/plugin" package.json; then
    echo '이미 package.json이 있습니다. @opencode-ai/plugin 의존성을 수동으로 추가하세요.'
  fi
else
  cp "$PLUGIN_DIR/package.json" "$GLOBAL_CONFIG/package.json"
fi
echo "✓ package.json 설정 완료"

echo ""
echo "=== 설치 완료 ==="
echo "OpenCode를 재시작하면 다음을 사용할 수 있습니다:"
echo "  - @architecture 에이전트: 프로젝트 구조 설계 및 초기화"
echo "  - @indexer 에이전트: 의존성 변경 감지 및 메모리 업데이트"
echo "  - /multirepo 명령어: 멀티레포 컨텍스트 기반 작업"
echo ""
echo "사용법:"
echo "  1. @architecture 로 프로젝트 초기화"
echo "  2. /multirepo <지침> 으로 멀티레포 작업 시작"
