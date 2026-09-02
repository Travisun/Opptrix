/**
 * Thin re-export — fusion algorithm lives in `@opptrix/system-update` (`vendor-fuse`).
 * Pack scripts / existing tests keep importing this path; do not diverge a second copy.
 *
 * Requires `npm run build -w @opptrix/system-update` (dist present).
 */
export {
  ABI_PINNED_NAME_PREFIXES,
  ABI_PINNED_PACKAGE_NAMES,
  DEFAULT_VENDOR_NODE_MODULES,
  abiPinnedTarExcludeArgs,
  assertNoAbiPinnedInTree,
  ensureVendorModuleLinks,
  findAbiPinnedInTree,
  fuseVendorAbiIntoSlot,
  isAbiPinnedPackageName,
  isLinkToVendor,
  listInstalledPackageNames,
  packageInstallPath,
  resolveVendorNodeModules,
  scrubNestedAbiPinnedCopies,
} from '../../packages/system-update/dist/vendor-fuse.js'
