import { applyManifestSpec } from '../common/driver-factory.js'
import { applyPermissionAwareDriver } from '../common/permission-aware-driver.js'
import { TICKFLOW_SPEC } from './manifest.js'
import { TickflowMarketHandler } from './markets/handler.js'
import { mixTickflowExtensions } from './markets/extensions.js'
import { isTickflowEnabled, isTickflowFreeTier, loadTickflowConfig } from './config.js'
import { resolveTickflowEffectiveCapabilities } from './api/permissions.js'

/** TickFlow 驱动 — manifest + 公开免费 / 带 Key 权限动态裁剪。 */
export class TickflowDriver extends TickflowMarketHandler {}

applyManifestSpec(TickflowDriver, TICKFLOW_SPEC, { isRuntimeEnabled: isTickflowEnabled })
mixTickflowExtensions(TickflowDriver)

applyPermissionAwareDriver(TickflowDriver, TICKFLOW_SPEC, () => {
  const cfg = loadTickflowConfig()
  return resolveTickflowEffectiveCapabilities(
    cfg.permissionMode,
    cfg.plan,
    !isTickflowFreeTier(cfg),
  )
})

export { testTickflowConnection } from './api/client.js'
