import { useEffect, useState } from 'react'
import AdminPage from './AdminPage'
import OrderPage from './OrderPage'
import OrderSuccessPage from './OrderSuccessPage'
import ShipScene from './ShipScene'

const PREFERRED_MODEL_ID = 'TestHigh'
const MODEL_STORAGE_KEY = 'salesboat.selected-model-id'
const HERO_IMAGE_FILE_NAME = 'FrontPage.png'
const BROCHURE_FILE_NAME = '2026\u4eac\u7a57\u8239\u8236\u4ea7\u54c1\u5ba3\u4f20\u518c.pdf'

const detailCards = [
  {
    eyebrow: '品牌叙事',
    title: '更清晰的销售展示节奏',
    text: '首屏聚焦于产品主视觉与核心标语，让展示开场更像一份精致的画册，而不是冷冰冰的控制面板。'
  },
  {
    eyebrow: '沉浸体验',
    title: '全屏 3D 实景预览',
    text: '第二屏为船舶提供了更充裕的展示空间，无论是桌面、平板还是大屏，都更接近线下展厅讲解的感觉。'
  },
  {
    eyebrow: '资产流程',
    title: '运行资源更易管理',
    text: 'Go 管理端会同步模型文件、UV 资源和运行时 manifest 数据，让内容更新无需手动重建目录结构。'
  },
  {
    eyebrow: '交付展示',
    title: '适合线上发布与远程演示',
    text: '视频素材、画册资源与 3D 模型共用同一套部署路径，更适合上云发布、远程演示和后续维护。'
  }
]

const technicalSpecCards = [
  {
    title: '船体尺度',
    items: [
      ['总长', '15.80 m'],
      ['水线长', '15.10 m'],
      ['船宽', '3.50 m']
    ]
  },
  {
    title: '型线参数',
    items: [
      ['型深', '1.20 m'],
      ['吃水', '0.50 m'],
      ['设计航速', '8 - 25 km/h']
    ]
  },
  {
    title: '动力与载员',
    items: [
      ['主机功率', '10 - 75 HP'],
      ['动力形式', '电动舷外机'],
      ['乘员定额', '32 人（含船员）']
    ]
  },
  {
    title: '结构与认证',
    items: [
      ['上车体', '铝合金或玻璃钢'],
      ['下车体', '钢质结构'],
      ['证书类型', '检验证书']
    ]
  }
]

const vesselCategories = [
  '新能源船',
  '应急救援船',
  '公务执法艇',
  '游艇'
]

function getModelDisplayLabel(model) {
  if (!model) {
    return ''
  }

  if (model.id === 'TestModel') {
    return '测试模型'
  }

  return model.label
}

function getRouteFromHash(hash) {
  if (hash === '#/admin' || hash.startsWith('#/admin?')) {
    return 'admin'
  }

  if (hash === '#/order' || hash.startsWith('#/order?')) {
    return 'order'
  }

  if (hash === '#/order-success' || hash.startsWith('#/order-success?')) {
    return 'order-success'
  }

  return 'showcase'
}

function getPlatformLabel(platform) {
  if (platform === 'youtube') {
    return 'YouTube'
  }

  if (platform === 'bilibili') {
    return 'Bilibili'
  }

  return platform || '视频'
}

