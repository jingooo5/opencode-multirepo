---
name: multirepo-git
description: 멀티레포 프로젝트의 git 초기화, worktree 감지, checkpoint 기반 롤백을 수행하는 skill. @architecture 에이전트의 워크스페이스 초기화, @indexer의 worktree 동기화, /multirepo의 롤백 메커니즘에서 사용한다.
---

# Multirepo Git Skill

## 워크스페이스 git 초기화

각 워크스페이스 디렉토리에서 실행:

```bash
cd <workspace-path>
git init
git add -A
git commit -m "init: <workspace-id> 워크스페이스 초기화"
```

## worktree 감지

```bash
cd <workspace-path>
git worktree list --porcelain
```

출력 파싱: `worktree <path>` 라인에서 원본 경로가 아닌 항목을 graph.json의 `worktrees` 배열에 추가한다.

## checkpoint 생성 (작업 전)

```bash
cd <workspace-path>
git add -A
git commit --allow-empty -m "multirepo-checkpoint: <ISO-timestamp>" --no-verify
```

## rollback (권한 위반 시)

```bash
cd <workspace-path>
git reset --hard <checkpoint-commit-hash>
git clean -fd
```

## checkpoint 정리 (작업 성공 시)

```bash
cd <workspace-path>
# 최신 커밋이 checkpoint인 경우
git reset --soft HEAD~1
```

## 규칙

- checkpoint 커밋 메시지는 반드시 `multirepo-checkpoint:` 로 시작한다.
- rollback 시 `git clean -fd`로 untracked 파일도 제거한다.
- checkpoint 정리는 최신 커밋이 checkpoint일 때만 수행한다.
- 새 커밋이 checkpoint 위에 쌓여 있으면 수동 정리가 필요하다고 사용자에게 알린다.
