import { useEffect, useState } from 'react'
import ShipScene from './ShipScene'

const PREFERRED_MODEL_ID = 'PleasureBoat1'
const MODEL_STORAGE_KEY = 'salesboat.selected-model-id'
const HERO_IMAGE_FILE_NAME = 'FrontPage.png'
const BROCHURE_FILE_NAME = '2026京穗船舶产品宣传册.pdf'

const detailCards = [
  {
    eyebrow: 'Product Positioning',
    title: '面向销售演示的船艇数字封面',
    text: '第一页保留宣传册封面与一句 Slogan，让客户先建立品牌印象，再进入模型演示，避免一开始就被复杂信息打断。'
  },
  {
    eyebrow: 'Interactive Review',
    title: '全屏 3D 进入产品讲解模式',
    text: '第二页直接切入整屏模型展示，便于在会议室、大屏或 iPad 上进行外观讲解、角度切换和船型切换。'
  },
  {
    eyebrow: 'Asset Strategy',
    title: '按 UV 可用性选择更稳定的模型格式',
    text: '当前资源链路会优先使用更适合贴图映射的模型文件，减少黑模、错贴图和材质命名不一致带来的演示风险。'
  },
  {
    eyebrow: 'Sales Workflow',
    title: '从宣传册到配置沟通形成连续体验',
    text: '销售可以先用封面建立信任，再进入模型讲解，随后在第三页继续承接配置亮点、交付说明和后续方案介绍。'
  }
]

function getModelDisplayLabel(model) {
  if (!model) {
    return ''
  }

  if (model.id === 'TestModel') {
    return 'Test Model'
  }

  return model.label
}

export default function App() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [modelManifest, setModelManifest] = useState(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const models = modelManifest?.models ?? []

  const primaryModel = models.find((model) => model.id === selectedModelId) ?? null
  const selectedModelLabel = getModelDisplayLabel(primaryModel) || (models.length ? 'Select Vessel' : 'Loading Vessels')
  const brochurePath = `${import.meta.env.BASE_URL}pdf/${encodeURIComponent(BROCHURE_FILE_NAME)}`
  const heroImagePath = `${import.meta.env.BASE_URL}pdf/${encodeURIComponent(HERO_IMAGE_FILE_NAME)}`

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 12)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
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
        console.error('Failed to load model manifest:', error)
      }
    }

    loadManifest()

    return () => {
      isCancelled = true
    }
  }, [])

  const handleModelSelect = (modelId) => {
    if (!modelId || modelId === selectedModelId) {
      return
    }

    setSelectedModelId(modelId)
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelId)
  }

  return (
    <div className="page">
      <header className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="site-nav-inner">
          <a className="brand" href="#top">SalesBoat</a>
          <nav className="site-links" aria-label="Primary navigation">
            <a href="#poster">Poster</a>
            <a href="#experience">3D View</a>
            <a href="#details">Details</a>
          </nav>
          <a className="mini-btn" href={brochurePath} download={BROCHURE_FILE_NAME}>Brochure</a>
        </div>
      </header>

      <main className="page-main" id="top">
        <section className="hero-screen" id="poster">
          <img className="hero-poster" src={heroImagePath} alt="Jingsui brochure front page" />
          <div className="hero-overlay" />

          <div className="hero-content">
            <p className="hero-kicker reveal reveal-1">JINGSUI SHIPBUILDING</p>
            <h1 className="reveal reveal-2">重庆京穗船舶产品展示</h1>
            <p className="hero-slogan reveal reveal-3">
              One poster. One slogan. Then straight into a full-screen 3D review.
            </p>
            <div className="hero-actions reveal reveal-4">
              <a className="btn primary" href="#experience">进入 3D 展示</a>
            </div>
          </div>

          <a className="scroll-cue reveal reveal-4" href="#experience">
            <span className="scroll-cue-line" />
            <span>Scroll</span>
          </a>
        </section>

        <section className="viewer-screen" id="experience">
          <div className="viewer-canvas viewer-canvas-fullscreen">
            <div className="viewer-canvas-toolbar">
              <div className="viewer-selector-meta">
                <p className="viewer-control-eyebrow">VESSEL LINEUP</p>
                <p className="viewer-control-title">{selectedModelLabel}</p>
                <p className="viewer-control-caption">Switch the live vessel directly from the canvas.</p>
              </div>

              <div className="viewer-selector-dock" role="toolbar" aria-label="Vessel selector">
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
              <p className="detail-kicker">DETAILED INTRODUCTION</p>
              <h2>第三页开始承接更详细的介绍，让演示从视觉吸引过渡到业务说明。</h2>
              <p>
                这一页保留苹果式的留白和节奏，用更安静的卡片布局继续介绍产品价值、展示逻辑和销售使用场景。
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
          </div>
        </section>
      </main>

      <div className="mobile-cta">
        <a className="btn primary" href="#experience">进入 3D 展示</a>
      </div>
    </div>
  )
}
