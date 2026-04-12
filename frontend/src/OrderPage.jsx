import { useEffect, useMemo, useState } from 'react'
import ShipScene from './ShipScene'

const productCategories = [
  '新能源船',
  '应急救援船',
  '公务执法艇',
  '游艇'
]

const configurationSteps = ['船型', '外观', '内饰', '动力', '选装']

const sectionIds = {
  船型: 'order-section-model',
  外观: 'order-section-appearance',
  内饰: 'order-section-interior',
  动力: 'order-section-power',
  选装: 'order-section-options'
}

const orderStageOptions = [
  { id: 'model', label: '1 选择船型' },
  { id: 'config', label: '2 配置方案' },
  { id: 'submit', label: '3 提交信息' }
]

const stepFocusTargets = {
  船型: 'overview',
  外观: 'overview',
  内饰: 'interior',
  动力: 'engine',
  选装: 'console'
}

const powerOptions = [
  {
    id: 'dual-electric-standard',
    label: '标准双电机动力',
    description: '适合日常巡航、接待与中短途运营',
    price: 368000
  },
  {
    id: 'dual-electric-performance',
    label: '高性能双电机动力',
    description: '更高巡航稳定性与更强动态表现',
    price: 428000
  },
  {
    id: 'hybrid-rescue',
    label: '混动应急动力系统',
    description: '适合高负载、长时间与复杂任务场景',
    price: 468000
  }
]

const appearanceOptions = [
  {
    id: 'business',
    label: '商务外观',
    description: '强调高级感与接待属性',
    price: 0
  },
  {
    id: 'sport',
    label: '运动外观',
    description: '更锐利的线条与更强速度感',
    price: 12000
  },
  {
    id: 'duty',
    label: '执法外观',
    description: '适合公务与巡逻应用的识别风格',
    price: 18000
  }
]

const colorOptions = [
  { id: 'pearl-white', label: '珠光白', hex: '#f2f3f5', surcharge: 0 },
  { id: 'deep-sea-blue', label: '深海蓝', hex: '#26445f', surcharge: 8000 },
  { id: 'graphite-gray', label: '石墨灰', hex: '#5a6169', surcharge: 6000 },
  { id: 'rescue-red', label: '救援红', hex: '#a92424', surcharge: 9000 }
]

const interiorOptions = [
  {
    id: 'marine-gray',
    label: '海岸灰内饰',
    description: '更适合商务接待与现代化展示空间',
    price: 0
  },
  {
    id: 'warm-teak',
    label: '暖木游艇内饰',
    description: '突出木地板、软包与更温暖的舱内氛围',
    price: 26000
  },
  {
    id: 'task-black',
    label: '任务黑执法内饰',
    description: '强调耐用性、功能性与设备集成感',
    price: 18000
  }
]

const optionalSeriesOptions = [
  {
    id: 'smart-maintenance',
    label: '智能监控与维护系统',
    description: '提供整船状态感知、远程诊断与维护提醒',
    price: 26000
  },
  {
    id: 'law-enforcement-assist',
    label: '执法辅助系统',
    description: '适合公务执法场景的任务辅助与联动能力',
    price: 32000
  },
  {
    id: 'smart-monitoring',
    label: '智能监控系统',
    description: '支持航行监控、周界感知与视频记录',
    price: 22000
  },
  {
    id: 'karaoke',
    label: '卡拉 OK 系统（游艇专用）',
    description: '为游艇娱乐场景准备的影音娱乐扩展',
    price: 18000,
    yachtOnly: true
  }
]

function formatPrice(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(value)
}

function getCategoryForModel(model) {
  const label = `${model?.label ?? model?.id ?? ''}`.toLowerCase()

  if (label.includes('yacht') || label.includes('游艇')) {
    return '游艇'
  }

  if (label.includes('two')) {
    return '公务执法艇'
  }

  if (label.includes('test') || label.includes('pleasure')) {
    return '新能源船'
  }

  return '应急救援船'
}

