# OpenCode Multirepo Plugin Installation

이 문서는 에이전트가 그대로 따라 실행할 수 있도록 작성된 설치 절차서다.
모든 명령은 **플러그인 저장소 루트**에서 실행한다고 가정한다.

## 1. 목표

다음 항목을 OpenCode 설정 디렉터리에 설치한다.

- 플러그인: `plugins/multirepo.ts`
- 커스텀 도구 3개
  - `tools/multirepo_context.ts`
  - `tools/multirepo_checkpoint.ts`
  - `tools/multirepo_verify.ts`
- 에이전트 2개
  - `agents/architecture.md`
  - `agents/indexer.md`
- 스킬 2개
  - `skills/multirepo-git/SKILL.md`
  - `skills/multirepo-github/SKILL.md`
- 명령어 1개
  - `commands/multirepo.md`

또한 대상 OpenCode 설정 디렉터리의 `package.json`에 `@opencode-ai/plugin` 의존성이 없으면 자동으로 추가한다.

## 2. 전제조건

설치 전에 다음 조건을 만족해야 한다.

1. Node.js 와 npm 이 설치되어 있어야 한다.
2. 이 저장소가 로컬에 clone 되어 있어야 한다.
3. 현재 작업 디렉터리가 저장소 루트여야 한다.
4. 기본 설치 대상 디렉터리는 `OPENCODE_CONFIG_DIR` → `dirname(OPENCODE_CONFIG)` → `~/.config/opencode` 순서로 결정된다.
5. 다른 경로에 설치하려면 `--config-dir` 옵션을 사용한다.

## 3. 빠른 설치

저장소 루트에서 아래 명령을 순서대로 실행한다.

```bash
npm install
npm run install:plugin
```

설치가 끝나면 OpenCode를 재시작한다.

## 4. CLI 옵션

설치 CLI는 아래 옵션을 지원한다.

```bash
npm run install:plugin -- --help
```

- `--config-dir <path>`: 설치 대상 OpenCode 설정 디렉터리 지정 (환경변수 기본값보다 우선)
- `--project-dir <path>`: 원본 플러그인 저장소 경로 지정
- `--mode <symlink|copy>`: 기본값은 `symlink`
- `--dry-run`: 실제 파일 변경 없이 실행 계획만 출력
- `--help`: 도움말 출력

## 5. 드라이런 검증 절차

실제 사용자 설정을 건드리기 전에 반드시 드라이런으로 검증한다.

```bash
REPO_DIR="$(pwd)"
TEST_CONFIG_DIR="/tmp/opencode-multirepo-plugin-dry-run"

npm install
npm run install:plugin -- \
  --dry-run \
  --config-dir "$TEST_CONFIG_DIR" \
  --project-dir "$REPO_DIR"
```

드라이런 결과에서 아래 조건을 확인한다.

1. `src/plugin/multirepo.ts` 가 `plugins/multirepo.ts` 로 설치될 예정인지 출력되어야 한다.
2. `src/tools/*` 3개가 `tools/*` 로 설치될 예정인지 출력되어야 한다.
3. `src/agents/*` 2개가 `agents/*` 로 설치될 예정인지 출력되어야 한다.
4. `src/skills/*` 2개가 `skills/*` 로 설치될 예정인지 출력되어야 한다.
5. `src/commands/multirepo.md` 가 `commands/multirepo.md` 로 설치될 예정인지 출력되어야 한다.
6. 대상 `package.json` 생성 또는 `@opencode-ai/plugin` 의존성 추가 계획이 출력되어야 한다.

드라이런에서 실패하면 실제 설치를 진행하지 말고 `문제 해결` 섹션을 먼저 확인한다.

## 6. 실제 설치 절차

기본 OpenCode 설정 디렉터리에 설치하려면 아래를 실행한다.

```bash
npm install
npm run install:plugin
```

다른 디렉터리에 설치하려면 아래를 실행한다.

```bash
REPO_DIR="$(pwd)"
TARGET_CONFIG_DIR="/tmp/opencode-multirepo-plugin-real"

npm install
npm run install:plugin -- \
  --config-dir "$TARGET_CONFIG_DIR" \
  --project-dir "$REPO_DIR"
```

심볼릭 링크 대신 파일 복사를 원하면 `--mode copy` 를 추가한다.

```bash
npm run install:plugin -- --mode copy
```

## 7. 설치 후 검증 절차

### 7.1 설치 산출물 확인

`TARGET_CONFIG_DIR` 또는 기본 설정 디렉터리(`~/.config/opencode`)에 대해 아래를 확인한다.

