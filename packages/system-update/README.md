# `@opptrix/system-update`

Unified hot-update core for **Docker** and **bare Node** (same `$OPPTRIX_SYSTEM_DIR` layout).

Provides extract / verify / activate / rollback APIs. Download of GitHub/Gitee release attachments is **not** implemented here — only filename/manifest helpers (`runtimeArchiveFilename`, `runtimeSha256Filename`).

**Ops / channel / packing (source of truth):** [`docs/SYSTEM-UPDATE.md`](../../docs/SYSTEM-UPDATE.md)

| Concern | Where |
|---------|--------|
| HTTP channel + `hotPackageUrls` | `apps/server` (`system-update-channel.ts`, `/api/system-update/*`) |
| Pack tarball + `.sha256` | `scripts/pack-opptrix-runtime.mjs` |
| CI upload (tag `opptrix-selfhost-v*`) | `.github/workflows/publish-runtime-assets.yml` |
| Gitee mirror helper | `scripts/upload-runtime-gitee.mjs` |

## Layout

```
$OPPTRIX_SYSTEM_DIR/
  boot      -> slots/<currentVer>   # symlink (Windows: junction or `.opptrix-slot-pointer` file)
  backup    -> slots/<prevVer>
  update/                           # staging downloads / extracted ready trees
  slots/<ver>/                      # full runtime trees
  state.json                        # durable state machine
```

## Environment

| Variable | Meaning |
|----------|---------|
| `OPPTRIX_SYSTEM_DIR` | System root (wins over all defaults) |
| `OPPTRIX_DATA_DIR` | When system dir unset: use sibling `../system` |
| `OPPTRIX_DOCKER=1` | Force Docker default system root `/system` (also auto if `/.dockerenv`) |
| `OPPTRIX_SEED_ROOT` | Seed source for first boot (Docker default `/app`, else `cwd`) |

**Default system dir (when env unset):**

1. Docker → `/system`
2. Else if `OPPTRIX_DATA_DIR` → `$OPPTRIX_DATA_DIR/../system`
3. Else → `~/.opptrix/system`

## Exit codes (supervisor)

| Constant | Code | Meaning |
|----------|------|---------|
| `OPPTRIX_EXIT_RESTART_APPLY` | 42 | Activate pending, then restart |
| `OPPTRIX_EXIT_RESTART_POST_HOOK` | 43 | Soft restart after first-boot hooks |
| `OPPTRIX_EXIT_RESTART_ROLLBACK` | 44 | Restart after rollback |

## `state.json` fields

| Field | Description |
|-------|-------------|
| `currentVersion` | Version pointed to by `boot` |
| `pendingVersion` | Extracted slot waiting for activate |
| `backupVersion` | Previous slot pointed to by `backup` |
| `uiPhase` | `normal` \| `wizard_apply` \| `first_boot_hooks` \| `failed` |
| `firstBootUpgrade` | `{ version, phase, progress, error }` — set **after** switching into the new slot; hooks run in the new tree |
| `downloadJob` | Optional stub (`id`, `version`, `status`, bytes, `error`) |
| `updatedAt` | ISO timestamp |

`firstBootUpgrade.phase`: `pending` \| `running` \| `done` \| `failed`

## Build / test

```bash
npm run build -w @opptrix/system-update
node --test --test-force-exit tests/system-update-core.test.mjs tests/system-update-platform-hooks.test.mjs
```

## Runtime marker (`opptrix-runtime.json`)

| Field | Meaning |
|-------|---------|
| `requires.node` | Simple range (`>=24 <25`, `>=24.0.0`, bare major `24`) |
| `requires.platforms` | `${platform}-${arch}` allowlist (`linux-x64`, `darwin-arm64`, …) |
| `requires.minBaseImage` | Enforced against `OPPTRIX_BASE_VERSION` / `OPPTRIX_RELEASE_TAG` host base |
| `requires.requiresBaseRefresh` | Force base image refresh even if Node matches |
| `hooks.postActivate` | Relative script paths under the slot; else scan `hooks/post-activate/*.{mjs,js}` |

Use `evaluateRuntimeRequires`, `listPostActivateHooks`, `runPostActivateHooks` from this package.