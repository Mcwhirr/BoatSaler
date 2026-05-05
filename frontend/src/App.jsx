import { useEffect, useMemo, useState } from 'react'
import AdminPage from './AdminPage'
import OrderPage from './OrderPage'
import OrderSuccessPage from './OrderSuccessPage'
import ShipScene from './ShipScene'

const PREFERRED_MODEL_ID = 'FireFighting'
const MODEL_STORAGE_KEY = 'salesboat.selected-model-id'
const HERO_IMAGE_FILE_NAME = 'FrontPage.png'
const BROCHURE_FILE_NAME = '2026\u4eac\u7a57\u8239\u8236\u4ea7\u54c1\u5ba3\u4f20\u518c.pdf'

const legacyFallbackSpecs = {
  overallLength: '15.80',
  waterlineLength: '15.10',
  beam: '3.50',
  depth: '1.20',
  draft: '0.50',
  navigationArea: '',
  mainEnginePower: '10 - 75 HP',
  designSpeed: '25',
  ratedCapacity: '32',
  powerType: '电动舷外机',
  material: '铝合金或玻璃钢',
  certificateType: '检验证书'
}

const modelSpecGroups = [
  {
    title: '船体参数',
    fields: ['overallLength', 'waterlineLength', 'beam']
  },
  {
    title: '尺度与航区',
    fields: ['depth', 'draft', 'navigationArea']
  },
  {
    title: '动力与乘员',
    fields: ['mainEnginePower', 'designSpeed', 'ratedCapacity', 'powerType']
  },
  {
    title: '材质与认证',
    fields: ['material', 'certificateType']
  }
]

const modelSpecFieldLabels = {
  overallLength: '总长',
  waterlineLength: '水线长',
  beam: '船宽',
  depth: '型深',
  draft: '吃水',
  navigationArea: '航区',
  mainEnginePower: '主机功率',
  designSpeed: '设计航速',
  ratedCapacity: '额定乘员',
  powerType: '动力形式',
  material: '材质',
  certificateType: '证书类型'
}

const viewerSpecFields = ['overallLength', 'draft', 'mainEnginePower']
const MAX_COMPARE_MODEL_COUNT = 4

const vesselCategories = [
  '新能源船',
  '应急救援船',
  '公务执法艇',
  '游艇'
]

const vesselCategoryMenus = [
  { id: 'new-energy', label: '新能源船' },
  { id: 'rescue', label: '应急救援船' },
  { id: 'duty', label: '公务执法艇' },
  { id: 'yacht', label: '游艇' }
]

function getModelDisplayLabel(model) {
  if (!model) {
    return ''
  }

  if (model.label && model.label !== model.id) {
    return model.label
  }

  if (model.id === 'FireFighting') {
    return '消防救援船'
  }

  if (model.id === 'Cabnet') {
    return '公务船'
  }

  return model.label
}

