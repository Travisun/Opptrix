import { TdxProtocolDriver } from './tdx-base.js'

/** pytdx — 通达信协议备选 driver (same Node TDX client as mootdx) */
export class PytdxDriver extends TdxProtocolDriver {
  get name() { return 'pytdx' }
  get priority() { return 85 }
}
