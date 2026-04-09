export default function OrderSuccessPage() {
  return (
    <div className="order-feedback-page">
      <div className="order-feedback-card">
        <p className="order-feedback-kicker">订购反馈</p>
        <h1>订购意向已提交</h1>
        <p className="order-feedback-copy">
          我们已经收到您的船型配置意向，销售顾问将根据您当前选择的方案尽快与您联系，
          为您确认交付周期、配置细节与后续商务流程。
        </p>

        <div className="order-feedback-status">
          <div>
            <span>当前状态</span>
            <strong>已进入人工跟进</strong>
          </div>
          <div>
            <span>预计响应</span>
            <strong>1 个工作日内</strong>
          </div>
        </div>

        <div className="order-feedback-actions">
          <a className="btn primary" href="#/order">返回配置页面</a>
          <a className="mini-btn" href="#top">回到首页</a>
        </div>
      </div>
    </div>
  )
}
