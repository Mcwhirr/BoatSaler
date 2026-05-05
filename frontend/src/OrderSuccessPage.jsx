function getOrderIdFromHash() {
  if (typeof window === 'undefined') {
    return ''
  }

  const hash = `${window.location.hash ?? ''}`
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) {
    return ''
  }

  const searchParams = new URLSearchParams(hash.slice(queryIndex + 1))
  return searchParams.get('order')?.trim() ?? ''
}

export default function OrderSuccessPage() {
  const orderId = getOrderIdFromHash()

  return (
    <div className="order-feedback-page">
      <div className="order-feedback-card">
        <p className="order-feedback-kicker">方案反馈</p>
        <h1>您的船型方案已提交</h1>
        <p className="order-feedback-copy">
          京穗船舶已收到当前配置方案。销售顾问会结合船型参数、动力选项与任务场景，
          与您进一步确认技术细节、报价范围、交付周期及后续商务流程。
        </p>

        <div className="order-feedback-status">
          {orderId && (
            <div>
              <span>方案编号</span>
              <strong>{orderId}</strong>
            </div>
          )}
          <div>
            <span>当前状态</span>
            <strong>已进入顾问跟进</strong>
          </div>
          <div>
            <span>预计响应</span>
            <strong>1 个工作日内联系</strong>
          </div>
        </div>

        <div className="order-feedback-actions">
          <a className="btn primary" href="#/order">继续调整方案</a>
          <a className="mini-btn" href="#top">回到首页</a>
        </div>
      </div>
    </div>
  )
}
