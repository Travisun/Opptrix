/**
 * 同花顺 Fuyao 明确返回「该标的未收录」—— 例如 code=3001 且 message 为
 * `Fund not found: 000001.OF`。区别于瞬时故障（FuyaoApiError，Provider 层
 * 通常吞掉并触发 failover），此类错误表示上游数据源明确未收录该标的，
 * 应向上抛出并在编排层归类为 not_found，而不是当成临时故障吞成空数据。
 */
export class FuyaoFundNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FuyaoFundNotFoundError'
  }
}