```bash
CONFIG_DIR="/tmp/opencode-multirepo-plugin-real"

ls -l "$CONFIG_DIR/plugins/multirepo.ts"
ls -l "$CONFIG_DIR/tools/multirepo_context.ts"
ls -l "$CONFIG_DIR/tools/multirepo_checkpoint.ts"
ls -l "$CONFIG_DIR/tools/multirepo_verify.ts"
ls -l "$CONFIG_DIR/agents/architecture.md"
ls -l "$CONFIG_DIR/agents/indexer.md"
ls -l "$CONFIG_DIR/skills/multirepo-git/SKILL.md"
ls -l "$CONFIG_DIR/skills/multirepo-github/SKILL.md"
ls -l "$CONFIG_DIR/commands/multirepo.md"
```

확인 기준:

- `--mode symlink` 사용 시 각 파일이 저장소의 `src/...` 를 가리키는 링크여야 한다.
- `--mode copy` 사용 시 각 파일이 실제 파일로 복사되어 있어야 한다.

### 7.2 package.json 확인

```bash
cat "$CONFIG_DIR/package.json"
```

확인 기준:

- `dependencies.@opencode-ai/plugin` 이 존재해야 한다.

### 7.3 타입 검증

설치 전후로 저장소 자체가 깨지지 않았는지 아래를 실행한다.

```bash
npm install
npm run typecheck
```

성공 기준:

- `tsc --noEmit` 가 exit code 0으로 종료되어야 한다.

## 8. 정리 및 롤백

### 8.1 테스트용 디렉터리에 설치한 경우

테스트 디렉터리 전체를 삭제해도 된다.

```bash
rm -rf "/tmp/opencode-multirepo-plugin-dry-run"
rm -rf "/tmp/opencode-multirepo-plugin-real"
```

### 8.2 실제 OpenCode 설정 디렉터리에 설치한 경우

아래 파일만 개별적으로 제거한다.

```bash
CONFIG_DIR="$HOME/.config/opencode"

rm -f "$CONFIG_DIR/plugins/multirepo.ts"
rm -f "$CONFIG_DIR/tools/multirepo_context.ts"
rm -f "$CONFIG_DIR/tools/multirepo_checkpoint.ts"
rm -f "$CONFIG_DIR/tools/multirepo_verify.ts"
rm -f "$CONFIG_DIR/agents/architecture.md"
rm -f "$CONFIG_DIR/agents/indexer.md"
rm -f "$CONFIG_DIR/skills/multirepo-git/SKILL.md"
rm -f "$CONFIG_DIR/skills/multirepo-github/SKILL.md"
rm -f "$CONFIG_DIR/commands/multirepo.md"
```

주의:

- 기존에 사용 중인 다른 OpenCode 설정 파일이 있을 수 있으므로 `~/.config/opencode` 전체를 삭제하지 않는다.
- `package.json` 에서 `@opencode-ai/plugin` 제거는 다른 플러그인 사용 여부를 확인한 뒤 수동으로 판단한다.

## 9. 문제 해결

### 문제 1. `원본 파일을 찾을 수 없습니다` 오류가 난다

원인:

- 저장소 루트가 아닌 위치에서 실행했거나
- `--project-dir` 값이 잘못되었다.

해결:

```bash
pwd
ls src/plugin/multirepo.ts
```

위 두 명령이 정상이어야 한다. 필요하면 `--project-dir "$(pwd)"` 를 명시한다.

### 문제 2. 설정 디렉터리에 쓸 수 없다는 오류가 난다

원인:

- 대상 디렉터리 권한 부족

해결:

- 쓰기 권한이 있는 테스트 디렉터리(`/tmp/...`)로 먼저 검증한다.
- 실제 사용자 설정 디렉터리 권한을 확인한 뒤 다시 실행한다.

### 문제 3. 기존 파일이 남아 있어서 결과가 의심스럽다

해결:

1. 테스트용 새 디렉터리를 사용한다.
2. `--dry-run` 으로 계획을 다시 확인한다.
3. 실제 설치 후 `ls -l` 로 링크/복사 결과를 다시 검증한다.

### 문제 4. 설치는 됐지만 OpenCode에서 바로 보이지 않는다

해결:

- OpenCode를 재시작한다.
- 설치 대상이 기본 설정 디렉터리인지 확인한다.
- `plugins/`, `tools/`, `agents/`, `skills/`, `commands/` 아래 파일이 실제로 생성됐는지 다시 확인한다.

## 10. 에이전트 실행 체크리스트

에이전트는 아래 순서만 따르면 된다.

1. 저장소 루트로 이동한다.
2. `npm install` 실행
3. `npm run install:plugin -- --dry-run ...` 으로 먼저 검증
4. 검증 통과 시 `npm run install:plugin ...` 실행
5. `ls -l` 및 `package.json` 으로 설치 결과 확인
6. `npm run typecheck` 실행
7. 필요 시 OpenCode 재시작 안내
