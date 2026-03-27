---
name: opencode-docker-plugin-tester
description: Create an ubuntu:latest-based Dockerfile and tester image for OpenCode plugin validation. Use this skill whenever the user wants a clean Docker environment for OpenCode, needs to install OpenCode in a container, wants to copy or clone target code into a test container, or needs to authenticate Codex safely without polluting the host machine. Make sure to use this skill whenever Docker, OpenCode plugins, Codex login, plugin smoke tests, or reproducible containerized setup are mentioned, even if the user does not explicitly ask for a 'tester'.
---

# OpenCode Docker Plugin Tester

This skill builds a reproducible Docker image and then runs a fresh container for OpenCode plugin testing. The goal is to give the user a clean Ubuntu-based test environment that can install OpenCode, authenticate Codex safely, bring in target code, install the plugin under test, and optionally run a smoke prompt.

## Required order of operations
Follow this sequence unless the user explicitly asks for a narrower slice:

1. Verify Docker is usable on the host.
2. Generate an `ubuntu:latest`-based `Dockerfile`.
3. Build the Docker image.
4. Install OpenCode in the image or container using the documented installer.
5. Authenticate Codex inside the container using the safest feasible mode.
6. Bring the target code into the container by copying a local workspace or cloning a Git repository.
7. Install the plugin into OpenCode using documented plugin locations.
8. If the user supplied a prompt, run `opencode run` and collect logs.

## Default Assumptions
- Base image: `ubuntu:latest`.
- OpenCode installation: `curl -fsSL https://opencode.ai/install | bash`.
- Target work happens in a copied or cloned workspace inside the container, not directly on the host filesystem.
- Networking: default Docker bridge networking unless the user explicitly asks for host networking.
- Secrets are runtime-only inputs. Never bake API keys, auth files, or session tokens into the `Dockerfile`, image layers, or build arguments.
- Local plugin installation should use documented OpenCode plugin locations such as `.opencode/plugins/` in the project or `~/.config/opencode/plugins/` globally.

## Input Collection
Before starting, identify:
1. **Plugin Source**: Which local file or directory contains the plugin under test?
2. **Target Code Source**: Is the test target a local workspace to copy, or a Git repository to clone?
3. **Codex Auth Mode**: Should the container use an API key, a mounted auth file, or a manual interactive login fallback?
4. **Execution Root**: Should `opencode run` execute from the copied/cloned workspace root, or should setup stop after environment construction?
5. **Prompt**: What smoke prompt, if any, should OpenCode execute?
6. **Logging Path**: Where should the generated `Dockerfile`, build logs, runtime logs, and metadata be written?

If the user already supplied enough information to answer those questions, proceed without asking again. Only stop when the plugin source is ambiguous, the target code source is unclear, or the required auth material is missing.

## Execution Sequence
1. **Verify Docker availability**:
   - Check both `docker --version` and `docker info`.
   - Fail early if the Docker CLI exists but the daemon is unavailable.

2. **Generate a real Dockerfile**:
   - Write a `Dockerfile` that starts from `ubuntu:latest`.
   - Install only the OS packages needed for OpenCode install and repository access.
   - Install OpenCode with the documented installer: `curl -fsSL https://opencode.ai/install | bash`.
   - Record the resolved base image digest and the generated Dockerfile path.

3. **Build the tester image**:
   - Build the Docker image from the generated Dockerfile.
   - Save build stdout, stderr, image tag, and image digest when available.

4. **Authenticate Codex safely**:
   - Prefer runtime-only auth injection.
   - Preferred order:
     1. API key via environment variable for non-interactive automation.
     2. Mounted host auth file copied into the container at runtime.
     3. Manual interactive login only when the user explicitly wants it or no safer mode is available.
   - Never place auth secrets in the Dockerfile, image layers, build args, or durable logs.

5. **Bring in target code**:
   - If the user gave a local workspace, mount it read-only and copy it into a writable container-local workspace.
   - If the user gave a Git URL, clone it inside the fresh container. Respect an explicit branch, tag, or commit when provided.

6. **Install the plugin into OpenCode**:
   - For local plugin files, copy them into a documented local plugin directory such as `.opencode/plugins/`.
   - If the plugin is package-based and the user explicitly wants npm-style plugin loading, configure `opencode.json` instead of inventing an undocumented install command.
   - If the plugin source is a repository and its runnable entrypoint is unclear, ask for the actual plugin file or built artifact instead of guessing.

7. **Run the smoke test**:
   - If the user provided a prompt, run `opencode --print-logs --log-level debug run "<prompt>"` from the copied or cloned workspace root.
   - If the user did not provide a prompt, stop after setup and report how to run the next command.

8. **Collect artifacts**:
   - Save the generated Dockerfile, build logs, runtime logs, metadata, prompt source, and exit code.

## Ambiguity Rules
- If the plugin source is unclear, ask for clarification instead of guessing.
- If the user says “login to Codex” but does not say how, default to API-key auth for automation and explain the safer fallback options.
- If the user wants a browser-style login inside Docker, treat that as advanced/manual mode and warn that headless containers may require device-code or host-side auth injection.
- If the target code source is missing, stop after building the image and explain what source input is needed next.

## Failure Handling
- If Docker is installed but unusable, show the failing command and stderr.
- If the Docker build fails, report the generated Dockerfile path and the build logs.
- If OpenCode installation fails, report installer stdout/stderr and the exact image layer step that failed.
- If auth setup fails, report which auth mode was chosen and what input was missing, but do not echo secrets.
- If plugin loading fails, report the exact in-container plugin location and any relevant `opencode.json` configuration.
- If cloning or copying target code fails, report the failing path or Git URL.

## Expected Output
- A summary of the Docker usability check (`docker --version`, `docker info`).
- The generated Dockerfile path and the exact image tag that was built.
- The chosen Codex auth mode, without exposing secrets.
- The resolved plugin source, target code source, and final in-container plugin install path.
- Full build logs, runtime logs, timestamps, stdout, stderr, and exit code.
- If a prompt was run, the exact prompt source and the `opencode run` result.

## Helper script
Use `scripts/run_logged_prompt.py` when you want deterministic artifact capture.

### Example: local target workspace + env auth
```bash
python scripts/run_logged_prompt.py \
  --plugin-path /absolute/path/to/plugin \
  --target-workspace /absolute/path/to/repo-under-test \
  --codex-auth-mode env \
  --log-dir /absolute/path/to/logs \
  --prompt "Describe whether the installed plugin is available and then run its smoke action."
```

### Example: Git clone target + mounted auth file
```bash
python scripts/run_logged_prompt.py \
  --plugin-path /absolute/path/to/plugin \
  --repo-url https://github.com/example/repo.git \
  --repo-ref main \
  --codex-auth-mode mounted-auth \
  --codex-auth-file ~/.local/share/opencode/auth.json \
  --log-dir /absolute/path/to/logs
```

## Reference notes
- Official OpenCode install and Docker usage: `https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/index.mdx`
- Official plugin docs: `https://opencode.ai/docs/plugins`
- Official Codex auth docs: `https://developers.openai.com/codex/auth`
