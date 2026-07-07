import { applyManifestSpec } from '../common/driver-factory.js'
import { applyPermissionAwareDriver } from '../common/permission-aware-driver.js'
import { TICKFLOW_SPEC } from './manifest.js'
import { TickflowMarketHandler } from './markets/handler.js'
import { mixTickflowExtensions } from './markets/extensions.js'
import { isTickflowEnabled, loadTickflowConfig } from './config.js'
import { resolveTickflowEffectiveCapabilities } from './api/permissions.js'

/** TickFlow 驱动 — manifest + 免费/付费权限动态裁剪。 */
export class TickflowDriver extends TickflowMarketHandler {}

applyManifestSpec(TickflowDriver, TICKFLOW_SPEC, { isRuntimeEnabled: isTickflowEnabled })
mixTickflowExtensions(TickflowDriver)

applyPermissionAwareDriver(TickflowDriver, TICKFLOW_SPEC, () => {
  const cfg = loadTickflowConfig()
  return resolveTickflowEffectiveCapabilities(cfg.permissionMode, cfg.plan)
})

export { testTickflowConnection } from './api/client.js'
