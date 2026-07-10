/** Paths for staged electron-updater vendor (shared by stage, verify, docs). */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Relative to app root inside asar / app dir — must NOT contain a `node_modules` segment (electron-builder skips those dirs). */
export const UPDATER_VENDOR_REL = 'build/updater-deps/packages'

export const UPDATER_ENTRY = 'electron-updater'

export const UPDATER_VENDOR_DIR = path.join(DESKTOP_ROOT, UPDATER_VENDOR_REL)

export const UPDATER_ENTRY_DIR = path.join(UPDATER_VENDOR_DIR, UPDATER_ENTRY)

/** Marker file verified in CI after electron-builder packaging. */
export const UPDATER_ENTRY_MARKER = `${UPDATER_VENDOR_REL}/${UPDATER_ENTRY}/package.json`
