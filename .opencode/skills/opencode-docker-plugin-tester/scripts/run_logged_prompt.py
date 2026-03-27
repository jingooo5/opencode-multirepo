#!/usr/bin/env python3
"""Build and run an Ubuntu-based OpenCode plugin tester image with logs.

This helper follows the skill contract directly:
- verify Docker CLI and daemon
- generate an ubuntu:latest-based Dockerfile
- build the tester image
- inject Codex auth at runtime, never at build-time
- copy local target code or clone a Git repository
- install a local plugin into documented OpenCode plugin paths
- optionally run `opencode run` with durable logs
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import NoReturn, cast


class Args(argparse.Namespace):
    plugin_path: str = ""
    target_workspace: str | None = None
    repo_url: str | None = None
    repo_ref: str | None = None
    codex_auth_mode: str = "env"
    codex_auth_file: str | None = None
    log_dir: str = ".opencode-test-logs"
    image_ref: str = "ubuntu:latest"
    image_tag: str | None = None
    prompt: str | None = None
    prompt_file: str | None = None
    host_network: bool = False
    preserve_container_on_failure: bool = False


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def fail(message: str) -> NoReturn:
    raise SystemExit(f"ERROR: {message}")


def require_existing_dir(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        fail(f"{label} does not exist: {resolved}")
    if not resolved.is_dir():
        fail(f"{label} must be a directory: {resolved}")
    return resolved


def require_existing_path(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.exists():
        fail(f"{label} does not exist: {resolved}")
    return resolved


def write_text(path: Path, text: str) -> None:
    _ = path.write_text(text, encoding="utf-8")


def read_prompt(args: Args) -> str | None:
    if args.prompt and args.prompt_file:
        fail("Provide exactly one of --prompt or --prompt-file, not both.")

    if args.prompt_file:
        prompt_path = require_existing_path(Path(args.prompt_file), "Prompt file")
        if not prompt_path.is_file():
            fail(f"Prompt file must be a regular file: {prompt_path}")
        content = prompt_path.read_text(encoding="utf-8").strip()
        if not content:
            fail(f"Prompt file is empty after trimming whitespace: {prompt_path}")
        return content

    if args.prompt:
        content = args.prompt.strip()
        if not content:
            fail("--prompt cannot be empty or whitespace-only.")
        return content

    return None


def parse_args() -> Args:
    parser = argparse.ArgumentParser(
        description=(
            "Build and run a Docker-based OpenCode plugin tester with reproducible logs."
        )
    )
    _ = parser.add_argument(
        "--plugin-path",
        required=True,
        help="Local plugin file or directory to install into OpenCode.",
    )
    _ = parser.add_argument(
        "--target-workspace",
        help="Local repository or workspace to copy into the container.",
    )
    _ = parser.add_argument(
        "--repo-url",
        help="Git repository URL to clone inside the container.",
    )
    _ = parser.add_argument(
        "--repo-ref",
        help="Optional branch, tag, or commit to check out after cloning.",
    )
    _ = parser.add_argument(
        "--codex-auth-mode",
        choices=("env", "mounted-auth", "manual"),
        default="env",
        help="Auth mode for Codex/OpenAI access: env=pass OPENAI_API_KEY at runtime, mounted-auth=copy a preexisting auth file at runtime, manual=prepare the container and stop with interactive-login instructions.",
    )
    _ = parser.add_argument(
        "--codex-auth-file",
        help="Host auth file used with --codex-auth-mode mounted-auth.",
    )
    _ = parser.add_argument(
        "--log-dir",
        default=".opencode-test-logs",
        help="Directory for generated Dockerfile, build logs, runtime logs, and metadata. Relative paths resolve from the target workspace, or the current working directory when cloning from Git.",
    )
    _ = parser.add_argument(
        "--image-ref",
        default="ubuntu:latest",
        help="Base Docker image reference used in the generated Dockerfile.",
    )
    _ = parser.add_argument(
        "--image-tag",
        help="Optional explicit tag for the generated tester image.",
    )
    _ = parser.add_argument(
        "--prompt",
        help="Prompt text to run with `opencode run` after setup.",
    )
    _ = parser.add_argument(
        "--prompt-file",
        help="Path to a UTF-8 prompt text file. Mutually exclusive with --prompt.",
    )
    _ = parser.add_argument(
        "--host-network",
        action="store_true",
        help="If set, use --network host for the runtime container.",
    )
    _ = parser.add_argument(
        "--preserve-container-on-failure",
        action="store_true",
        help="If set, do not auto-remove the runtime container when it fails.",
    )
    return parser.parse_args(namespace=Args())


def ensure_target_source(args: Args) -> tuple[str, Path | None, str | None]:
    has_local = bool(args.target_workspace)
    has_repo = bool(args.repo_url)
    if has_local == has_repo:
        fail("Provide exactly one of --target-workspace or --repo-url.")
    if has_local:
        assert args.target_workspace is not None
        target_workspace = require_existing_dir(Path(args.target_workspace), "Target workspace")
        return ("local", target_workspace, None)
    assert args.repo_url is not None
    return ("git", None, args.repo_url)


def resolve_log_dir(log_dir_arg: str, local_target_workspace: Path | None) -> Path:
    base_dir = local_target_workspace if local_target_workspace is not None else Path.cwd()
    candidate = Path(log_dir_arg).expanduser()
    if not candidate.is_absolute():
        candidate = base_dir / candidate
    resolved = candidate.resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    if not resolved.is_dir():
        fail(f"Log directory path is not a directory: {resolved}")
    return resolved


def run_command(command: list[str], description: str) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(command, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        fail(f"{description} failed. rc={proc.returncode} stdout={proc.stdout.strip()} stderr={proc.stderr.strip()}")
    return proc


def ensure_docker_available() -> dict[str, str]:
    version = run_command(["docker", "--version"], "Docker version check")
    info = run_command(["docker", "info"], "Docker daemon check")
    return {
        "docker_version": version.stdout.strip(),
        "docker_info": info.stdout.strip(),
    }


def resolve_image_ref(image_ref: str) -> str:
    _ = run_command(["docker", "pull", image_ref], f"Docker pull for {image_ref}")
    inspect = subprocess.run(
        ["docker", "image", "inspect", image_ref, "--format", "{{json .RepoDigests}}"],
        text=True,
        capture_output=True,
        check=False,
    )
    if inspect.returncode != 0:
        return image_ref
    try:
        digests_obj = cast(object, json.loads(inspect.stdout.strip()))
    except json.JSONDecodeError:
        return image_ref
    if isinstance(digests_obj, list) and digests_obj:
        digest_list = cast(list[object], digests_obj)
        first = digest_list[0]
        if isinstance(first, str) and first:
            return first
    return image_ref


def build_dockerfile(image_ref: str) -> str:
    return "\n".join(
        [
            f"FROM {image_ref}",
            'SHELL ["/bin/bash", "-lc"]',
            "ENV DEBIAN_FRONTEND=noninteractive",
            "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git bash && rm -rf /var/lib/apt/lists/*",
            "RUN curl -fsSL https://opencode.ai/install | bash",
            'ENV PATH="/root/.local/bin:${PATH}"',
            "RUN command -v opencode >/dev/null 2>&1",
            "RUN opencode --version",
            "WORKDIR /workspace",
        ]
    )


def build_runtime_script() -> str:
    return """#!/usr/bin/env bash
