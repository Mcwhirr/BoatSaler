import { useEffect, useRef, useState } from 'react'
import ShipScene from './ShipScene'

const MODEL_STORAGE_KEY = 'salesboat.selected-model-id'
const BROCHURE_FILE_NAME = '2026京穗船舶产品宣传册.pdf'

// 下方内容流展示的产品亮点数据。
const highlights = [
  { title: '3D 船型演示', text: '在销售阶段直观展示船体外观、参数和配置差异，提升客户决策效率。' },
  { title: '配置化报价', text: '按船型、动力系统与交付周期快速生成报价方案，支持销售一键输出。' },
  { title: '交付全流程可视', text: '从签约到交付，全链路节点可追踪，让售前承诺落地更可控。' }
]

export default function App() {
  // 页面滚动后，控制吸顶导航样式状态。
  const [isScrolled, setIsScrolled] = useState(false)
  const [activeMenu, setActiveMenu] = useState(null)
  const [modelManifest, setModelManifest] = useState(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const closeTimerRef = useRef(null)
  const primaryModel = modelManifest?.models?.find((model) => model.id === selectedModelId) ?? null
  const brochurePath = `${import.meta.env.BASE_URL}pdf/${encodeURIComponent(BROCHURE_FILE_NAME)}`

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const openMenu = (menuKey) => {
    clearCloseTimer()
    setActiveMenu(menuKey)
  }

  const closeMenuWithDelay = (menuKey) => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setActiveMenu((current) => (current === menuKey ? null : current))
      closeTimerRef.current = null
    }, 1000)
  }

  useEffect(() => {
    // 让导航的视觉状态与滚动位置保持同步。
    const onScroll = () => {
      setIsScrolled(window.scrollY > 16)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      clearCloseTimer()
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const loadManifest = async () => {
      try {
        const manifestUrl = `${import.meta.env.BASE_URL}gltf/asset-manifest.json`
        const response = await fetch(manifestUrl, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Failed to fetch asset-manifest.json: ${response.status}`)
        }

        const manifest = await response.json()
        if (isCancelled) {
          return
        }

        setModelManifest(manifest)

        const availableIds = new Set((manifest.models ?? []).map((model) => model.id))
        const storedModelId = window.localStorage.getItem(MODEL_STORAGE_KEY)
        const defaultModelId = manifest.primaryModelId ?? manifest.models?.[0]?.id ?? ''
        const initialModelId = storedModelId && availableIds.has(storedModelId)
          ? storedModelId
          : defaultModelId

        setSelectedModelId(initialModelId)
      } catch (error) {
        console.error('Failed to load model manifest:', error)
      }
    }

    loadManifest()

    return () => {
      isCancelled = true
    }
  }, [])

  const handleModelChange = (event) => {
    const modelId = event.target.value
    setSelectedModelId(modelId)
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelId)
  }

  const getModelDisplayLabel = (model) => {
    if (!model) {
      return ''
    }

    if (model.id === 'TestModel') {
      return 'test船型'
    }

    return model.label
  }

  return (
    <div className="page">
      {/* 顶部导航，包含“配置”的二级菜单。 */}
      <header className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="site-nav-inner">
          <p className="brand">SalesBoat</p>
          <nav className="site-links" aria-label="主导航">
            <div
              className={`nav-item with-submenu ${activeMenu === 'ship' ? 'open' : ''}`}
              onMouseEnter={() => openMenu('ship')}
              onMouseLeave={() => closeMenuWithDelay('ship')}
            >
              <a href="#">船型</a>
              <div className="submenu" role="menu" aria-label="船型子菜单">
                <a href="#" role="menuitem">A 船型</a>
                <a href="#" role="menuitem">B 船型</a>
                <a href="#" role="menuitem">C 船型</a>
              </div>
            </div>
            <div
              className={`nav-item with-submenu ${activeMenu === 'config' ? 'open' : ''}`}
              onMouseEnter={() => openMenu('config')}
              onMouseLeave={() => closeMenuWithDelay('config')}
            >
              <a href="#">配置</a>
              <div className="submenu" role="menu" aria-label="配置子菜单">
                <a href="#" role="menuitem">动力系统</a>
                <a href="#" role="menuitem">智能控制</a>
              </div>
            </div>
            <a href="#">服务</a>
          </nav>
          <button className="mini-btn">咨询顾问</button>
        </div>
      </header>

      {/* 首屏文案，使用分层淡入动画类。 */}
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker reveal reveal-1">智能卖船方案</p>
          <h1 className="reveal reveal-2">把卖船这件事，做成一套可视化成交系统</h1>
          <p className="subtitle reveal reveal-3">
            从船型展示、配置讲解到报价与交付进度，
            用一个移动端友好的页面完成高质感客户沟通。
          </p>
          <div className="hero-actions reveal reveal-4">
            <button className="btn primary">立即预约看船</button>
            <a className="btn ghost" href={brochurePath} download={BROCHURE_FILE_NAME}>获取产品手册</a>
          </div>
        </div>
      </section>

      {/* 中央 3D 展示区与外观/内部切换。 */}
      <section className="scene-center" aria-label="三维船舶展示">
        <p className="scene-label">
          {primaryModel ? `${getModelDisplayLabel(primaryModel)} · 3D 预览` : '旗舰船型 · 3D 预览'}
        </p>
        <div className="scene-model-actions">
          <label className="model-select-wrap" htmlFor="model-select">
            <span>船型</span>
            <select id="model-select" className="model-select" value={selectedModelId} onChange={handleModelChange}>
              {(modelManifest?.models ?? []).map((model) => (
                <option key={model.id} value={model.id}>
                  {getModelDisplayLabel(model)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="scene-layout">
          <ShipScene modelConfig={primaryModel} />
        </div>
      </section>

      {/* 轻量化指标带，替代厚重卡片样式。 */}
      <section className="data-band" aria-label="关键指标">
        <div>
          <strong>45%</strong>
          <span>线索转化效率提升</span>
        </div>
        <div>
          <strong>7 天</strong>
          <span>平均方案交付周期</span>
        </div>
        <div>
          <strong>98%</strong>
          <span>客户演示满意度</span>
        </div>
      </section>

      {/* 连续信息行，形成更接近移动端的一体化视觉流。 */}
      <section className="feature-flow" aria-label="产品亮点">
        {highlights.map((item) => (
          <div key={item.title} className="feature-row">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </section>

      {/* 底部沉浸式转化区。 */}
      <section className="immersive-cta">
        <p className="cta-kicker">下一艘船，从更高级的销售体验开始</p>
        <h2>让每一次看船沟通，都更接近成交</h2>
        <p>支持移动端展示、线下讲解和线上成交闭环。</p>
        <button className="btn primary">申请试用方案</button>
      </section>

      {/* 移动端底部固定 CTA，便于快速转化。 */}
      <div className="mobile-cta">
        <button className="btn primary">立即咨询卖船方案</button>
      </div>
    </div>
  )
}