export default function OrderPage({
  models,
  primaryModel,
  selectedModelId,
  onSelectModel
}) {
  const currentModel = primaryModel
    ?? models.find((model) => model.id === selectedModelId)
    ?? models[0]
    ?? null

  const [selectedCategory, setSelectedCategory] = useState(getCategoryForModel(currentModel))
  const [selectedAppearanceId, setSelectedAppearanceId] = useState(appearanceOptions[0].id)
  const [selectedColorId, setSelectedColorId] = useState(colorOptions[0].id)
  const [selectedInteriorId, setSelectedInteriorId] = useState(interiorOptions[0].id)
  const [selectedPowerId, setSelectedPowerId] = useState(powerOptions[0].id)
  const [selectedOptionalIds, setSelectedOptionalIds] = useState([
    optionalSeriesOptions[0].id,
    optionalSeriesOptions[2].id
  ])
  const [activeConfigStep, setActiveConfigStep] = useState('船型')
  const [activeOrderStage, setActiveOrderStage] = useState('config')

  useEffect(() => {
    setSelectedCategory(getCategoryForModel(currentModel))
  }, [currentModel])

  const filteredModels = useMemo(
    () => models.filter((model) => getCategoryForModel(model) === selectedCategory),
    [models, selectedCategory]
  )

  const activeModel = currentModel ?? filteredModels[0] ?? models[0] ?? null
  const activeCategory = getCategoryForModel(activeModel)
  const activeAppearance = appearanceOptions.find((item) => item.id === selectedAppearanceId) ?? appearanceOptions[0]
  const activeColor = colorOptions.find((item) => item.id === selectedColorId) ?? colorOptions[0]
  const activeInterior = interiorOptions.find((item) => item.id === selectedInteriorId) ?? interiorOptions[0]
  const activePower = powerOptions.find((item) => item.id === selectedPowerId) ?? powerOptions[0]
  const availableOptionalSeries = optionalSeriesOptions.filter((item) => !item.yachtOnly || activeCategory === '游艇')
  const activeOptionalSeries = availableOptionalSeries.filter((item) => selectedOptionalIds.includes(item.id))

  const totalPrice = activeAppearance.price
    + activeColor.surcharge
    + activeInterior.price
    + activePower.price
    + activeOptionalSeries.reduce((sum, item) => sum + item.price, 0)

  useEffect(() => {
    if (activeCategory !== '游艇') {
      setSelectedOptionalIds((current) => current.filter((id) => id !== 'karaoke'))
    }
  }, [activeCategory])

  useEffect(() => {
    const updateActiveStage = () => {
      const modelSection = document.getElementById('order-section-model')
      const submitSection = document.getElementById('order-section-submit')
      if (!modelSection) {
        return
      }

      const probeLine = 140
      const modelRect = modelSection.getBoundingClientRect()
      const submitRect = submitSection?.getBoundingClientRect()

      if (submitRect && submitRect.top <= probeLine + 40) {
        setActiveOrderStage('submit')
        return
      }

      if (modelRect.bottom > probeLine) {
        setActiveOrderStage('model')
        return
      }

      setActiveOrderStage('config')
    }

    updateActiveStage()
    window.addEventListener('scroll', updateActiveStage, { passive: true })
    window.addEventListener('resize', updateActiveStage)

    return () => {
      window.removeEventListener('scroll', updateActiveStage)
      window.removeEventListener('resize', updateActiveStage)
    }
  }, [])

  useEffect(() => {
    const stepEntries = Object.entries(sectionIds)

    const updateActiveConfigStep = () => {
      const viewportProbe = 180
      let currentStep = configurationSteps[0]
      let bestDistance = Number.POSITIVE_INFINITY

      stepEntries.forEach(([step, sectionId]) => {
        const element = document.getElementById(sectionId)
        if (!element) {
          return
        }

        const rect = element.getBoundingClientRect()
        const distance = Math.abs(rect.top - viewportProbe)

        if (rect.top <= viewportProbe && rect.bottom >= viewportProbe) {
          currentStep = step
          bestDistance = -1
          return
        }

        if (bestDistance !== -1 && distance < bestDistance) {
          currentStep = step
          bestDistance = distance
        }
      })

      setActiveConfigStep((previous) => (previous === currentStep ? previous : currentStep))
    }

    updateActiveConfigStep()
    window.addEventListener('scroll', updateActiveConfigStep, { passive: true })
    window.addEventListener('resize', updateActiveConfigStep)

    return () => {
      window.removeEventListener('scroll', updateActiveConfigStep)
      window.removeEventListener('resize', updateActiveConfigStep)
    }
  }, [])

  const handleCategorySelect = (category) => {
    setSelectedCategory(category)
    const nextModel = models.find((model) => getCategoryForModel(model) === category)
    if (nextModel) {
      onSelectModel(nextModel.id)
    }
  }

  const handleOptionalToggle = (optionId) => {
    setSelectedOptionalIds((current) => (
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
    ))
  }

  const handleStepJump = (step) => {
    setActiveConfigStep(step)
    const targetId = sectionIds[step]
    if (!targetId) {
      return
    }

    const element = document.getElementById(targetId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleOrderStageSelect = (nextStage) => {
    setActiveOrderStage(nextStage)

    if (nextStage === 'model') {
      handleStepJump('船型')
      return
    }

    if (nextStage === 'config') {
      const configNav = document.querySelector('.order-config-nav')
      configNav?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const submitSection = document.getElementById('order-section-submit')
    submitSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="order-page">
      <header className="order-topbar">
        <div className="order-topbar-inner">
          <a className="order-back-link" href="#top">返回首页</a>
          <div className="order-progress" aria-label="订购流程">
            {orderStageOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`order-progress-step ${activeOrderStage === option.id ? 'active' : ''}`}
                onClick={() => handleOrderStageSelect(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="order-shell">
        <section className="order-visual-column">
          <div className="order-visual-sticky">
            <div className="order-scene-panel">
              {activeModel ? (
                <ShipScene
                  modelConfig={activeModel}
                  focusTarget={stepFocusTargets[activeConfigStep] ?? 'overview'}
                  colorConfig={activeColor}
                  overviewZoomScale={0.82}
                />
              ) : <div className="order-scene-empty">暂无可预览模型</div>}
            </div>
          </div>
        </section>

        <section className="order-config-column">
          <div className="order-config-nav" aria-label="配置导航">
            {configurationSteps.map((item) => (
              <button
                key={item}
                type="button"
                className={`order-config-nav-item ${activeConfigStep === item ? 'active' : ''}`}
                onClick={() => handleStepJump(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <section id="order-section-model" className="order-config-section">
            <div className="order-section-header">
              <p className="order-section-step">01</p>
              <div>
                <h2>船型</h2>
                <p>先选择产品方向，再切换对应船型。</p>
              </div>
            </div>

            <div className="order-category-row" role="tablist" aria-label="船型分类">
              {productCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`order-category-chip ${selectedCategory === category ? 'active' : ''}`}
                  onClick={() => handleCategorySelect(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="order-model-grid">
              {filteredModels.map((model) => {
                const isActive = model.id === activeModel?.id

                return (
                  <button
                    key={model.id}
                    type="button"
                    className={`order-model-card ${isActive ? 'active' : ''}`}
                    onClick={() => onSelectModel(model.id)}
                  >
                    <div className="order-model-card-copy">
                      <p className="order-model-category">{getCategoryForModel(model)}</p>
                      <h3>{model.label}</h3>
                      <p>{model.id}</p>
                    </div>
                    <span className="order-model-card-state">{isActive ? '已选中' : '选择'}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section id="order-section-appearance" className="order-config-section">
            <div className="order-section-header">
              <p className="order-section-step">02</p>
              <div>
                <h2>外观</h2>
                <p>外观与船体颜色组合为必选项，用于确认整船视觉方向。</p>
              </div>
            </div>

            <div className="order-option-stack">
              {appearanceOptions.map((option) => (
                <label key={option.id} className={`order-radio-card ${selectedAppearanceId === option.id ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="appearanceOption"
                    checked={selectedAppearanceId === option.id}
                    onChange={() => setSelectedAppearanceId(option.id)}
                  />
                  <div>
                    <h3>{option.label}</h3>
                    <p>{option.description}</p>
                  </div>
                  <strong>{option.price > 0 ? formatPrice(option.price) : '标准'}</strong>
                </label>
              ))}
            </div>

            <div className="order-color-grid order-subsection">
              {colorOptions.map((color) => {
                const isActive = color.id === selectedColorId

                return (
                  <button
                    key={color.id}
                    type="button"
                    className={`order-color-card ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedColorId(color.id)}
                  >
                    <span className="order-color-swatch" style={{ backgroundColor: color.hex }} />
                    <div>
                      <h3>{color.label}</h3>
                      <p>{color.surcharge > 0 ? `${formatPrice(color.surcharge)} 选装` : '标准配色'}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section id="order-section-interior" className="order-config-section">
            <div className="order-section-header">
              <p className="order-section-step">03</p>
              <div>
                <h2>内饰</h2>
                <p>根据用途选择更合适的舱内氛围与材质方向。</p>
              </div>
            </div>

            <div className="order-option-stack">
              {interiorOptions.map((option) => (
                <label key={option.id} className={`order-radio-card ${selectedInteriorId === option.id ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="interiorOption"
                    checked={selectedInteriorId === option.id}
                    onChange={() => setSelectedInteriorId(option.id)}
                  />
                  <div>
                    <h3>{option.label}</h3>
                    <p>{option.description}</p>
                  </div>
                  <strong>{option.price > 0 ? formatPrice(option.price) : '标准'}</strong>
                </label>
              ))}
            </div>
          </section>

          <section id="order-section-power" className="order-config-section">
            <div className="order-section-header">
              <p className="order-section-step">04</p>
              <div>
                <h2>动力</h2>
                <p>动力系统为必选项，请确认适合当前场景的方案。</p>
              </div>
            </div>

            <div className="order-option-stack">
              {powerOptions.map((option) => (
                <label key={option.id} className={`order-radio-card ${selectedPowerId === option.id ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="powerOption"
                    checked={selectedPowerId === option.id}
                    onChange={() => setSelectedPowerId(option.id)}
                  />
                  <div>
                    <h3>{option.label}</h3>
                    <p>{option.description}</p>
                  </div>
                  <strong>{formatPrice(option.price)}</strong>
                </label>
              ))}
            </div>
          </section>

          <section id="order-section-options" className="order-config-section">
            <div className="order-section-header">
              <p className="order-section-step">05</p>
              <div>
                <h2>选装</h2>
                <p>按需叠加智能、执法与娱乐相关扩展能力。</p>
              </div>
            </div>

            <div className="order-option-stack">
              {optionalSeriesOptions.map((option) => {
                const isDisabled = option.yachtOnly && activeCategory !== '游艇'
                const isActive = selectedOptionalIds.includes(option.id)

                return (
                  <label
                    key={option.id}
                    className={`order-check-card ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isActive}
                      disabled={isDisabled}
                      onChange={() => handleOptionalToggle(option.id)}
                    />
                    <div>
                      <h3>{option.label}</h3>
                      <p>{isDisabled ? '仅游艇分类可选' : option.description}</p>
                    </div>
                    <strong>{formatPrice(option.price)}</strong>
                  </label>
                )
              })}
            </div>
          </section>

          <section id="order-section-submit" className="order-summary-card">
            <p className="order-kicker">订单摘要</p>
            <h2>{activeModel?.label ?? '未选择船型'}</h2>

            <div className="order-summary-list">
              <div>
                <span>船型</span>
                <strong>{activeModel?.label ?? '-'}</strong>
              </div>
              <div>
                <span>外观</span>
                <strong>{activeAppearance.label}</strong>
              </div>
              <div>
                <span>内饰</span>
                <strong>{activeInterior.label}</strong>
              </div>
              <div>
                <span>动力</span>
                <strong>{activePower.label}</strong>
              </div>
              <div>
                <span>船体颜色</span>
                <strong>{activeColor.label}</strong>
              </div>
            </div>

            <div className="order-summary-packages">
              <p>已选选装</p>
              {activeOptionalSeries.length > 0 ? (
                activeOptionalSeries.map((item) => (
                  <div key={item.id} className="order-summary-package-item">
                    <span>{item.label}</span>
                    <strong>{formatPrice(item.price)}</strong>
                  </div>
                ))
              ) : (
                <span className="order-summary-empty">暂未选择选装项目</span>
              )}
            </div>

            <div className="order-total">
              <span>参考总价</span>
              <strong>{formatPrice(totalPrice)}</strong>
            </div>

            <div className="order-actions">
              <a className="btn primary" href="#/order-success">提交订购意向</a>
              <a className="mini-btn order-secondary-btn" href="#experience">返回 3D 体验</a>
            </div>
          </section>
        </section>
      </main>
    </div>
  )
}