set -euo pipefail

export PATH="/root/.local/bin:${PATH}"
export HOME="/root"

mkdir -p /workspace /logs /root/.config/opencode/plugins /root/.local/share/opencode /root/.codex

cat /etc/os-release > /logs/os-release.txt
opencode --version > /logs/opencode-version.txt 2>/logs/opencode-version.stderr
git --version > /logs/git-version.txt 2>/logs/git-version.stderr

if [[ "${TARGET_SOURCE_MODE}" == "local" ]]; then
  tar --exclude="${LOG_DIR_BASENAME}" -C /mounted-target -cf - . | tar -C /workspace -xf -
else
  git clone "${REPO_URL}" /workspace
  if [[ -n "${REPO_REF}" ]]; then
    git -C /workspace checkout "${REPO_REF}"
  fi
fi

mkdir -p /workspace/.opencode/plugins

if [[ -d /mounted-plugin ]]; then
  tar -C /mounted-plugin -cf - . | tar -C /workspace/.opencode/plugins -xf -
else
  cp -a /mounted-plugin "/workspace/.opencode/plugins/${PLUGIN_TARGET_NAME}"
fi

case "${CODEX_AUTH_MODE}" in
  env)
    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
      echo "OPENAI_API_KEY is required for codex auth mode 'env'." >&2
      exit 30
    fi
    ;;
  mounted-auth)
    if [[ ! -f /mounted-auth ]]; then
      echo "Mounted auth file is missing inside the container." >&2
      exit 31
    fi
    install -D -m 600 /mounted-auth /root/.local/share/opencode/auth.json
    install -D -m 600 /mounted-auth /root/.codex/auth.json
    ;;
  manual)
    cat > /logs/manual-auth.txt <<'EOF'
