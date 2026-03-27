# OpenCode Multirepo Plugin

OpenCode에서 멀티레포·마이크로서비스 프로젝트를 다룰 때, 워크스페이스 경계와 의존성을 기준으로 작업 컨텍스트를 관리해 주는 플러그인이다.

이 저장소는 다음 두 가지를 함께 제공한다.

- OpenCode 플러그인 본체 (`src/plugin/multirepo.ts`)
- 멀티레포 작업 흐름에 필요한 명령어, 에이전트, 커스텀 도구, 스킬

## What this plugin does

이 플러그인은 단순히 `/multirepo` 명령 하나만 추가하는 것이 아니라, 멀티레포 작업 전체 흐름을 OpenCode 안에 맞춰 묶어 준다.

- **프로젝트 구조 설계와 초기화**: `@architecture` 에이전트가 워크스페이스 구조를 설계하고 초기화한다.
- **컨텍스트 기반 작업 범위 결정**: `/multirepo` 명령이 활성 워크스페이스와 관련 의존성을 기준으로 작업 범위를 정한다.
- **권한 기반 파일 변경 통제**: 읽기 전용 워크스페이스 수정이 발생하면 검증/롤백 흐름으로 되돌린다.
- **체크포인트 기반 복구**: 작업 전 git 체크포인트를 만들고, 위반 시 워크스페이스 단위로 롤백한다.
- **메모리 자동 갱신**: 검증이 통과되면 숨겨진 백그라운드 에이전트 `@indexer`가 의존성/워크트리 정보를 반영한다.
- **선택적 GitHub 연동**: 원격 저장소 생성 또는 GitHub URL 기반 read-only 코드 참조를 지원한다.

지원 기능의 상세 목록은 [`docs/Features.md`](docs/Features.md)에서 확인할 수 있다.

## Installation

```bash
git clone <this-repo>
cd opencode-multirepo-plugin
npm install
npm run install:plugin
```

설치 스크립트는 OpenCode 설정 디렉터리에 다음 항목을 배치한다.

- plugin 1개: `plugins/multirepo.ts`
- custom tools 3개
- agents 2개
- skills 2개
- command 1개

또한 대상 설정 디렉터리의 `package.json`에 `@opencode-ai/plugin` 의존성이 없으면 자동으로 추가한다.

기본 설치 대상 디렉터리는 다음 우선순위로 결정된다.

1. `OPENCODE_CONFIG_DIR`
2. `dirname(OPENCODE_CONFIG)`
3. `~/.config/opencode`

설치 후에는 **OpenCode를 재시작**해야 한다.

자세한 설치, 드라이런, 검증 절차는 [`docs/installation.md`](docs/installation.md)를 참고한다.

## Quick start

### 1. 프로젝트 구조 설계 및 초기화

`@architecture` 에이전트는 워크스페이스 경계, 역할, 의존성을 설계하고, 승인 후 워크스페이스 디렉터리와 메모리 파일을 초기화한다.

```text
@architecture 마이크로서비스 웹 게임을 만들려고 합니다.
프론트엔드(React), 인증서버(FastAPI), 게임서버(C++), 피드API(FastAPI), 인프라(Terraform)로 구성합니다.
```

이 단계가 완료되면 프로젝트 루트의 `.opencode/plugins/multirepo/` 아래에 메모리 파일이 생성된다.

### 2. 멀티레포 작업 실행

`/multirepo` 명령은 사용자 요청을 해석한 뒤, 관련 워크스페이스만 골라 컨텍스트를 로드하고 권한을 배정한다.

```text
/multirepo 프론트엔드에 로그인 기능을 추가하고 인증서버의 API를 호출하도록 구현
```

작업 흐름은 다음 순서를 따른다.

1. 요청 분석
2. `multirepo_context`로 관련 워크스페이스/권한 계산
3. 쓰기 가능한 워크스페이스에 체크포인트 생성
4. 작업 수행
5. `multirepo_verify`로 권한 위반 검증
6. 성공 시 체크포인트 정리, 실패 시 롤백 후 재시도

### 3. 메모리 자동 업데이트

검증이 통과되면 플러그인이 `@indexer`를 백그라운드로 호출한다. 인덱서는 변경 파일과 워크트리 상태를 읽어 다음 파일을 갱신한다.

- `graph.json`
- `project.md`
- `workspaces.md` (legacy mirror)

## Installed components

| Kind | Name | Purpose |
|---|---|---|
| Command | `/multirepo` | 멀티레포 컨텍스트를 활성화하고 작업 범위를 정한다 |
| Agent | `@architecture` | 워크스페이스 구조 설계와 초기화를 담당한다 |
| Agent | `@indexer` | 작업 후 자동으로 실행되는 숨겨진 백그라운드 인덱서다 |
| Tool | `multirepo_context` | 관련 워크스페이스와 read/write 권한을 계산한다 |
| Tool | `multirepo_checkpoint` | 체크포인트 생성, 롤백, 정리를 수행한다 |
| Tool | `multirepo_verify` | 변경 파일이 권한 범위를 지켰는지 검증한다 |
| Skill | `multirepo-git` | 워크스페이스 git 초기화, worktree 동기화, 체크포인트 롤백 규칙을 제공한다 |
| Skill | `multirepo-github` | GitHub MCP 기반 원격 저장소 생성과 read-only 코드 참조 흐름을 제공한다 |

## Memory files

이 플러그인은 프로젝트 루트의 `.opencode/plugins/multirepo/` 디렉터리를 상태 저장소로 사용한다.

- `graph.json`: 워크스페이스 경로, `depends_on`, `worktrees` 정보를 담는 의존성 그래프
- `project.md`: 워크스페이스별 역할, API, 환경 변수, 데이터 흐름 등 상세 컨텍스트
- `workspaces.md`: `project.md`와 동일한 내용을 유지하는 호환용 미러 파일

이 세 파일은 `/multirepo` 작업의 컨텍스트 계산과 후속 메모리 동기화의 기준이 된다.

## Operational model and limits

현재 저장소 기준으로 문서화 가능한 동작 범위는 다음과 같다.

- `/multirepo`는 **컨텍스트에 포함된 워크스페이스만** 다룬다.
- 읽기 전용 워크스페이스는 수정하면 안 되며, 위반 시 검증 단계에서 감지된다.
- 위반이 발생하면 체크포인트 롤백 후 다시 시도하며, **최대 3회**까지 재시도한다.
- GitHub URL이 포함된 경우 원격 저장소를 **clone하지 않고** 필요한 파일만 read-only 컨텍스트로 읽는다.
- 원격 저장소 생성/푸시는 `@architecture` 흐름에서 **사용자 승인 후에만** 수행한다.

## OpenCode references

이 저장소가 사용하는 OpenCode 개념은 공식 문서와도 맞춰져 있다.

- Plugins: <https://opencode.ai/docs/plugins/>
- Agents: <https://opencode.ai/docs/agents/>
- Commands: <https://opencode.ai/docs/commands/>
- Skills: <https://opencode.ai/docs/skills/>
- Config and install paths: <https://opencode.ai/docs/config/>

## Repository docs

- [`docs/installation.md`](docs/installation.md): 설치/드라이런/검증 절차
- [`docs/Features.md`](docs/Features.md): 지원 기능 전체 정리
