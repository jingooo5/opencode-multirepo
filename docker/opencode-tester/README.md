# OpenCode persistent tester container

This directory creates a persistent Ubuntu-based Docker environment for testing this plugin without polluting the host OpenCode config.

## What it does

- Builds an `ubuntu:latest`-based tester image.
- Installs the OpenCode CLI in the image.
- Keeps a named container alive with `sleep infinity`.
- Mounts this repository read-only as the source of truth.
- Copies the repository into a writable container-local workspace during bootstrap.
- Installs the plugin into a persistent container-local OpenCode config directory.

## Lifecycle

The container is intentionally **not** ephemeral.

- Container name: `opencode-multirepo-plugin-tester`
- Image name: `opencode-multirepo-plugin-tester:ubuntu`
- Restart policy: `unless-stopped`
- Persistent state: Docker named volumes for `/workspace`, `~/.config/opencode`, and npm cache

Do not use `--rm` with this setup.

## Usage

From the repository root:

```bash
docker compose -f docker/opencode-tester/compose.yaml up -d --build
docker compose -f docker/opencode-tester/compose.yaml exec tester bash /host-workspace/opencode-multirepo-plugin/docker/opencode-tester/bootstrap.sh
docker compose -f docker/opencode-tester/compose.yaml exec tester bash /host-workspace/opencode-multirepo-plugin/docker/opencode-tester/verify.sh
```

Enter the container later:

```bash
docker exec -it opencode-multirepo-plugin-tester bash
```

Stop it without deleting it:

```bash
docker compose -f docker/opencode-tester/compose.yaml stop
```

Start it again:

```bash
docker compose -f docker/opencode-tester/compose.yaml start
```

## Auth handling

Do not bake API keys or auth files into the image.

If you later need Codex/OpenCode authentication, inject it at runtime by one of these methods:

- pass an environment variable when running commands
- mount an auth file into the container
- log in manually from an interactive shell inside the persistent container

## Notes

- The bootstrap script uses `--mode symlink`, so installed plugin entries point at the copied workspace under `/workspace/opencode-multirepo-plugin`.
- Re-run `bootstrap.sh` after host-side source changes when you want the container-local workspace refreshed.
