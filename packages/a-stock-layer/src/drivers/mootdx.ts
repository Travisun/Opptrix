import { TdxProtocolDriver } from './tdx-base.js'

/** mootdx — 通达信券商级行情 (pure Node via TDX TCP protocol) */
export class MootdxDriver extends TdxProtocolDriver {
  get name() { return 'mootdx' }
  get priority() { return 90 }
}
