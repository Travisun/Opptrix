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
  HOT_PACK_FORBIDDEN_PACKAGE_NAMES,
  VENDOR_HEAVY_PACKAGE_NAMES,
  VENDOR_PINNED_PACKAGE_NAMES,
  abiPinnedTarExcludeArgs,
  assertNoAbiPinnedInTree,
  ensureVendorModuleLinks,
  findAbiPinnedInTree,
  findHotPackForbiddenInTree,
  findVendorHeavyInTree,
  findVendorPinnedInTree,
  fuseVendorAbiIntoSlot,
  isAbiPinnedPackageName,
  isHotPackExcludedPackageName,
  isHotPackForbiddenPackageName,
  isLinkToVendor,
  isVendorHeavyPackageName,
  isVendorPinnedPackageName,
  listInstalledPackageNames,
  packageInstallPath,
  resolveVendorNodeModules,
  scrubHotPackForbiddenFromTree,
  scrubNestedAbiPinnedCopies,
} from '../../packages/system-update/dist/vendor-fuse.js'
