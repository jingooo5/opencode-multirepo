# OpenCode Multirepo Plugin Features

이 문서는 현재 저장소 구현을 기준으로, 이 플러그인이 OpenCode에 어떤 기능을 추가하는지 정리한 기능 레퍼런스다.

## Overview

이 플러그인은 OpenCode에 멀티레포 작업 흐름을 추가한다. 핵심은 다음 다섯 가지다.

1. 워크스페이스 구조 설계와 초기화
2. 멀티레포 컨텍스트 추출과 권한 배정
3. 체크포인트 생성과 권한 위반 시 롤백
4. 작업 완료 후 메모리 파일 자동 동기화
5. 선택적 GitHub 연동

## 1. Installation artifacts

설치 CLI(`src/cli/install.mjs`)는 아래 항목을 OpenCode 설정 디렉터리에 설치한다.

- `plugins/multirepo.ts`
- `tools/multirepo_context.ts`
- `tools/multirepo_checkpoint.ts`
- `tools/multirepo_verify.ts`
- `agents/architecture.md`
- `agents/indexer.md`
- `skills/multirepo-git/SKILL.md`
- `skills/multirepo-github/SKILL.md`
- `commands/multirepo.md`

추가로 대상 설정 디렉터리의 `package.json`에 `@opencode-ai/plugin` 의존성이 없으면 자동으로 추가한다.

관련 파일:

- `src/cli/install.mjs`
- `docs/installation.md`

## 2. Slash command: `/multirepo`

`/multirepo`는 멀티레포 작업의 메인 진입점이다.

지원하는 입력 패턴은 다음과 같다.

- **일반 작업 지시**: 필요한 워크스페이스를 추론한다.
- **`@` mention 기반 지시**: 특정 파일/폴더가 속한 워크스페이스를 식별한다.
- **GitHub URL 포함 지시**: 외부 저장소 파일을 read-only 컨텍스트로 추가한다.

명령 실행 흐름:

1. 사용자 요청 분석
2. `multirepo_context` 호출로 관련 워크스페이스/권한 계산
3. `multirepo_checkpoint.create` 호출로 쓰기 가능한 워크스페이스 체크포인트 생성
4. 컨텍스트와 권한을 지키며 작업 수행
5. `multirepo_verify` 호출로 권한 위반 검증
6. 성공 시 `multirepo_checkpoint.cleanup`, 실패 시 `rollback` 후 재시도

관련 파일:

- `src/commands/multirepo.md`

## 3. Architecture design and workspace initialization

`@architecture` 에이전트는 새 멀티레포 프로젝트를 설계하고 초기화한다.

주요 역할:

- 워크스페이스 경계 결정
- 워크스페이스 역할, 언어, 프레임워크, API, 통신 방식 정의
- `depends_on` 관계와 데이터 흐름 정의
- 사용자 승인 후 각 워크스페이스 디렉터리 생성
- 각 워크스페이스에서 `git init` + 초기 커밋 수행
- 메모리 파일 생성
  - `.opencode/plugins/multirepo/graph.json`
  - `.opencode/plugins/multirepo/project.md`
  - `.opencode/plugins/multirepo/workspaces.md`
- 선택적으로 GitHub 원격 저장소 생성 및 push

관련 파일:

- `src/agents/architecture.md`
- `src/skills/git/SKILL.md`
- `src/skills/github/SKILL.md`

## 4. Context extraction and permission assignment

`multirepo_context` 도구는 현재 작업 대상 워크스페이스를 기준으로 멀티레포 컨텍스트를 계산한다.

주요 기능:

- 활성 워크스페이스 ID 입력 처리
- `graph.json` 기반 관련 워크스페이스 탐색
- `project.md`에서 관련 섹션만 추출
- 워크스페이스별 권한 배정
  - `read/write`
  - `read-only`
- 작업 규칙 반환
  - 쓰기 가능한 워크스페이스만 수정 가능
  - 읽기 전용 워크스페이스 수정 금지

`graph.json`이나 `project.md`가 없으면 `@architecture`로 먼저 초기화하라는 오류를 반환한다.

관련 파일:

- `src/tools/multirepo_context.ts`

## 5. Checkpoint creation, rollback, and cleanup

`multirepo_checkpoint`는 작업 안정성을 위해 git 체크포인트를 관리한다.

### Create

쓰기 가능한 워크스페이스마다 체크포인트 커밋을 만든다.

- 커밋 메시지 형식: `multirepo-checkpoint: <timestamp>`

### Rollback

권한 위반이 감지된 워크스페이스를 특정 체크포인트로 되돌린다.

- `git reset --hard <hash>`
- `git clean -fd`

### Cleanup

작업이 성공적으로 끝난 뒤, 최신 커밋이 체크포인트일 때만 soft reset으로 체크포인트 커밋을 정리한다.

새 커밋이 체크포인트 위에 쌓여 있으면 자동 정리하지 않고 수동 개입을 요구한다.

