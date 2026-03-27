---
name: multirepo-github
description: GitHub MCP를 사용하여 원격 레포 생성, 코드 조회를 수행하는 skill. @architecture의 GitHub 연동, /multirepo의 외부 코드 읽기에서 사용한다.
---

# Multirepo GitHub Skill

## MCP 서버

GitHub MCP 서버를 사용한다: https://github.com/github/github-mcp-server

## 원격 레포 생성

@architecture 에이전트가 워크스페이스 초기화 후 사용자 승인 시 실행:

1. GitHub MCP의 `create_repository` 도구로 레포 생성
2. 로컬에서:
```bash
cd <workspace-path>
git remote add origin <repository-url>
git branch -M main
git push -u origin main
```

## 원격 레포 조회

```bash
git remote -v
```

## 웹 코드 읽기 (clone 없이)

/multirepo 명령어에서 GitHub URL이 입력되었을 때:

1. URL에서 owner, repo, path를 파싱한다.
2. GitHub MCP의 `get_file_contents` 도구로 파일/디렉토리 내용을 조회한다.
3. 필요한 파일만 선택적으로 읽어 읽기 전용 컨텍스트로 반환한다.
4. clone하지 않는다.

## 규칙

- 원격 레포 생성은 반드시 사용자 승인 후에만 실행한다.
- 웹 코드 읽기는 읽기 전용이며 로컬에 파일을 생성하지 않는다.
- GitHub API rate limit에 주의하여 필요한 파일만 최소한으로 조회한다.