Manual auth mode was requested.

The image and container were prepared, but no non-interactive auth material was injected.
If you truly need interactive login, attach a TTY and run your preferred Codex login flow manually.
For reproducible automation, prefer OPENAI_API_KEY or a mounted host auth file instead.
EOF
    ;;
  *)
    echo "Unknown CODEX_AUTH_MODE: ${CODEX_AUTH_MODE}" >&2
    exit 32
    ;;
esac

if [[ "${RUN_PROMPT}" != "1" ]]; then
  echo "Setup completed without running a prompt." 
  exit 0
fi

if [[ "${CODEX_AUTH_MODE}" == "manual" ]]; then
  echo "Manual auth mode selected; skipping opencode run. See /logs/manual-auth.txt." >&2
  exit 0
fi

cd /workspace
opencode --print-logs --log-level debug run "${OPENCODE_PROMPT}"
"""


def shell_join(parts: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in parts)


def main() -> int:
    args = parse_args()
    plugin_path = require_existing_path(Path(args.plugin_path), "Plugin path")
    target_source_mode, local_target_workspace, repo_url = ensure_target_source(args)
    log_dir = resolve_log_dir(args.log_dir, local_target_workspace)
    prompt = read_prompt(args)

    if args.codex_auth_mode == "mounted-auth" and not args.codex_auth_file:
        fail("--codex-auth-file is required when --codex-auth-mode mounted-auth is used.")
    if args.codex_auth_mode != "mounted-auth" and args.codex_auth_file:
        fail("--codex-auth-file is only valid with --codex-auth-mode mounted-auth.")

    if args.codex_auth_mode == "env" and not os.environ.get("OPENAI_API_KEY"):
        fail("OPENAI_API_KEY must be set in the host environment for --codex-auth-mode env.")

    docker_info = ensure_docker_available()
    resolved_image_ref = resolve_image_ref(args.image_ref)

    run_id = dt.datetime.now(dt.timezone.utc).strftime("run-%Y%m%dT%H%M%SZ")
    run_dir = log_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=False)

    build_context_dir = run_dir / "build-context"
    build_context_dir.mkdir(parents=True, exist_ok=False)

    dockerfile_path = build_context_dir / "Dockerfile"
    runtime_script_path = run_dir / "container_run.sh"
    metadata_path = run_dir / "metadata.json"
    build_stdout_path = run_dir / "docker-build.stdout.log"
    build_stderr_path = run_dir / "docker-build.stderr.log"
    runtime_stdout_path = run_dir / "stdout.log"
    runtime_stderr_path = run_dir / "stderr.log"

    write_text(dockerfile_path, build_dockerfile(args.image_ref) + "\n")
    write_text(runtime_script_path, build_runtime_script())
    runtime_script_path.chmod(0o755)

    default_tag = f"opencode-plugin-tester:{run_id.lower()}"
    image_tag = args.image_tag or default_tag
    container_name = f"opencode-plugin-tester-{run_id.lower()}"

    build_command = ["docker", "build", "-t", image_tag, str(build_context_dir)]
    build_proc = subprocess.run(build_command, text=True, capture_output=True, check=False)
    write_text(build_stdout_path, build_proc.stdout)
    write_text(build_stderr_path, build_proc.stderr)
    if build_proc.returncode != 0:
        fail(
            f"Docker image build failed. Dockerfile={dockerfile_path} stderr={build_proc.stderr.strip()}"
        )

    plugin_target_name = plugin_path.name if plugin_path.is_file() else f"{plugin_path.name}.local"
    metadata: dict[str, object] = {
        "started_at": utc_now_iso(),
        "requested_image_ref": args.image_ref,
        "resolved_image_ref": resolved_image_ref,
        "image_tag": image_tag,
        "dockerfile_path": str(dockerfile_path),
        "build_context_dir": str(build_context_dir),
        "run_dir": str(run_dir),
        "log_dir": str(log_dir),
        "plugin_path": str(plugin_path),
        "plugin_is_file": plugin_path.is_file(),
        "plugin_target_name": plugin_target_name,
        "target_source_mode": target_source_mode,
        "target_workspace": str(local_target_workspace) if local_target_workspace else None,
        "repo_url": repo_url,
        "repo_ref": args.repo_ref,
        "codex_auth_mode": args.codex_auth_mode,
        "codex_auth_file": (
            None
            if not args.codex_auth_file
            else str(Path(args.codex_auth_file).expanduser().resolve())
        ),
        "run_prompt": prompt is not None,
        "prompt": prompt,
        "prompt_file": args.prompt_file,
        "host_network": args.host_network,
        "preserve_container_on_failure": args.preserve_container_on_failure,
        "docker_checks": docker_info,
        "build_command": build_command,
        "build_command_shell": shell_join(build_command),
    }

    docker_run_command = ["docker", "run"]
    if not args.preserve_container_on_failure:
        docker_run_command.append("--rm")
    docker_run_command.extend(["--name", container_name])
    if args.host_network:
        docker_run_command.extend(["--network", "host"])

    docker_run_command.extend(["-v", f"{str(run_dir)}:/logs"])
    docker_run_command.extend(["-v", f"{str(plugin_path)}:/mounted-plugin:ro"])
    if target_source_mode == "local" and local_target_workspace is not None:
        docker_run_command.extend(["-v", f"{str(local_target_workspace)}:/mounted-target:ro"])
    if args.codex_auth_mode == "mounted-auth" and args.codex_auth_file:
        auth_file = require_existing_path(Path(args.codex_auth_file), "Codex auth file")
        if not auth_file.is_file():
            fail(f"Codex auth file must be a regular file: {auth_file}")
        docker_run_command.extend(["-v", f"{str(auth_file)}:/mounted-auth:ro"])

    docker_run_command.extend(["-e", f"TARGET_SOURCE_MODE={target_source_mode}"])
    docker_run_command.extend(["-e", f"LOG_DIR_BASENAME={log_dir.name}"])
    docker_run_command.extend(["-e", f"PLUGIN_TARGET_NAME={plugin_target_name}"])
    docker_run_command.extend(["-e", f"CODEX_AUTH_MODE={args.codex_auth_mode}"])
    docker_run_command.extend(["-e", f"RUN_PROMPT={1 if prompt is not None else 0}"])
    docker_run_command.extend(["-e", f"REPO_URL={repo_url or ''}"])
    docker_run_command.extend(["-e", f"REPO_REF={args.repo_ref or ''}"])
    if prompt is not None:
        docker_run_command.extend(["-e", f"OPENCODE_PROMPT={prompt}"])
    if args.codex_auth_mode == "env":
        docker_run_command.extend(["-e", f"OPENAI_API_KEY={os.environ['OPENAI_API_KEY']}"])

    docker_run_command.extend([image_tag, "bash", "/logs/container_run.sh"])

    metadata["runtime_command"] = docker_run_command
    metadata["runtime_command_shell"] = shell_join(docker_run_command)
    write_text(metadata_path, json.dumps(metadata, indent=2, sort_keys=True) + "\n")

    runtime_proc = subprocess.run(docker_run_command, text=True, capture_output=True, check=False)
    write_text(runtime_stdout_path, runtime_proc.stdout)
    write_text(runtime_stderr_path, runtime_proc.stderr)

    metadata.update(
        {
            "finished_at": utc_now_iso(),
            "exit_code": runtime_proc.returncode,
            "stdout_path": str(runtime_stdout_path),
            "stderr_path": str(runtime_stderr_path),
            "build_stdout_path": str(build_stdout_path),
            "build_stderr_path": str(build_stderr_path),
        }
    )
    write_text(metadata_path, json.dumps(metadata, indent=2, sort_keys=True) + "\n")

    if args.preserve_container_on_failure and runtime_proc.returncode == 0:
        _ = subprocess.run(
            ["docker", "rm", container_name],
            text=True,
            capture_output=True,
            check=False,
        )

    if runtime_proc.returncode != 0 and args.preserve_container_on_failure:
        _ = sys.stderr.write(
            f"Runtime container failed and was preserved for debugging: {container_name}\n"
        )

    if runtime_proc.returncode != 0:
        _ = sys.stderr.write(
            f"OpenCode Docker plugin test failed. See logs in: {run_dir}\n"
        )
    else:
        _ = sys.stdout.write(f"Run completed successfully. Logs: {run_dir}\n")

    return runtime_proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
