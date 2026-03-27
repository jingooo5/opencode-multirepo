# OpenCode Multirepo Plugin

마이크로서비스/멀티레포 프로젝트에서 AI 코딩 에이전트의 컨텍스트를 관리하는 OpenCode 플러그인.

## 설치

```bash
git clone <this-repo>
cd opencode-multirepo-plugin
npm install
npm run install:plugin
```

OpenCode를 재시작한다.

자세한 설치/검증 절차는 [`docs/installation.md`](docs/installation.md) 를 참고한다.

## 사용법

### 1. 프로젝트 초기화

```
@architecture 마이크로서비스 웹 게임을 만들려고 합니다.
프론트엔드(React), 인증서버(FastAPI), 게임서버(C++), 피드API(FastAPI), 인프라(Terraform)로 구성합니다.
```

### 2. 멀티레포 작업

```
/multirepo 프론트엔드에 로그인 기능을 추가하고 인증서버의 API를 호출하도록 구현
```

### 3. 의존성 업데이트

작업 완료 후 자동으로 @indexer가 의존성 변경을 감지하고 메모리를 업데이트한다.

## 구성 요소

| 구성 | 설명 |
|---|---|
| `@architecture` | 프로젝트 구조 설계 + 워크스페이스 초기화 |
| `@indexer` | 의존성 변경 감지 + 메모리 업데이트 |
| `/multirepo` | 컨텍스트 기반 멀티레포 작업 |
| `multirepo_context` | 컨텍스트 추출 커스텀 도구 |
| `multirepo_checkpoint` | git checkpoint 생성/롤백/정리 커스텀 도구 |
| `multirepo_verify` | 접근 권한 위반 검증 커스텀 도구 |
| `multirepo-git` | git 초기화/worktree/롤백 skill |
| `multirepo-github` | GitHub MCP 연동 skill |

## 메모리 파일

프로젝트 루트의 `.opencode/plugins/multirepo/` 에 저장:

- `graph.json`: 워크스페이스 의존성 그래프
- `workspaces.md`: 워크스페이스 상세 컨텍스트
