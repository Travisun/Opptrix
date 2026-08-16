/**
 * 将本地跑法仓叠层挂到技能正文组装点（冷启动）。
 * 默认无 active 时为恒等变换，不改变 Phase0 前行为。
 * modelRef 经 ALS（runWithHarnessModelRef）注入。
 */

import { setSkillBodyOverlay } from '@opptrix/agent-skills'
import { applyHarnessSkillOverlay } from './apply-overlay.js'
import { getHarnessModelRef } from './model-context.js'

let registered = false

export function ensureHarnessOverlayRegistered(): void {
  if (registered) return
  registered = true
  setSkillBodyOverlay((skillName, body) =>
    applyHarnessSkillOverlay(skillName, body, {
      modelRef: getHarnessModelRef(),
    }).body,
  )
}

/** 测试用：允许重新注册 */
export function resetHarnessOverlayRegistrationForTests(): void {
  registered = false
  setSkillBodyOverlay(null)
}