관련 파일:

- `src/tools/multirepo_checkpoint.ts`
- `src/skills/git/SKILL.md`

## 6. Permission verification and enforcement

`multirepo_verify`는 변경 파일이 허용된 워크스페이스 범위 안에서만 발생했는지 검사한다.

주요 기능:

- 워크스페이스별 `git diff --name-only HEAD` 검사
- untracked 파일 검사
- 변경 파일이 읽기 전용 워크스페이스에 속하는지 판별
- 성공/실패 결과를 메타데이터와 함께 반환

성공 시:

- `verificationPassed: true`
- 변경 파일 목록과 개수 기록
- 다음 단계로 checkpoint cleanup 안내

실패 시:

- 위반 파일 목록 반환
- rollback → 재작업 → 재검증 순서 안내
- 최대 3회 재시도 흐름은 `/multirepo` 명령 문서에 정의되어 있다.

플러그인 본체(`src/plugin/multirepo.ts`)는 실제 파일 편집 시점에도 세션 권한을 참조해 읽기 전용 워크스페이스 쓰기를 차단한다.

관련 파일:

- `src/tools/multirepo_verify.ts`
- `src/plugin/multirepo.ts`
- `src/commands/multirepo.md`

## 7. Automatic memory updates

검증이 통과되면 플러그인은 숨겨진 서브에이전트 `@indexer`를 백그라운드로 호출한다.

`@indexer`의 역할:

- 변경 파일 수집
- 영향받는 워크스페이스 식별
- API/공유 타입/환경 변수/통신 경로 변화 평가
- `graph.json`의 `depends_on` 갱신
- `project.md` 갱신
- `workspaces.md` 미러 갱신
- `git worktree list`를 이용한 `worktrees` 동기화

관련 파일:

- `src/plugin/multirepo.ts`
- `src/agents/indexer.md`

## 8. Memory files managed by the plugin

이 플러그인은 프로젝트 루트의 `.opencode/plugins/multirepo/`를 메모리 저장소로 사용한다.

### `graph.json`

- 프로젝트 이름과 루트 경로
- 워크스페이스별 상대 경로
- `depends_on` 관계
- `worktrees` 목록

### `project.md`

- 프로젝트 개요
- 워크스페이스별 역할과 상세 컨텍스트
- 언어, API, 환경 변수, 데이터 흐름 같은 설명 정보

### `workspaces.md`

- `project.md`와 동일한 내용을 유지하는 호환용 미러 파일

관련 파일:

- `src/agents/architecture.md`
- `src/agents/indexer.md`
- `src/tools/multirepo_context.ts`

## 9. GitHub integration

이 저장소 기준으로 문서화 가능한 GitHub 연동은 두 가지다.

### Remote repository creation

`@architecture` 흐름에서 사용자 승인을 받은 뒤, GitHub MCP로 워크스페이스별 원격 저장소를 만들고 push할 수 있다.

### Read-only external code inspection

`/multirepo` 입력에 GitHub URL이 포함되면 저장소를 clone하지 않고, 필요한 파일만 GitHub MCP로 읽어 read-only 컨텍스트로 사용한다.

제약 사항:

- 원격 저장소 생성은 사용자 승인 후에만 수행
- 외부 GitHub 코드는 read-only로만 사용
- 필요한 파일만 선택적으로 읽음

관련 파일:

- `src/commands/multirepo.md`
- `src/agents/architecture.md`
- `src/skills/github/SKILL.md`

## 10. OpenCode integration surface

이 저장소는 OpenCode의 공식 확장 지점을 사용한다.

- **Plugins**: `plugins/multirepo.ts` 설치 방식과 로컬 plugin 구조
- **Agents**: `agents/*.md` 기반 커스텀 에이전트 정의
- **Commands**: `commands/multirepo.md` 기반 커스텀 명령 정의
- **Skills**: `skills/*/SKILL.md` 기반 스킬 정의

공식 문서:

- Plugins: <https://opencode.ai/docs/plugins/>
- Agents: <https://opencode.ai/docs/agents/>
- Commands: <https://opencode.ai/docs/commands/>
- Skills: <https://opencode.ai/docs/skills/>
- Config: <https://opencode.ai/docs/config/>

## 11. Current boundaries

현재 저장소에서 확인 가능한 범위만 정리하면 다음과 같다.

- 권한 모델은 워크스페이스 단위의 `read/write` / `read-only` 구분에 기반한다.
- 위반 복구는 체크포인트 커밋과 git rollback 흐름에 기반한다.
- 자동 메모리 갱신은 `multirepo_verify` 통과 후에만 트리거된다.
- GitHub 연동은 원격 저장소 생성과 read-only 코드 참조로 한정되어 있다.

이 문서는 구현 근거가 있는 기능만 다루며, 저장소에 명시되지 않은 UX·자동화·추가 서브커맨드는 포함하지 않는다.