export default function App() {
  const appBaseUrl = import.meta.env.BASE_URL
  const resolveAppPath = (relativePath) => `${assetBaseUrlFallback(appBaseUrl)}${relativePath}`

  const [route, setRoute] = useState(() => getRouteFromHash(window.location.hash))
  const [isScrolled, setIsScrolled] = useState(false)
  const [modelManifest, setModelManifest] = useState(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [siteContent, setSiteContent] = useState({ videos: [] })
  const models = modelManifest?.models ?? []
  const videos = siteContent?.videos ?? []

  const primaryModel = models.find((model) => model.id === selectedModelId) ?? null
  const selectedModelLabel = getModelDisplayLabel(primaryModel) || (models.length ? '选择船型' : '正在加载船型')
  const brochurePath = resolveAppPath(`pdf/${encodeURIComponent(BROCHURE_FILE_NAME)}`)
  const heroImagePath = resolveAppPath(`pdf/${encodeURIComponent(HERO_IMAGE_FILE_NAME)}`)
  const specImagePath = resolveAppPath('gltf/TestHigh/tbrender.png')

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash(window.location.hash))
    }

    onHashChange()
    window.addEventListener('hashchange', onHashChange)

    return () => {
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  useEffect(() => {
    if (route === 'admin') {
      setIsScrolled(false)
      return undefined
    }

    const onScroll = () => {
      setIsScrolled(window.scrollY > 12)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [route])

  useEffect(() => {
    if (route === 'admin') {
      return undefined
    }

    let isCancelled = false

    const loadShowcaseData = async () => {
      try {
        const manifestUrl = resolveAppPath('gltf/asset-manifest.json')
        const contentUrl = resolveAppPath('api/site-content')

        const [manifestResponse, contentResponse] = await Promise.all([
          fetch(manifestUrl, { cache: 'no-store' }),
          fetch(contentUrl, { cache: 'no-store' }).catch(() => null)
        ])

        if (!manifestResponse.ok) {
          throw new Error(`Failed to fetch asset-manifest.json: ${manifestResponse.status}`)
        }

        const manifest = await manifestResponse.json()
        const content = contentResponse?.ok ? await contentResponse.json() : { videos: [] }
        if (isCancelled) {
          return
        }

        setModelManifest(manifest)
        setSiteContent(content ?? { videos: [] })

        const availableIds = new Set((manifest.models ?? []).map((model) => model.id))
        const storedModelId = window.localStorage.getItem(MODEL_STORAGE_KEY)
        const forcedModelId = availableIds.has(PREFERRED_MODEL_ID) ? PREFERRED_MODEL_ID : ''
        const defaultModelId = manifest.primaryModelId ?? manifest.models?.[0]?.id ?? ''
        const initialModelId = forcedModelId || (
          storedModelId && availableIds.has(storedModelId)
            ? storedModelId
            : defaultModelId
        )

        setSelectedModelId(initialModelId)

        if (initialModelId) {
          window.localStorage.setItem(MODEL_STORAGE_KEY, initialModelId)
        }
      } catch (error) {
        console.error('Failed to load showcase data:', error)
      }
    }

    loadShowcaseData()

    return () => {
      isCancelled = true
    }
  }, [route])

  const handleModelSelect = (modelId) => {
    if (!modelId || modelId === selectedModelId) {
      return
    }

    setSelectedModelId(modelId)
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelId)
  }

  if (route === 'admin') {
    return <AdminPage />
  }

  if (route === 'order') {
    return (
      <OrderPage
        models={models}
        primaryModel={primaryModel}
        selectedModelId={selectedModelId}
        onSelectModel={handleModelSelect}
      />
    )
  }

  if (route === 'order-success') {
    return <OrderSuccessPage />
  }

  return (
    <div className="page">
      <header className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="site-nav-inner">
          <div className="site-nav-left">
            <nav className="site-categories" aria-label="船型分类">
              {vesselCategories.map((category) => (
                <a key={category} href="#experience">{category}</a>
              ))}
            </nav>
          </div>

          <a className="brand" href="#top">SalesBoat</a>

          <div className="site-nav-right">
            <nav className="site-links" aria-label="主导航">
              <a href="#poster">封面</a>
              <a href="#experience">3D 展示</a>
              <a href="#details">详细介绍</a>
              <a href="#/admin">管理后台</a>
            </nav>
            <a className="mini-btn" href={brochurePath} download={BROCHURE_FILE_NAME}>下载画册</a>
          </div>
        </div>
      </header>

      <main className="page-main" id="top">
        <section className="hero-screen" id="poster">
          <img className="hero-poster" src={heroImagePath} alt="船舶宣传画册封面" />
          <div className="hero-overlay" />

          <div className="hero-content">
            <p className="hero-kicker reveal reveal-1">京穗造船</p>
            <h1 className="reveal reveal-2">让高端船舶展示，更直观更有质感。</h1>
            <p className="hero-slogan reveal reveal-3">
              从封面视觉开始，直接过渡到全屏 3D 舞台，配合视频与产品资料，完成一套完整的演示闭环。
            </p>
            <div className="hero-actions reveal reveal-4">
              <a className="btn primary" href="#experience">进入 3D 展示</a>
              <a className="btn order-btn" href="#/order">立即订购</a>
            </div>
          </div>

          <a className="scroll-cue reveal reveal-4" href="#experience">
            <span className="scroll-cue-line" />
            <span>向下浏览</span>
          </a>
        </section>

        <section className="viewer-screen" id="experience">
          <div className="viewer-canvas viewer-canvas-fullscreen">
            <div className="viewer-canvas-toolbar">
              <div className="viewer-selector-meta">
                <p className="viewer-control-eyebrow">船型切换</p>
                <p className="viewer-control-title">{selectedModelLabel}</p>
                <p className="viewer-control-caption">在当前 3D 舞台中直接切换展示船型。</p>
              </div>

              <div className="viewer-selector-dock" role="toolbar" aria-label="船型选择">
                {models.map((model) => {
                  const isActive = model.id === selectedModelId

                  return (
                    <button
                      key={model.id}
                      type="button"
                      className={`viewer-selector-chip ${isActive ? 'active' : ''}`}
                      onClick={() => handleModelSelect(model.id)}
                      aria-pressed={isActive}
                    >
                      <span className="viewer-selector-chip-label">{getModelDisplayLabel(model)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <ShipScene modelConfig={primaryModel} />
          </div>
        </section>

        <section className="detail-screen" id="details">
          <div className="detail-screen-inner">
            <div className="detail-header">
              <p className="detail-kicker">详细介绍</p>
              <h2>第三屏用更结构化的方式，把视觉吸引力转化为完整的销售表达。</h2>
              <p>
                这一屏可以用来承接产品定位、交付说明、资料交接与外部视频，让 3D 演示与销售话术更紧密地衔接在一起。
              </p>
            </div>

            <div className="detail-grid">
              {detailCards.map((card) => (
                <article key={card.title} className="detail-card">
                  <p className="detail-card-eyebrow">{card.eyebrow}</p>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>

            <section className="detail-spec-showcase" aria-label="主要技术参数">
              <div className="detail-spec-visual">
                <img className="detail-spec-image" src={specImagePath} alt="JS-1580 电动画舫船侧视图" />
              </div>

              <div className="detail-spec-panel">
                <div className="detail-spec-head">
                  <p className="detail-card-eyebrow">参数展示</p>
                  <h3>JS-1580 电动画舫船 主要技术参数</h3>
                  <p>左侧展示船型渲染图，右侧用更轻量的参数卡片承接核心配置与交付信息。</p>
                </div>

                <div className="detail-spec-card-grid">
                  {technicalSpecCards.map((card) => (
                    <article key={card.title} className="detail-spec-card">
                      <h4>{card.title}</h4>
                      <div className="detail-spec-table" role="table" aria-label={card.title}>
                        {card.items.map(([label, value]) => (
                          <div key={label} className="detail-spec-row" role="row">
                            <span className="detail-spec-label" role="cell">{label}</span>
                            <strong className="detail-spec-value" role="cell">{value}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {videos.length > 0 && (
              <section className="video-showcase" aria-label="外部视频展示">
                <div className="video-section-header">
                  <div>
                    <p className="detail-kicker">外部媒体</p>
                    <h3>YouTube 与 Bilibili 嵌入内容管理</h3>
                  </div>
                  <p className="video-section-copy">
                    这些视频链接可以直接在 Go 管理端维护，无需再把媒体内容硬编码到前端页面。
                  </p>
                </div>

                <div className="video-grid">
                  {videos.map((video) => (
                    <article key={video.id} className="video-card">
                      <div className="video-frame-shell">
                        <iframe
                          className="video-frame"
                          src={video.embedUrl}
                          title={video.title}
                          loading="lazy"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>

                      <div className="video-card-copy">
                        <p className="video-platform">{getPlatformLabel(video.platform)}</p>
                        <h3>{video.title}</h3>
                        {video.summary && <p className="video-summary">{video.summary}</p>}
                        <a
                          className="mini-btn video-link"
                          href={video.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          在 {getPlatformLabel(video.platform)} 上打开
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </main>

      <div className="mobile-cta">
        <a className="btn primary" href="#experience">进入 3D 展示</a>
      </div>
    </div>
  )
}

function assetBaseUrlFallback(baseUrl) {
  return baseUrl ?? '/'
}
