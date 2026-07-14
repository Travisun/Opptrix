/**
 * Sidecar dependency directory name inside runtime-stage.
 *
 * electron-builder's FileCopier always skips a directory whose relative path is
 * exactly `node_modules` (app-builder-lib filter.js). With
 * `extraResources.from = "runtime-stage"`, that dropped the entire sidecar dep
 * tree from installers. Use a non-reserved folder name instead.
 */
module.exports = {
  RUNTIME_DEPS_DIR: 'deps',
}
