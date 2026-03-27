# OpenCode Docker Plugin Tester Contract

This document defines the technical requirements and constraints for the `opencode-docker-plugin-tester` skill.

## Build-time vs run-time separation
- Build-time creates a reusable tester image from a generated `Dockerfile` based on `ubuntu:latest`.
- Run-time starts a fresh container from that image, injects runtime auth, copies or clones target code, installs the plugin, and optionally runs a smoke prompt.
- Secrets must never be passed as Docker build args or baked into the image.

## Docker verification contract
- The skill must verify both Docker CLI presence and daemon usability.
- Minimum checks:
  - `docker --version`
  - `docker info`
- If `docker --version` succeeds but `docker info` fails, report Docker as unusable rather than partially available.

## Dockerfile contract
- The generated file must start from `FROM ubuntu:latest`.
- It may install only the minimum OS packages required for OpenCode installation, repository access, and shell execution.
- OpenCode must be installed using the documented installer: `curl -fsSL https://opencode.ai/install | bash`.
- The generated Dockerfile path and the resolved base image reference should be logged.

## Target source precedence
Use exactly one target-code source per run:
1. Explicit local target workspace path.
2. Explicit Git repository URL, optionally with a branch, tag, or commit.

Do not guess a target repository when neither input is present.

## Plugin source rules
- Prefer an explicit plugin path from the user.
- If the plugin is a local file, copy it directly into a documented local plugin directory such as `.opencode/plugins/`.
- If the plugin is a local directory, copy its contents into the chosen local plugin directory, but do not claim that undocumented recursive directory loading is guaranteed.
- If the plugin is package-based, configure it through `opencode.json` instead of inventing an install command.
- `package.json` by itself is not enough proof that a directory is a valid local OpenCode plugin.

## OpenCode plugin location rules
- Project-local plugins may live under `.opencode/plugins/`.
- Global plugins may live under `~/.config/opencode/plugins/`.
- Package-based plugins are configured through `opencode.json` under the `plugin` key.

## Auth rules
- Default auth mode: runtime API key injection via environment variable.
- Second-choice auth mode: mount a pre-existing host auth file read-only, then copy it into the container at runtime.
- Manual browser or device-code login inside Docker is an explicit opt-in fallback, not the default.
- Never log raw secrets, auth tokens, API keys, or full auth file contents.
- Never write auth material into the generated Dockerfile or image layers.

## Runtime workspace semantics
- The default execution root is a copied or cloned workspace inside the container, not the host-mounted path.
- The host workspace should remain unchanged.
- If the local target workspace contains the log directory, exclude it from the copy into the container to avoid self-copy noise.

## Logging Requirements
- The resolved image ID and version of `ubuntu:latest` MUST be logged at the start of the session.
- The generated Dockerfile path, build command, image tag, and build stdout/stderr must be captured.
- Use `--print-logs` for all `opencode run` commands.
- Set `--log-level` to `debug` unless otherwise specified.
- All stdout and stderr from image build, container setup, auth injection, repository copy/clone, plugin installation, and OpenCode execution must be captured.
- Log the resolved target source, resolved plugin source, chosen auth mode, prompt source, start/end timestamps, and exit code.

## Networking and Permissions
- Default to standard Docker bridge networking.
- Host-network access is opt-in only.
- The container may run as `root` for package installation, but host mounts should be read-only wherever practical.
- Local target code should be copied into a writable container-local directory before plugin staging or prompt execution.
- If the plugin requires specific ports, they must be explicitly mapped.

## Reproducibility Stance
- Every test run should start from a fresh container instance.
- Avoid persistent writable volumes unless explicitly requested for multi-stage testing.
- All installation steps (OpenCode install, repository copy/clone, plugin staging, auth mode selection, and smoke execution) must be scripted and logged so the environment can be recreated.

## OpenCode Facts
- **Installation**: `curl -fsSL https://opencode.ai/install | bash`
- **Non-interactive Execution**: `opencode run "..."`
- **Logging**: Use `--print-logs` and `--log-level <level>`
- **Plugin Management**:
  - Local plugins: Place in `.opencode/plugins/`
  - Global plugins: Place in `~/.config/opencode/plugins/`
  - Package-based plugins: Defined in `opencode.json`

## Codex auth facts
- Official auth guidance supports ChatGPT sign-in, API-key auth, and device-code style headless flows depending on context.
- Docker-friendly defaults are runtime API key injection or mounting a pre-authenticated host auth file.
- Browser/device login inside a headless container may require explicit user interaction and should be treated as an advanced fallback.
