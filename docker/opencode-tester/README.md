# OpenCode persistent tester container

This directory creates a persistent Ubuntu-based Docker environment for testing this plugin without polluting the host OpenCode config.

## What it does

- Builds an `ubuntu:latest`-based tester image.
- Installs the OpenCode CLI in the image.
- Keeps a named container alive with `sleep infinity`.
- Mounts this repository read-only as the source of truth.
- Auto-syncs the repository into a writable container-local workspace when the container starts.
- Installs the plugin into a persistent container-local OpenCode config directory.

## Lifecycle

The container is intentionally **not** ephemeral.

- Container name: `opencode-multirepo-plugin-tester`
- Image name: `opencode-multirepo-plugin-tester:ubuntu`
- Restart policy: `unless-stopped`
- Persistent state: Docker named volumes for `/workspace`, `~/.config/opencode`, and npm cache

On every container start or restart, the tester runs a sync-only bootstrap step that refreshes `/workspace/opencode-multirepo-plugin` from the read-only host mount before returning to the long-lived sleep process.

Do not use `--rm` with this setup.

## Usage

From the repository root:

```bash
docker compose -f docker/opencode-tester/compose.yaml up -d --build
docker compose -f docker/opencode-tester/compose.yaml exec tester bash /host-workspace/opencode-multirepo-plugin/docker/opencode-tester/verify.sh
```

The initial `up` now refreshes the container-local workspace automatically, so ordinary source edits on the host are picked up again after:

```bash
docker compose -f docker/opencode-tester/compose.yaml restart tester
```

Run the full bootstrap manually when you need dependency reinstall or plugin reinstallation in the persistent tester environment:

```bash
docker compose -f docker/opencode-tester/compose.yaml exec tester bash /host-workspace/opencode-multirepo-plugin/docker/opencode-tester/bootstrap.sh
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
- Startup sync treats `/host-workspace/opencode-multirepo-plugin` as the source of truth and `/workspace/opencode-multirepo-plugin` as a synced mirror.
- Because sync uses `rsync --delete`, container-only files under `/workspace/opencode-multirepo-plugin` may be removed on restart unless they live under excluded paths such as `node_modules`.
- Re-run the full `bootstrap.sh` after dependency or install-script changes when you want npm install and plugin installation refreshed.