function getCategoryIdForModel(model) {
  const explicitType = `${model?.type ?? ''}`.trim()
  if (explicitType === '新能源船') {
    return 'new-energy'
  }

  if (explicitType === '应急救援船') {
    return 'rescue'
  }

  if (explicitType === '公务执法艇') {
    return 'duty'
  }

  if (explicitType === '游艇') {
    return 'yacht'
  }

  const rawLabel = `${model?.label ?? model?.id ?? ''}`.toLowerCase()
  const rawId = `${model?.id ?? ''}`.toLowerCase()

  if (rawLabel.includes('yacht') || rawId.includes('yacht') || rawLabel.includes('游艇')) {
    return 'yacht'
  }

  if (
    rawId.includes('fire') ||
    rawLabel.includes('fire') ||
    rawLabel.includes('rescue') ||
    rawLabel.includes('救援')
  ) {
    return 'rescue'
  }

  if (
    rawId.includes('cabnet') ||
    rawId.includes('twolayer') ||
    rawLabel.includes('duty') ||
    rawLabel.includes('执法') ||
    rawLabel.includes('公务')
  ) {
    return 'duty'
  }

  return 'new-energy'
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

function getRequestedModelId() {
  if (typeof window === 'undefined') {
    return ''
  }

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('model')?.trim() ?? ''
}

function isCaptureModeEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('capture') === '1'
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

function getModelSpecs(model) {
  return {
    ...legacyFallbackSpecs,
    ...(model?.specs ?? {})
  }
}

function formatPrice(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(Number(value) || 0)
}

function getModelReferencePrice(model) {
  const candidate = `${model?.price ?? ''}`.trim()
  if (!candidate) {
    return null
  }

  const amount = Number(candidate)
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return amount
}

function getModelPriceLabel(model) {
  const amount = getModelReferencePrice(model)
  if (amount === null) {
    return ''
  }

  return `参考价 ${formatPrice(amount)}`
}

function formatModelSpecValue(fieldKey, rawValue) {
  const value = `${rawValue ?? ''}`.trim()
  if (!value) {
    return '待补充'
  }

  if (['overallLength', 'waterlineLength', 'beam', 'depth', 'draft'].includes(fieldKey)) {
    return `${value} m`
  }

  if (fieldKey === 'designSpeed') {
    return `≥ ${value} km/h`
  }

  if (fieldKey === 'ratedCapacity') {
    return `${value}（含船员）`
  }

  return value
}

function buildViewerSpecItems(model) {
  const specs = getModelSpecs(model)

  return viewerSpecFields.map((fieldKey) => ({
    label: modelSpecFieldLabels[fieldKey],
    value: formatModelSpecValue(fieldKey, specs[fieldKey])
  }))
}

function buildComparisonSpecSections(model) {
  const specs = getModelSpecs(model)

  return modelSpecGroups.map((group) => ({
    title: group.title,
    items: group.fields.map((fieldKey) => ({
      key: fieldKey,
      label: modelSpecFieldLabels[fieldKey],
      value: formatModelSpecValue(fieldKey, specs[fieldKey])
    }))
  }))
}

function buildComparisonCardItems(model) {
  const specs = getModelSpecs(model)

  return modelSpecGroups.flatMap((group) => group.fields.map((fieldKey) => ({
    key: fieldKey,
    label: modelSpecFieldLabels[fieldKey],
    value: formatModelSpecValue(fieldKey, specs[fieldKey])
  })))
}

function getModelDetailImageAssetPath(model) {
  if (!model) {
    return ''
  }

  if (`${model.detailImagePath ?? ''}`.trim()) {
    return `gltf/${encodeURIComponent(model.id)}/${encodeRelativeAssetPath(model.detailImagePath)}`
  }

  return `gltf/${encodeURIComponent(model.id)}/tbrender.png`
}

function encodeRelativeAssetPath(relativePath) {
  return `${relativePath ?? ''}`
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function normalizeCompareModelIds(compareModelIds, models, selectedModelId) {
  const validModelIds = new Set(models.map((model) => model.id))
  const nextIds = []

  compareModelIds.forEach((modelId) => {
    if (!validModelIds.has(modelId) || nextIds.includes(modelId) || modelId === selectedModelId) {
      return
    }

    nextIds.push(modelId)
  })

  return nextIds.slice(0, MAX_COMPARE_MODEL_COUNT)
}

export default function App() {
  const runtimeBasePath = getRuntimeBasePath()
  const staticAssetBaseUrl = getStaticAssetBaseUrl(
    import.meta.env.VITE_STATIC_ASSET_ORIGIN,
    import.meta.env.BASE_URL
  )
  const captureMode = isCaptureModeEnabled()
  const resolveStaticPath = (relativePath) => `${staticAssetBaseUrl}${relativePath}`
  const resolveApiPath = (relativePath) => `${runtimeBasePath}${relativePath}`

  const [route, setRoute] = useState(() => getRouteFromHash(window.location.hash))
  const [isScrolled, setIsScrolled] = useState(false)
  const [sceneViewToggleTarget, setSceneViewToggleTarget] = useState(null)
  const [openCategoryId, setOpenCategoryId] = useState(null)
  const [openCompareSelectId, setOpenCompareSelectId] = useState(null)
  const [modelManifest, setModelManifest] = useState(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [compareModelIds, setCompareModelIds] = useState([])
  const [siteContent, setSiteContent] = useState({ videos: [], models: {} })
  const modelContentById = siteContent?.models ?? {}
  const models = useMemo(
    () => (modelManifest?.models ?? []).map((model) => {
      const content = modelContentById[model.id] ?? {}

      return {
        ...model,
        label: `${content.displayName ?? ''}`.trim() || model.label,
        type: `${content.type ?? ''}`.trim(),
        price: `${content.price ?? ''}`.trim(),
        specs: content.specs ?? {},
        engines: Array.isArray(content.engines) ? content.engines : [],
        detailImagePath: `${content.detailImagePath ?? ''}`.trim()
      }
    }),
    [modelManifest, modelContentById]
  )
  const videos = siteContent?.videos ?? []

  const primaryModel = models.find((model) => model.id === selectedModelId) ?? null
  const selectedModelLabel = getModelDisplayLabel(primaryModel) || (models.length ? '选择船型' : '正在加载船型')
  const selectedModelPriceLabel = getModelPriceLabel(primaryModel)
  const brochurePath = resolveStaticPath(`pdf/${encodeURIComponent(BROCHURE_FILE_NAME)}`)
  const heroImagePath = resolveStaticPath(`pdf/${encodeURIComponent(HERO_IMAGE_FILE_NAME)}`)
  const specImagePath = primaryModel
    ? resolveStaticPath(getModelDetailImageAssetPath(primaryModel))
    : ''
  const viewerSpecItems = buildViewerSpecItems(primaryModel)
  const primaryDetailSpecCards = buildComparisonSpecSections(primaryModel)
  const modelsByCategory = useMemo(
    () => vesselCategoryMenus
      .map((category) => ({
        ...category,
        models: models.filter((model) => getCategoryIdForModel(model) === category.id)
      }))
      .filter((category) => category.models.length > 0),
    [models]
  )
  const compareModels = useMemo(
    () => compareModelIds
      .map((modelId) => models.find((model) => model.id === modelId) ?? null)
      .filter(Boolean),
    [compareModelIds, models]
  )
  const activeCategoryId = primaryModel ? getCategoryIdForModel(primaryModel) : modelsByCategory[0]?.id ?? null

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
    let animationFrameId = 0

    const updatePointerGlow = (event) => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--cursor-x', `${event.clientX}px`)
        document.documentElement.style.setProperty('--cursor-y', `${event.clientY}px`)
      })
    }

    window.addEventListener('pointermove', updatePointerGlow, { passive: true })

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      window.removeEventListener('pointermove', updatePointerGlow)
    }
  }, [])

  useEffect(() => {
    if (route === 'admin') {
      return undefined
    }

    let isCancelled = false

    const loadShowcaseData = async () => {
      try {
        const manifestUrl = resolveStaticPath('gltf/asset-manifest.json')
        const contentUrl = resolveApiPath('api/site-content')

        const [manifestResponse, contentResponse] = await Promise.all([
          fetch(manifestUrl, { cache: 'no-store' }),
          fetch(contentUrl, { cache: 'no-store' }).catch(() => null)
        ])

        if (!manifestResponse.ok) {
          throw new Error(`Failed to fetch asset-manifest.json: ${manifestResponse.status}`)
        }

        const manifest = await manifestResponse.json()
        const content = contentResponse?.ok ? await contentResponse.json() : { videos: [], models: {} }
        if (isCancelled) {
          return
        }

        setModelManifest(manifest)
        setSiteContent(content ?? { videos: [], models: {} })

        const availableIds = new Set((manifest.models ?? []).map((model) => model.id))
        const requestedModelId = getRequestedModelId()
        const storedModelId = window.localStorage.getItem(MODEL_STORAGE_KEY)
        const persistedModelId = storedModelId && availableIds.has(storedModelId)
          ? storedModelId
          : ''
        const queryModelId = requestedModelId && availableIds.has(requestedModelId)
          ? requestedModelId
          : ''
        const defaultModelId = availableIds.has(manifest.primaryModelId)
          ? manifest.primaryModelId
          : manifest.models?.[0]?.id ?? ''
        const preferredModelId = availableIds.has(PREFERRED_MODEL_ID) ? PREFERRED_MODEL_ID : ''
        const initialModelId = queryModelId || persistedModelId || defaultModelId || preferredModelId

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

  useEffect(() => {
    const closeMenusOnOutsideInteraction = (event) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('.site-category-group') ||
        event.target.closest('.detail-compare-select-group')
      ) {
        return
      }

      setOpenCategoryId(null)
      setOpenCompareSelectId(null)
    }

    const closeMenusOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenCategoryId(null)
        setOpenCompareSelectId(null)
      }
    }

    document.addEventListener('pointerdown', closeMenusOnOutsideInteraction)
    document.addEventListener('keydown', closeMenusOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeMenusOnOutsideInteraction)
      document.removeEventListener('keydown', closeMenusOnEscape)
    }
  }, [])

  useEffect(() => {
    setCompareModelIds((current) => normalizeCompareModelIds(current, models, selectedModelId))
  }, [models, selectedModelId])

  const handleModelSelect = (modelId) => {
    if (!modelId || modelId === selectedModelId) {
      return
    }

    setSelectedModelId(modelId)
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelId)
  }

  const scrollToExperience = () => {
    document.getElementById('experience')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleCategoryTriggerClick = (category) => {
    if (!category) {
      return
    }

    if (category.models.length === 1) {
      handleModelSelect(category.models[0].id)
      setOpenCategoryId(null)
      scrollToExperience()
      return
    }

    setOpenCategoryId((current) => (current === category.id ? null : category.id))
    scrollToExperience()
  }

  const handleCategoryItemClick = (modelId) => {
    handleModelSelect(modelId)
    setOpenCategoryId(null)
    scrollToExperience()
  }

  const handleCompareSelectToggle = (modelId) => {
    if (!modelId) {
      return
    }

    setOpenCompareSelectId((current) => (current === modelId ? null : modelId))
  }

  const handleCompareToggle = (modelId) => {
    if (!modelId) {
      return
    }

    setCompareModelIds((current) => {
      if (current.includes(modelId)) {
        return current.filter((currentId) => currentId !== modelId)
      }

      if (current.length >= MAX_COMPARE_MODEL_COUNT) {
        return current
      }

      return normalizeCompareModelIds([...current, modelId], models, selectedModelId)
    })
  }

  const handleAddCompareCard = () => {
    setCompareModelIds((current) => {
      if (current.length >= MAX_COMPARE_MODEL_COUNT) {
        return current
      }

      const usedIds = new Set([selectedModelId, ...current])
      const nextModel = models.find((model) => !usedIds.has(model.id))
      if (!nextModel) {
        return current
      }

      return [...current, nextModel.id]
    })
  }

  const handleCompareModelChange = (currentModelId, nextModelId) => {
    if (!currentModelId || !nextModelId || nextModelId === selectedModelId) {
      return
    }

    setOpenCompareSelectId(null)

    setCompareModelIds((current) => {
      if (!current.includes(currentModelId)) {
        return current
      }

      if (current.includes(nextModelId) && nextModelId !== currentModelId) {
        return current
      }

      return current.map((modelId) => (modelId === currentModelId ? nextModelId : modelId))
    })
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
        apiBasePath={runtimeBasePath}
      />
    )
  }

  if (route === 'order-success') {
    return <OrderSuccessPage />
  }

  if (captureMode) {
    return (
      <main className="capture-screen">
        <div className="capture-scene-shell">
          <ShipScene modelConfig={primaryModel} />
        </div>
      </main>
    )
  }

  return (
    <div className="page">
      <header className={`site-nav ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="site-nav-inner">
          <div className="site-nav-left">
            <nav className="site-categories" aria-label="船型分类">
              {modelsByCategory.map((category) => {
                const isActiveCategory = category.id === activeCategoryId
                const isOpen = openCategoryId === category.id

                return (
                  <div
                    key={category.id}
                    className={`site-category-group ${isActiveCategory ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`}
                    onMouseEnter={() => setOpenCategoryId(category.id)}
                    onMouseLeave={() => setOpenCategoryId((current) => (current === category.id ? null : current))}
                  >
                    <button
                      type="button"
                      className="site-category-trigger"
                      onClick={() => handleCategoryTriggerClick(category)}
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                    >
                      <span>{category.label}</span>
                      <span className="site-category-caret" aria-hidden="true">▾</span>
                    </button>

                    <div className="site-category-dropdown" role="menu" aria-label={category.label}>
                      {category.models.map((model) => {
                        const isActiveModel = model.id === selectedModelId

                        return (
                          <button
                            key={model.id}
                            type="button"
                            className={`site-category-option ${isActiveModel ? 'active' : ''}`}
                            onClick={() => handleCategoryItemClick(model.id)}
                            role="menuitem"
                          >
                            <span>{getModelDisplayLabel(model)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>
          </div>

          <a className="brand" href="#top">京穗船舶</a>

          <div className="site-nav-right">
            <nav className="site-links" aria-label="主导航">
              <a href="#poster">首页</a>
              <a href="#experience">3D 看船</a>
              <a href="#details">船型参数</a>
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
          <div className="hero-aurora" aria-hidden="true">
            <span className="hero-aurora-orb hero-aurora-orb-1" />
            <span className="hero-aurora-orb hero-aurora-orb-2" />
            <span className="hero-aurora-ring" />
          </div>

          <div className="hero-content">
            <p className="hero-kicker reveal reveal-1">京穗船舶 · 数字化选型平台</p>
            <h1 className="reveal reveal-2">从任务需求到船型方案，让每一次选型都有据可依。</h1>
            <p className="hero-slogan reveal reveal-3">
              通过高精度 3D 看船、标准化参数卡与可配置订购流程，帮助客户快速理解船体结构、动力方案与任务化选装，提升沟通与决策效率。
            </p>
            <div className="hero-proof-strip reveal reveal-4" aria-label="平台能力">
              <span>高精度 3D 看船</span>
              <span>参数透明管理</span>
              <span>方案意向直达销售</span>
            </div>
            <div className="hero-actions reveal reveal-4">
              <a className="btn primary" href="#experience">查看 3D 船型</a>
              <a className="btn order-btn" href="#/order">提交方案意向</a>
            </div>
          </div>

          <a className="scroll-cue reveal reveal-4" href="#experience">
            <span className="scroll-cue-line" />
            <span>查看船型</span>
          </a>
        </section>

        <section className="viewer-screen" id="experience">
          <div className="viewer-canvas viewer-canvas-fullscreen">
            <div className="viewer-canvas-toolbar">
              <div className="viewer-spec-card">
                <div className="viewer-spec-topbar">
                  <div className="viewer-spec-topbar-copy">
                    <p className="viewer-control-eyebrow">核心参数</p>
                    <p className="viewer-control-title">{selectedModelLabel}</p>
                    {selectedModelPriceLabel && (
                      <p className="viewer-control-price">{selectedModelPriceLabel}</p>
                    )}
                  </div>
                  <div className="viewer-scene-toggle-slot" ref={setSceneViewToggleTarget} />
                </div>
                <div className="viewer-spec-header">
                  <p className="viewer-control-eyebrow">核心参数</p>
                  <p className="viewer-control-title">{selectedModelLabel}</p>
                </div>

                <div className="viewer-spec-grid" role="list" aria-label={`${selectedModelLabel} 主要参数`}>
                  {viewerSpecItems.map((item) => (
                    <div key={item.label} className="viewer-spec-item" role="listitem">
                      <span className="viewer-spec-label">{item.label}</span>
                      <strong className="viewer-spec-value">{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <ShipScene modelConfig={primaryModel} viewTogglePortalTarget={sceneViewToggleTarget} />
          </div>
        </section>

        <section className="detail-screen" id="details">
          <div className="detail-screen-inner">
            <section className="detail-spec-showcase" aria-label="主要技术参数">
              <div className="detail-spec-combined-card">
                <div className="detail-spec-visual">
                {specImagePath && (
                  <img
                    className="detail-spec-image"
                    src={specImagePath}
                    alt={`${selectedModelLabel} 渲染图`}
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>

              <div className="detail-spec-panel">
                <div className="detail-spec-head">
                  <p className="detail-card-eyebrow">技术概览</p>
                  <h3>{selectedModelLabel} 参数与方案概览</h3>
                  {selectedModelPriceLabel && (
                    <p className="detail-spec-price">{selectedModelPriceLabel}</p>
                  )}
                  <p>围绕总长、吃水、主机功率等关键指标展示，便于快速完成船型初筛、方案沟通与多型号对比。</p>
                </div>

                <div className="detail-spec-card-grid">
                  {primaryDetailSpecCards.map((card) => (
                    <article key={card.title} className="detail-spec-card">
                      <h4>{card.title}</h4>
                      <div className="detail-spec-table" role="table" aria-label={card.title}>
                        {card.items.map((item) => (
                          <div key={item.key} className="detail-spec-row" role="row">
                            <span className="detail-spec-label" role="cell">{item.label}</span>
                            <strong className="detail-spec-value" role="cell">{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>

              </div>
            </div>
            </section>

            <section className="detail-compare-stack" aria-label={'\u5bf9\u6bd4\u5361\u7247'}>
              <div className="detail-compare-toolbar">
                <div>
                  <p className="detail-card-eyebrow">方案对比</p>
                  <h4 className="detail-compare-heading">最多四型同屏对比</h4>
                </div>

                <div className="detail-compare-toolbar-actions">
                  <p className="detail-compare-status">{`已加入 ${compareModels.length} / ${MAX_COMPARE_MODEL_COUNT} 个船型`}</p>
                  <button
                    type="button"
                    className="mini-btn detail-compare-add-btn"
                    onClick={handleAddCompareCard}
                    disabled={compareModels.length >= MAX_COMPARE_MODEL_COUNT || models.length <= compareModels.length + 1}
                  >
                    添加对比船型
                  </button>
                </div>
              </div>

              {compareModels.length > 0 ? (
                <div
                  className="detail-compare-grid"
                  style={{
                    '--compare-columns': `${Math.max(2, Math.min(compareModels.length, MAX_COMPARE_MODEL_COUNT))}`
                  }}
                >
                  {compareModels.map((model) => {
                    const cardItems = buildComparisonCardItems(model)
                    const compareImagePath = resolveStaticPath(getModelDetailImageAssetPath(model))
                    const comparePriceLabel = getModelPriceLabel(model)
                    const isCompareSelectOpen = openCompareSelectId === model.id
                    const selectableModels = models.filter((candidate) => (
                      candidate.id !== selectedModelId &&
                      (candidate.id === model.id || !compareModelIds.includes(candidate.id))
                    ))

                    return (
                      <article key={model.id} className="detail-compare-card">
                        {compareImagePath && (
                          <div className="detail-compare-image-shell">
                            <img
                              className="detail-compare-image"
                              src={compareImagePath}
                              alt={`${getModelDisplayLabel(model)} ${'\u7565\u7f29\u56fe'}`}
                              loading="lazy"
                            />
                          </div>
                        )}

                        <div className="detail-compare-card-head">
                          <div>
                            <p className="detail-compare-card-kicker">{model.type || '船型对比'}</p>
                            <h4>{getModelDisplayLabel(model)}</h4>
                            {comparePriceLabel && (
                              <p className="detail-compare-card-price">{comparePriceLabel}</p>
                            )}
                            <div className="detail-compare-select-wrap">
                              <span className="detail-compare-select-label">切换对比船型</span>
                              <div
                                className={`detail-compare-select-group ${isCompareSelectOpen ? 'is-open' : ''}`}
                                onMouseEnter={() => setOpenCompareSelectId(model.id)}
                                onMouseLeave={() => setOpenCompareSelectId((current) => (current === model.id ? null : current))}
                              >
                                <button
                                  type="button"
                                  className="detail-compare-select-trigger"
                                  onClick={() => handleCompareSelectToggle(model.id)}
                                  aria-expanded={isCompareSelectOpen}
                                  aria-haspopup="menu"
                                >
                                  <span>{getModelDisplayLabel(model)}</span>
                                  <span className="detail-compare-select-caret" aria-hidden="true">▾</span>
                                </button>

                                <div className="detail-compare-select-dropdown" role="menu" aria-label={'\u8239\u578b\u9009\u62e9'}>
                                  {selectableModels.map((candidate) => {
                                    const isActiveCandidate = candidate.id === model.id

                                    return (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        className={`detail-compare-select-option ${isActiveCandidate ? 'active' : ''}`}
                                        onClick={() => handleCompareModelChange(model.id, candidate.id)}
                                        role="menuitem"
                                      >
                                        <span>{getModelDisplayLabel(candidate)}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="detail-compare-card-actions">
                            <button
                              type="button"
                              className="mini-btn detail-compare-focus-btn"
                              onClick={() => handleModelSelect(model.id)}
                            >
                              {'\u8bbe\u4e3a\u4e3b\u5c55\u793a'}
                            </button>
                            <button
                              type="button"
                              className="mini-btn detail-compare-remove-btn"
                              onClick={() => handleCompareToggle(model.id)}
                            >
                              {'\u79fb\u9664'}
                            </button>
                          </div>
                        </div>

                        <div className="detail-spec-table" role="table" aria-label={`${getModelDisplayLabel(model)} ${'\u5bf9\u6bd4\u53c2\u6570'}`}>
                          {cardItems.map((item) => (
                            <div key={item.key} className="detail-spec-row" role="row">
                              <span className="detail-spec-label" role="cell">{item.label}</span>
                              <strong className="detail-spec-value" role="cell">{item.value}</strong>
                            </div>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="detail-compare-empty">
                  <p>添加对比船型后，可在同一视图内并排查看最多 4 个型号的关键参数、参考价格与外观缩略图。</p>
                </div>
              )}
            </section>

            {videos.length > 0 && (
              <section className="video-showcase" aria-label="外部视频展示">
                <div className="video-section-header">
                  <div>
                    <p className="detail-kicker">影像资料</p>
                    <h3>航行与任务场景视频</h3>
                  </div>
                  <p className="video-section-copy">
                    通过航行、靠泊、任务执行与细节镜头，辅助客户理解船型在真实使用场景中的状态与质感。
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
        <a className="btn primary" href="#experience">查看 3D 船型</a>
      </div>
    </div>
  )
}

function assetBaseUrlFallback(baseUrl) {
  return baseUrl ?? '/'
}

function normalizeBaseUrl(baseUrl) {
  const normalizedValue = `${baseUrl ?? ''}`.trim()
  if (!normalizedValue) {
    return '/'
  }

  return normalizedValue.endsWith('/') ? normalizedValue : `${normalizedValue}/`
}

function getStaticAssetBaseUrl(staticAssetOrigin, fallbackBaseUrl) {
  const explicitOrigin = `${staticAssetOrigin ?? ''}`.trim()
  if (explicitOrigin) {
    return normalizeBaseUrl(explicitOrigin)
  }

  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname || '/'
    const basePath = pathname.endsWith('/')
      ? pathname
      : pathname.slice(0, pathname.lastIndexOf('/') + 1)

    return normalizeBaseUrl(basePath || '/')
  }

  return normalizeBaseUrl(assetBaseUrlFallback(fallbackBaseUrl))
}

function getRuntimeBasePath() {
  if (typeof window === 'undefined') {
    return '/'
  }

  const pathname = window.location.pathname || '/'
  const basePath = pathname.endsWith('/')
    ? pathname
    : pathname.slice(0, pathname.lastIndexOf('/') + 1)

  return normalizeBaseUrl(basePath || '/')
}
