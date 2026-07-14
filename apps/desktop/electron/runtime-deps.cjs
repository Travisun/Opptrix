/**
 * Sidecar dependency directory name inside runtime-stage **during staging**.
 *
 * electron-builder's FileCopier skips a directory whose relative path is
 * exactly `node_modules`. Stage as `deps/` so the tree is copied, then
 * `after-pack-adhoc.cjs` renames `deps` → `node_modules` in the packed app so
 * Node ESM bare imports (`import 'fastify'`) resolve. NODE_PATH alone is not
 * enough for ESM.
 */
module.exports = {
  RUNTIME_DEPS_DIR: 'deps',
}
