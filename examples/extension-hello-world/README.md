# Hello World Extension

Phase A sample extension demonstrating the install + activate + lifecycle flow.

> **Note:** This sample uses `catalog_only` activation (the Phase A product path).
> Hook/route registration via `activate(ctx)` requires `worker_js` activation — see
> `tests/extension-security.test.mjs` for worker_js isolation coverage.

## Layout

```
manifest.json      # Extension manifest (id, permissions, contributes)
src/host.ts        # Host entry — activate(ctx) is the entry point (worker_js mode)
```

## Develop

```bash
# From this directory:
opptrix-ext build   # bundle src/host.ts → dist/host/index.js
opptrix-ext pack    # produce dist/com.opptrix.hello-world-v0.1.0.opx
opptrix-ext doctor  # validate
```

## Install

```bash
curl -X POST --data-binary @dist/com.opptrix.hello-world-v0.1.0.opx \
  http://localhost:8711/api/platform/extensions/install
```

## What it does

- **Storage**: stores `activatedAt` + `invokeCount` in per-extension private KV.
- **Events**: subscribes to `job.terminal` system events.
- **Hooks**: observes `session.messageCommitted` (read-only).
- **Routes**: serves `GET /api/ext/com.opptrix.hello-world/hello`.
