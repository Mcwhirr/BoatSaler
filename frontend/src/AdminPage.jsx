import { useEffect, useMemo, useState } from 'react'

const ADMIN_API_ORIGIN_STORAGE_KEY = 'salesboat.admin-api-origin'
const DEFAULT_ADMIN_API_ORIGIN = ''
const DEFAULT_ADMIN_EMAIL = 'smartpastaguy@hotmail.com'

const EMPTY_PASSWORD_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
}

const EMPTY_VIDEO_FORM = {
  id: '',
  title: '',
  url: '',
  summary: ''
}

const EMPTY_UPLOAD_FORM = {
  modelId: '',
  subdir: '',
  replaceExisting: true
}

const EMPTY_SALES_STATE = {
  updatedAt: '',
  newOrderCount: 0,
  orders: []
}

const EMPTY_MODEL_SPECS = {
  overallLength: '',
  waterlineLength: '',
  beam: '',
  depth: '',
  draft: '',
  navigationArea: '',
  mainEnginePower: '',
  designSpeed: '',
  ratedCapacity: '',
  powerType: '',
  material: '',
  certificateType: ''
}

const ENGINE_TYPE_OPTIONS = [
  { value: 'outboard-a', label: '马达 A' },
  { value: 'outboard-b', label: '马达 B' }
]

const EMPTY_ENGINE_MOUNT = {
  enabled: false,
  type: 'outboard-a',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }
}

const EMPTY_ENGINE_MOUNTS = Array.from({ length: 4 }, () => ({
  ...EMPTY_ENGINE_MOUNT,
  position: { ...EMPTY_ENGINE_MOUNT.position },
  rotation: { ...EMPTY_ENGINE_MOUNT.rotation }
}))

const DEFAULT_UV_SET_RENDER_PROFILE = {
  alphaMode: '',
  side: '',
  depthWrite: '',
  depthTest: '',
  alphaCutoff: '',
  renderOrder: ''
}

const MODEL_TYPE_OPTIONS = ['新能源船', '应急救援船', '公务执法艇', '游艇']
const ORDER_STATUS_OPTIONS = [
  { value: 'new', label: '新提交' },
  { value: 'following', label: '跟进中' },
  { value: 'completed', label: '已完成' }
]

const TEXTURE_TYPE_OPTIONS = [
  { value: '', label: '自动识别' },
  { value: 'baseColor', label: 'BaseColor' },
  { value: 'emissive', label: 'Emissive' },
  { value: 'normal', label: 'Normal' },
  { value: 'ao', label: 'AO' },
  { value: 'metalness', label: 'Metalness' },
  { value: 'roughness', label: 'Roughness' },
  { value: 'orm', label: 'ORM 复合贴图' },
  { value: 'opacity', label: 'Opacity' },
  { value: 'none', label: '不作为贴图' }
]

const TEXTURE_TYPE_LABELS = {
  baseColor: 'BaseColor',
  emissive: 'Emissive',
  normal: 'Normal',
  ao: 'AO',
  metalness: 'Metalness',
  roughness: 'Roughness',
  orm: 'ORM 复合贴图',
  opacity: 'Opacity',
  none: '不作为贴图'
}

const MODEL_SPEC_FIELDS = [
  { key: 'overallLength', label: '总长', placeholder: '例如 15.80' },
  { key: 'waterlineLength', label: '水线长', placeholder: '例如 15.10' },
  { key: 'beam', label: '船宽', placeholder: '例如 3.50' },
  { key: 'depth', label: '型深', placeholder: '例如 1.20' },
  { key: 'draft', label: '吃水', placeholder: '例如 0.50' },
  { key: 'navigationArea', label: '航区', placeholder: '例如 内河 B 级' },
  { key: 'mainEnginePower', label: '主机功率', placeholder: '例如 2 x 150 HP' },
  { key: 'designSpeed', label: '设计航速', placeholder: '例如 42' },
  { key: 'ratedCapacity', label: '额定乘员', placeholder: '例如 12' },
  { key: 'powerType', label: '动力形式', placeholder: '例如 双船外机' },
  { key: 'material', label: '材质', placeholder: '例如 铝合金' },
  { key: 'certificateType', label: '证书类型', placeholder: '例如 CCS' }
]

const PREVIEW_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function normalizeApiOrigin(value) {
  const trimmed = `${value ?? ''}`.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/\/+$/, '')
}

function buildApiUrl(apiOrigin, path) {
  if (!apiOrigin) {
    return path
  }

  return `${apiOrigin}${path}`
}

async function requestJson(path, options = {}, apiOrigin = '') {
  const response = await fetch(buildApiUrl(apiOrigin, path), {
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {})
    },
    ...options
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return payload
}

function normalizeMaterialHintInput(value) {
  return `${value ?? ''}`.trim()
}

function normalizeUvSetRenderProfileInput(value = {}) {
  const alphaCutoffValue = value?.alphaCutoff
  const renderOrderValue = value?.renderOrder
  return {
    alphaMode: `${value?.alphaMode ?? ''}`.trim(),
    side: `${value?.side ?? ''}`.trim(),
    depthWrite: `${value?.depthWrite ?? ''}`.trim(),
    depthTest: `${value?.depthTest ?? ''}`.trim(),
    alphaCutoff:
      alphaCutoffValue === '' || alphaCutoffValue === null || alphaCutoffValue === undefined
        ? ''
        : Number(alphaCutoffValue),
    renderOrder:
      renderOrderValue === '' || renderOrderValue === null || renderOrderValue === undefined
        ? ''
        : Number(renderOrderValue)
  }
}

function buildUvSetRenderProfilePayload(value = {}) {
  const normalized = normalizeUvSetRenderProfileInput(value)
  return {
    alphaMode: normalized.alphaMode,
    side: normalized.side,
    depthWrite: normalized.depthWrite,
    depthTest: normalized.depthTest,
    alphaCutoff:
      normalized.alphaCutoff === '' || !Number.isFinite(normalized.alphaCutoff)
        ? 0
        : Math.max(0, normalized.alphaCutoff),
    renderOrder:
      normalized.renderOrder === '' || !Number.isFinite(normalized.renderOrder)
        ? null
        : Math.trunc(Math.max(-1000, Math.min(1000, normalized.renderOrder)))
  }
}

function formatBytes(value) {
  const amount = Number(value) || 0
  if (amount <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let current = amount
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  const decimals = current >= 10 || unitIndex === 0 ? 0 : 1
  return `${current.toFixed(decimals)} ${units[unitIndex]}`
}

function formatNumber(value, fractionDigits = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0'
  }

  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits
  }).format(numeric)
}

function formatDateTime(value) {
  if (!value) {
    return '未记录'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function normalizeMaterialName(value) {
  if (!value) {
    return ''
  }

  return `${value}`
    .toLowerCase()
    .replace(/^m[_\s-]*/, '')
    .replace(/[^a-z0-9]+/g, '')
}

function inferMaterialNameHintFromFileName(fileName = '') {
  const match = `${fileName}`.match(/_(\d{2})\s-\sDefault/i)
  if (!match) {
    return ''
  }

  return `M_${match[1]}___Default`
}

function inferMaterialNameHintFromUvSet(uvSet) {
  const directHint = `${uvSet?.materialNameHint ?? ''}`.trim()
  if (directHint) {
    return directHint
  }

  const files = Array.isArray(uvSet?.files) ? uvSet.files : []
  for (const file of files) {
    const inferredHint = inferMaterialNameHintFromFileName(file?.name ?? file?.relativePath ?? '')
    if (inferredHint) {
      return inferredHint
    }
  }

  return ''
}

function buildRuntimeMaterialSlotSuggestions(model) {
  const runtimeSlots = Array.isArray(model?.runtime?.materialSlots) ? model.runtime.materialSlots : []
  const uvSets = Array.isArray(model?.uvSets) ? model.uvSets : []

  return runtimeSlots.map((slot) => {
    const normalizedSlotName = `${slot?.normalizedName ?? ''}`.trim() || normalizeMaterialName(slot?.name)
    const matchedUvSet =
      uvSets.find((uvSet) => {
        const hint = inferMaterialNameHintFromUvSet(uvSet)
        if (hint && normalizeMaterialName(hint) === normalizedSlotName) {
          return true
        }

        return normalizeMaterialName(uvSet?.id) === normalizedSlotName
      }) ?? null

    const matchedUvSetFileCount = Array.isArray(matchedUvSet?.files) ? matchedUvSet.files.length : 0

    return {
      ...slot,
      suggestedSubdir: matchedUvSet?.directoryPath ?? matchedUvSet?.id ?? '',
      matchedUvSetId: matchedUvSet?.id ?? '',
      matchedUvSetFileCount
    }
  })
}

function formatMaterialHintSource(value) {
  switch (`${value ?? ''}`.trim()) {
    case 'manual':
      return '手动绑定'
    case 'manual-runtime':
    case 'manual-runtime-single':
      return '手动绑定，已按运行时材质槽校准'
    case 'inferred':
      return '根据文件名自动推断'
    case 'runtime':
    case 'runtime-single':
      return '按运行时材质槽自动校准'
    case 'preset':
      return '模型预设'
    case 'manifest':
      return '资源清单绑定'
    default:
      return '尚未绑定'
  }
}

function isPreviewImageFile(fileName = '') {
  const extension = fileName.slice(Math.max(0, fileName.lastIndexOf('.'))).toLowerCase()
  return PREVIEW_IMAGE_EXTENSIONS.has(extension)
}

function buildModelDetailImageOptions(model) {
  if (!model) {
    return []
  }

  const options = []
  const seen = new Set()

  const appendFile = (path, file) => {
    const normalizedPath = `${path ?? ''}`.trim()
    if (!normalizedPath || seen.has(normalizedPath) || !isPreviewImageFile(file?.name ?? normalizedPath)) {
      return
    }

    seen.add(normalizedPath)
    options.push({
      value: normalizedPath,
      label: normalizedPath,
      size: file?.size ?? 0
    })
  }

  ;(model.files ?? []).forEach((file) => {
    appendFile(file.relativePath, file)
  })

  ;(model.uvSets ?? []).forEach((uvSet) => {
    ;(uvSet.files ?? []).forEach((file) => {
      appendFile(`${uvSet.id}/${file.relativePath}`, file)
    })
  })

  options.sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
  return options
}

function buildModelDetailImageUrl(apiOrigin, modelId, relativePath) {
  if (!modelId || !relativePath) {
    return ''
  }

  const encodedPath = `${relativePath}`
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return buildApiUrl(apiOrigin, `/gltf/${encodeURIComponent(modelId)}/${encodedPath}`)
}

function cloneEngineMounts(sourceEngines) {
  const engineList = Array.isArray(sourceEngines) ? sourceEngines : []
  return EMPTY_ENGINE_MOUNTS.map((defaultEngine, index) => {
    const engine = engineList[index] ?? {}
    return {
      enabled: Boolean(engine.enabled),
      type: `${engine.type ?? defaultEngine.type}`.trim() || defaultEngine.type,
      position: {
        x: Number(engine.position?.x ?? defaultEngine.position.x) || 0,
        y: Number(engine.position?.y ?? defaultEngine.position.y) || 0,
        z: Number(engine.position?.z ?? defaultEngine.position.z) || 0
      },
      rotation: {
        x: Number(engine.rotation?.x ?? defaultEngine.rotation.x) || 0,
        y: Number(engine.rotation?.y ?? defaultEngine.rotation.y) || 0,
        z: Number(engine.rotation?.z ?? defaultEngine.rotation.z) || 0
      }
    }
  })
}

function cloneModelContentForm(model) {
  return {
    modelId: model?.id ?? '',
    displayName: model?.displayName ?? '',
    type: model?.type ?? '',
    price: model?.price ?? '',
    detailImagePath: model?.detailImagePath ?? '',
    summary: model?.summary ?? '',
    engines: cloneEngineMounts(model?.engines),
    specs: {
      ...EMPTY_MODEL_SPECS,
      ...(model?.specs ?? {})
    }
  }
}

function getTextureTypeLabel(value) {
  if (!value) {
    return '自动识别'
  }

  return TEXTURE_TYPE_LABELS[value] ?? value
}

function getTextureTypeOptionLabel(optionValue, file) {
  if (optionValue !== '') {
    return getTextureTypeLabel(optionValue)
  }

  const detectedLabel = getTextureTypeLabel(file?.detectedTextureType)
  return file?.detectedTextureType
    ? `自动识别（当前识别为 ${detectedLabel}）`
    : '自动识别（当前未识别出通道）'
}

function flattenModelFiles(model) {
  if (!model) {
    return []
  }

  const rootFiles = (model.files ?? []).map((file) => ({
    ...file,
    sectionLabel: '根目录',
    relativePathForRequest: file.relativePath
  }))

  const uvFiles = (model.uvSets ?? []).flatMap((uvSet) =>
    (uvSet.files ?? []).map((file) => ({
      ...file,
      sectionLabel: `UV/${uvSet.id}`,
      relativePathForRequest: `${uvSet.id}/${file.relativePath}`
    }))
  )

  return [...rootFiles, ...uvFiles]
}

function buildInventorySummary(model) {
  if (!model) {
    return '请选择一个模型以查看资源与贴图状态。'
  }

  const runtime = model.runtime
  const materialSlotCount = Array.isArray(runtime?.materialSlots) ? runtime.materialSlots.length : 0
  const uvSetCount = Array.isArray(model.uvSets) ? model.uvSets.length : 0

  return `当前模型共 ${model.fileCount ?? 0} 个文件，${uvSetCount} 个 UV 目录，${materialSlotCount} 个材质槽。`
}

function defaultRouteKey(isAuthenticated) {
  return isAuthenticated ? 'models' : 'login'
}

function getStatusMeta(status) {
  return ORDER_STATUS_OPTIONS.find((option) => option.value === status) ?? ORDER_STATUS_OPTIONS[0]
}

function getOrderStatusCounts(orders) {
  return orders.reduce(
    (result, order) => {
      const nextKey = ['new', 'following', 'completed'].includes(order.status) ? order.status : 'new'
      result[nextKey] += 1
      return result
    },
    { new: 0, following: 0, completed: 0 }
  )
}

function AdminLogin({ apiOrigin, apiOriginInput, setApiOriginInput, onSaveApiOrigin, loginForm, setLoginForm, onLogin, isSubmitting, notice }) {
  return (
    <div className="admin-auth-shell">
      <section className="admin-auth-card">
        <header className="admin-auth-header">
          <p className="admin-kicker">Admin Console</p>
          <h1>京穗船舶后台管理</h1>
          <p className="admin-auth-copy">
            这里是完整的模型上传与贴图应用入口。登录后可以上传模型、查看材质槽、标记贴图通道、同步资源并检查订单。
          </p>
        </header>

        <form
          className="admin-auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            onLogin()
          }}
        >
          <label className="admin-field">
            <span>管理员邮箱</span>
            <input
              className="admin-input"
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
              placeholder={DEFAULT_ADMIN_EMAIL}
              autoComplete="username"
            />
          </label>

          <label className="admin-field">
            <span>密码</span>
            <input
              className="admin-input"
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="请输入后台密码"
              autoComplete="current-password"
            />
          </label>

          <div className="admin-actions">
            <button type="submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? '登录中...' : '登录后台'}
            </button>
          </div>
        </form>

        <form
          className="admin-auth-form admin-auth-form-secondary"
          onSubmit={(event) => {
            event.preventDefault()
            onSaveApiOrigin()
          }}
        >
          <label className="admin-field">
            <span>API 地址覆盖</span>
            <input
              className="admin-input"
              value={apiOriginInput}
              onChange={(event) => setApiOriginInput(event.target.value)}
              placeholder="例如 http://1.14.77.78:8080"
            />
          </label>
          <p className="admin-auth-note">
            当前请求地址：{apiOrigin || '跟随当前站点'}。如果前台和后端不在同一域名，可以在这里切换。
          </p>
          <div className="admin-actions">
            <button type="submit" className="mini-btn">
              保存接口地址
            </button>
          </div>
        </form>

        {notice && (
          <section className={`admin-notice ${notice.tone}`}>
            <p>{notice.message}</p>
          </section>
        )}
      </section>
    </div>
  )
}

export default function AdminPage() {
  const [apiOrigin, setApiOrigin] = useState(DEFAULT_ADMIN_API_ORIGIN)
  const [apiOriginInput, setApiOriginInput] = useState(DEFAULT_ADMIN_API_ORIGIN)
  const [authState, setAuthState] = useState({ authenticated: false, user: null })
  const [dashboard, setDashboard] = useState(null)
  const [salesState, setSalesState] = useState(EMPTY_SALES_STATE)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)
  const [activeSection, setActiveSection] = useState('login')

  const [loginForm, setLoginForm] = useState({
    email: DEFAULT_ADMIN_EMAIL,
    password: ''
  })
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM)
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD_FORM)
  const [uploadFiles, setUploadFiles] = useState([])
  const [inventoryFiles, setInventoryFiles] = useState([])
  const [isUploadingModel, setIsUploadingModel] = useState(false)
  const [isUploadingInventory, setIsUploadingInventory] = useState(false)

  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedInventoryModelId, setSelectedInventoryModelId] = useState('')
  const [inventorySubdir, setInventorySubdir] = useState('')

  const [modelContentForm, setModelContentForm] = useState(null)
  const [inventoryEngineForm, setInventoryEngineForm] = useState([])
  const [isSavingModelContent, setIsSavingModelContent] = useState(false)
  const [isSavingInventoryEngines, setIsSavingInventoryEngines] = useState(false)
  const [isSyncingAssets, setIsSyncingAssets] = useState(false)
  const [isDeletingModelId, setIsDeletingModelId] = useState('')
  const [isDeletingFileKey, setIsDeletingFileKey] = useState('')
  const [textureUpdateKey, setTextureUpdateKey] = useState('')
  const [uvSetUpdateKey, setUvSetUpdateKey] = useState('')

  const [videoForm, setVideoForm] = useState(EMPTY_VIDEO_FORM)
  const [isSavingVideo, setIsSavingVideo] = useState(false)
  const [isDeletingVideoId, setIsDeletingVideoId] = useState('')
  const [updatingOrderId, setUpdatingOrderId] = useState('')

  const models = dashboard?.models ?? []
  const siteContent = dashboard?.content ?? { videos: [] }
  const videos = siteContent.videos ?? []

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId) ?? null, [models, selectedModelId])
  const selectedInventoryModel = useMemo(
    () => models.find((model) => model.id === selectedInventoryModelId) ?? null,
    [models, selectedInventoryModelId]
  )
  const selectedInventoryFiles = useMemo(() => flattenModelFiles(selectedInventoryModel), [selectedInventoryModel])
  const materialSlots = useMemo(() => buildRuntimeMaterialSlotSuggestions(selectedInventoryModel), [selectedInventoryModel])
  const detailImageOptions = useMemo(() => buildModelDetailImageOptions(selectedModel), [selectedModel])

  const inventorySummary = useMemo(() => buildInventorySummary(selectedInventoryModel), [selectedInventoryModel])
  const modelTotals = useMemo(() => {
    return models.reduce(
      (result, model) => {
        result.fileCount += model.fileCount ?? 0
        result.totalBytes += model.totalBytes ?? 0
        return result
      },
      { fileCount: 0, totalBytes: 0 }
    )
  }, [models])

  const orderStatusCounts = useMemo(() => getOrderStatusCounts(salesState.orders ?? []), [salesState.orders])

  useEffect(() => {
    const storedOrigin = normalizeApiOrigin(window.localStorage.getItem(ADMIN_API_ORIGIN_STORAGE_KEY) ?? '')
    setApiOrigin(storedOrigin)
    setApiOriginInput(storedOrigin)
  }, [])

  useEffect(() => {
    if (!authState.authenticated) {
      setActiveSection('login')
      return
    }

    setActiveSection((current) => (current === 'login' ? 'models' : current))
  }, [authState.authenticated])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setIsBootstrapping(true)
      try {
        const payload = await requestJson('/api/admin/auth/status', {}, apiOrigin)
        if (cancelled) {
          return
        }

        setAuthState({
          authenticated: Boolean(payload?.authenticated),
          user: payload?.user ?? null
        })

        if (payload?.authenticated) {
          await Promise.all([loadDashboard(apiOrigin), loadOrders(apiOrigin)])
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({ tone: 'error', message: error.message })
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false)
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [apiOrigin])

  useEffect(() => {
    if (!models.length) {
      setSelectedModelId('')
      setSelectedInventoryModelId('')
      setModelContentForm(null)
      return
    }

    setSelectedModelId((current) => {
      const nextId = current && models.some((model) => model.id === current) ? current : models[0].id
      return nextId
    })

    setSelectedInventoryModelId((current) => {
      const nextId = current && models.some((model) => model.id === current) ? current : models[0].id
      return nextId
    })
  }, [models])

  useEffect(() => {
    if (!selectedModel) {
      setModelContentForm(null)
      return
    }

    setModelContentForm(cloneModelContentForm(selectedModel))
  }, [selectedModel])

  useEffect(() => {
    if (!selectedInventoryModel) {
      setInventoryEngineForm([])
      return
    }

    setInventoryEngineForm(cloneEngineMounts(selectedInventoryModel.engines))
  }, [selectedInventoryModel])

  function setSuccess(message) {
    setNotice({ tone: 'success', message })
  }

  function setError(message) {
    setNotice({ tone: 'error', message })
  }

  function applyDashboardState(nextDashboard, successMessage = '') {
    setDashboard(nextDashboard)
    if (successMessage) {
      setSuccess(successMessage)
    }
  }

  async function loadDashboard(origin = apiOrigin, options = {}) {
    setIsLoadingDashboard(true)
    try {
      const payload = await requestJson('/api/admin/models', {}, origin)
      applyDashboardState(payload, options.successMessage ?? '')
      return payload
    } catch (error) {
      setError(error.message)
      throw error
    } finally {
      setIsLoadingDashboard(false)
    }
  }

  async function loadOrders(origin = apiOrigin, options = {}) {
    setIsLoadingOrders(true)
    try {
      const payload = await requestJson('/api/admin/orders', {}, origin)
      setSalesState({
        updatedAt: payload?.updatedAt ?? '',
        newOrderCount: Number(payload?.newOrderCount) || 0,
        orders: Array.isArray(payload?.orders) ? payload.orders : []
      })
      if (options.successMessage) {
        setSuccess(options.successMessage)
      }
      return payload
    } catch (error) {
      setError(error.message)
      throw error
    } finally {
      setIsLoadingOrders(false)
    }
  }

  async function refreshAll(successMessage = '') {
    await Promise.all([loadDashboard(apiOrigin, { successMessage }), loadOrders(apiOrigin)])
  }

  function saveApiOrigin() {
    const normalized = normalizeApiOrigin(apiOriginInput)
    window.localStorage.setItem(ADMIN_API_ORIGIN_STORAGE_KEY, normalized)
    setApiOrigin(normalized)
    setSuccess(normalized ? `已切换后台接口地址：${normalized}` : '已恢复为当前站点接口地址')
  }

  async function handleLogin() {
    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setError('请输入管理员邮箱和密码。')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = await requestJson(
        '/api/admin/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: loginForm.email.trim(),
            password: loginForm.password
          })
        },
        apiOrigin
      )

      setAuthState({
        authenticated: true,
        user: payload?.user ?? { email: loginForm.email.trim() }
      })
      setLoginForm((current) => ({ ...current, password: '' }))
      setSuccess(payload?.message ?? '登录成功')
      await Promise.all([loadDashboard(apiOrigin), loadOrders(apiOrigin)])
      setActiveSection('models')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLogout() {
    setIsSubmitting(true)
    try {
      const payload = await requestJson('/api/admin/auth/logout', { method: 'POST' }, apiOrigin)
      setAuthState({ authenticated: false, user: null })
      setDashboard(null)
      setSalesState(EMPTY_SALES_STATE)
      setSuccess(payload?.message ?? '已退出登录')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleChangePassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError('请完整填写密码表单。')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致。')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = await requestJson(
        '/api/admin/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            newPassword: passwordForm.newPassword
          })
        },
        apiOrigin
      )

      setPasswordForm(EMPTY_PASSWORD_FORM)
      setSuccess(payload?.message ?? '密码已更新')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUploadModel() {
    if (!uploadForm.modelId.trim()) {
      setError('请先填写模型目录名。')
      return
    }

    if (!uploadFiles.length) {
      setError('请选择至少一个模型文件或贴图文件。')
      return
    }

    const body = new FormData()
    body.append('modelId', uploadForm.modelId.trim())
    body.append('subdir', uploadForm.subdir.trim())
    body.append('replace', uploadForm.replaceExisting ? 'true' : 'false')
    uploadFiles.forEach((file) => {
      body.append('files', file)
    })

    setIsUploadingModel(true)
    try {
      const payload = await requestJson(
        '/api/admin/models/upload',
        {
          method: 'POST',
          body
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '模型资源已上传')
      setUploadFiles([])
      setUploadForm((current) => ({
        ...current,
        subdir: ''
      }))
      setSelectedModelId(uploadForm.modelId.trim())
      setSelectedInventoryModelId(uploadForm.modelId.trim())
      await loadOrders(apiOrigin)
    } catch (error) {
      setError(error.message)
    } finally {
      setIsUploadingModel(false)
    }
  }

  async function handleUploadInventoryFiles() {
    if (!selectedInventoryModel) {
      setError('请先选择一个模型。')
      return
    }

    if (!inventoryFiles.length) {
      setError('请先选择需要上传的贴图文件。')
      return
    }

    const body = new FormData()
    body.append('modelId', selectedInventoryModel.id)
    body.append('subdir', inventorySubdir.trim())
    body.append('replace', 'true')
    inventoryFiles.forEach((file) => {
      body.append('files', file)
    })

    setIsUploadingInventory(true)
    try {
      const payload = await requestJson(
        '/api/admin/models/upload',
        {
          method: 'POST',
          body
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '贴图资源已上传')
      setInventoryFiles([])
    } catch (error) {
      setError(error.message)
    } finally {
      setIsUploadingInventory(false)
    }
  }

  async function handleSaveModelContent() {
    if (!modelContentForm?.modelId) {
      setError('当前没有可保存的模型。')
      return
    }

    setIsSavingModelContent(true)
    try {
      const payload = await requestJson(
        `/api/admin/models/${encodeURIComponent(modelContentForm.modelId)}/content`,
        {
          method: 'PUT',
          body: JSON.stringify({
            displayName: modelContentForm.displayName,
            type: modelContentForm.type,
            price: modelContentForm.price,
            detailImagePath: modelContentForm.detailImagePath,
            summary: modelContentForm.summary,
            engines: modelContentForm.engines,
            specs: modelContentForm.specs
          })
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '模型内容已保存')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSavingModelContent(false)
    }
  }

  async function handleSaveInventoryEngines() {
    if (!selectedInventoryModel?.id) {
      setError('请先在资源清单中选择需要配置马达的船型。')
      return
    }

    setIsSavingInventoryEngines(true)
    try {
      const payload = await requestJson(
        `/api/admin/models/${encodeURIComponent(selectedInventoryModel.id)}/engines`,
        {
          method: 'PUT',
          body: JSON.stringify({
            engines: inventoryEngineForm
          })
        },
        apiOrigin
      )

      applyDashboardState(
        payload?.state ?? dashboard,
        payload?.message ?? `已更新 ${selectedInventoryModel.displayName || selectedInventoryModel.id} 的马达挂载配置`
      )
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSavingInventoryEngines(false)
    }
  }

  async function handleDeleteModel(modelId) {
    if (!window.confirm(`确认删除模型 ${modelId} 及其全部资源吗？`)) {
      return
    }

    setIsDeletingModelId(modelId)
    try {
      const payload = await requestJson(
        `/api/admin/models/${encodeURIComponent(modelId)}`,
        {
          method: 'DELETE'
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? `已删除模型 ${modelId}`)
    } catch (error) {
      setError(error.message)
    } finally {
      setIsDeletingModelId('')
    }
  }

  async function handleDeleteFile(modelId, relativePathForRequest) {
    if (!window.confirm(`确认删除文件 ${relativePathForRequest} 吗？`)) {
      return
    }

    const fileKey = `${modelId}:${relativePathForRequest}`
    setIsDeletingFileKey(fileKey)
    try {
      const payload = await requestJson(
        `/api/admin/models/${encodeURIComponent(modelId)}/files?path=${encodeURIComponent(relativePathForRequest)}`,
        {
          method: 'DELETE'
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '文件已删除')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsDeletingFileKey('')
    }
  }

  async function handleUpdateTextureType(modelId, relativePathForRequest, textureType, useAlphaAsOpacity) {
    const updateKey = `${modelId}:${relativePathForRequest}`
    setTextureUpdateKey(updateKey)
    try {
      const payload = await requestJson(
        '/api/admin/file-texture-type',
        {
          method: 'POST',
          body: JSON.stringify({
            modelId,
            path: relativePathForRequest,
            textureType,
            useAlphaAsOpacity
          })
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '贴图标记已更新')
    } catch (error) {
      setError(error.message)
    } finally {
      setTextureUpdateKey('')
    }
  }

  async function handleUpdateUvSetMaterialHint(modelId, relativePathForRequest, materialNameHint) {
    const updateKey = `${modelId}:${relativePathForRequest}:material-hint`
    setUvSetUpdateKey(updateKey)
    try {
      const uvSet = (selectedInventoryModel?.uvSets ?? []).find((item) => {
        const directoryPath = `${item?.directoryPath || item?.id || ''}`.trim()
        return directoryPath === `${relativePathForRequest}`.trim()
      })

      const payload = await requestJson(
        '/api/admin/uv-set-material-hint',
        {
          method: 'POST',
          body: JSON.stringify({
            modelId,
            path: relativePathForRequest,
            materialNameHint: normalizeMaterialHintInput(materialNameHint),
            renderProfile: buildUvSetRenderProfilePayload(uvSet?.renderProfile)
          })
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '材质槽绑定已更新')
    } catch (error) {
      setError(error.message)
    } finally {
      setUvSetUpdateKey('')
    }
  }

  async function handleUpdateUvSetRenderProfile(modelId, relativePathForRequest, renderProfile) {
    const updateKey = `${modelId}:${relativePathForRequest}:render-profile`
    setUvSetUpdateKey(updateKey)
    try {
      const uvSet = (selectedInventoryModel?.uvSets ?? []).find((item) => {
        const directoryPath = `${item?.directoryPath || item?.id || ''}`.trim()
        return directoryPath === `${relativePathForRequest}`.trim()
      })

      const payload = await requestJson(
        '/api/admin/uv-set-material-hint',
        {
          method: 'POST',
          body: JSON.stringify({
            modelId,
            path: relativePathForRequest,
            materialNameHint: normalizeMaterialHintInput(uvSet?.materialNameHint),
            renderProfile: buildUvSetRenderProfilePayload(renderProfile)
          })
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? 'UV 渲染规则已更新')
    } catch (error) {
      setError(error.message)
    } finally {
      setUvSetUpdateKey('')
    }
  }

  async function handleSyncAssets() {
    setIsSyncingAssets(true)
    try {
      const payload = await requestJson('/api/admin/sync', { method: 'POST' }, apiOrigin)
      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '资源已同步')
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSyncingAssets(false)
    }
  }

  async function handleSaveVideo() {
    if (!videoForm.title.trim() || !videoForm.url.trim()) {
      setError('请先填写视频标题和视频链接。')
      return
    }

    setIsSavingVideo(true)
    try {
      const path = videoForm.id
        ? `/api/admin/videos/${encodeURIComponent(videoForm.id)}`
        : '/api/admin/videos'
      const method = videoForm.id ? 'PUT' : 'POST'
      const payload = await requestJson(
        path,
        {
          method,
          body: JSON.stringify({
            title: videoForm.title,
            url: videoForm.url,
            summary: videoForm.summary
          })
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '视频已保存')
      setVideoForm(EMPTY_VIDEO_FORM)
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSavingVideo(false)
    }
  }

  async function handleDeleteVideo(videoId) {
    if (!window.confirm('确认删除这条视频内容吗？')) {
      return
    }

    setIsDeletingVideoId(videoId)
    try {
      const payload = await requestJson(
        `/api/admin/videos/${encodeURIComponent(videoId)}`,
        {
          method: 'DELETE'
        },
        apiOrigin
      )

      applyDashboardState(payload?.state ?? dashboard, payload?.message ?? '视频已删除')
      if (videoForm.id === videoId) {
        setVideoForm(EMPTY_VIDEO_FORM)
      }
    } catch (error) {
      setError(error.message)
    } finally {
      setIsDeletingVideoId('')
    }
  }

  async function handleUpdateOrderStatus(orderId, status) {
    setUpdatingOrderId(orderId)
    try {
      await requestJson(
        `/api/admin/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status })
        },
        apiOrigin
      )

      await loadOrders(apiOrigin, { successMessage: `订单 ${orderId} 状态已更新` })
    } catch (error) {
      setError(error.message)
    } finally {
      setUpdatingOrderId('')
    }
  }

  function handleUseMaterialSlotSubdir(slot) {
    setInventorySubdir(slot?.suggestedSubdir ?? '')
    setSuccess(slot?.suggestedSubdir ? `已切换上传目录到 ${slot.suggestedSubdir}` : '当前材质槽尚未匹配到目录，可自行填写。')
  }

  function renderFileList(modelId, files, prefix = '') {
    if (!files?.length) {
      return <p className="admin-empty">当前目录暂无文件。</p>
    }

    return (
      <ul className="admin-file-list">
        {files.map((file) => {
          const relativePathForRequest = prefix ? `${prefix}/${file.relativePath}` : file.relativePath
          const updateKey = `${modelId}:${relativePathForRequest}`
          const selectedTextureType = file.textureAssignment === 'none' ? 'none' : file.textureAssignment || ''
          const effectiveTextureType = file.textureType || file.detectedTextureType || ''
          const isTextureCandidate = Boolean(file.textureCandidate)
          const textureTypeForAlphaToggle =
            selectedTextureType && selectedTextureType !== 'none' ? selectedTextureType : effectiveTextureType
          const shouldShowAlphaToggle = textureTypeForAlphaToggle === 'baseColor'

          return (
            <li key={updateKey} className="admin-file-item">
              <div className="admin-file-copy">
                <p className="admin-file-name">{file.relativePath}</p>
                <p className="admin-file-meta">
                  {formatBytes(file.size)} | {file.extension || '无扩展名'} | {file.supported ? '已收录' : '未收录'}
                </p>
                {isTextureCandidate && (
                  <p className="admin-file-channel-guide">
                    检测结果：{getTextureTypeLabel(file.detectedTextureType)} | 当前生效：{getTextureTypeLabel(effectiveTextureType)}
                    {file.useAlphaAsOpacity ? ' | 已读取 Alpha 作为透明度' : ''}
                  </p>
                )}
              </div>

              <div className="admin-file-controls">
                {isTextureCandidate ? (
                  <>
                    <label className="admin-file-select-wrap">
                      <span className="admin-file-select-label">贴图类型</span>
                      <select
                        className="admin-input admin-file-select"
                        value={selectedTextureType}
                        onChange={(event) =>
                          handleUpdateTextureType(modelId, relativePathForRequest, event.target.value, file.useAlphaAsOpacity)
                        }
                        disabled={textureUpdateKey === updateKey}
                      >
                        {TEXTURE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value || 'auto'} value={option.value}>
                            {getTextureTypeOptionLabel(option.value, file)}
                          </option>
                        ))}
                      </select>
                    </label>

                    {shouldShowAlphaToggle ? (
                      <label className="admin-checkbox admin-file-alpha-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(file.useAlphaAsOpacity)}
                        onChange={(event) =>
                          handleUpdateTextureType(
                            modelId,
                            relativePathForRequest,
                            selectedTextureType,
                            event.target.checked
                          )
                        }
                        disabled={textureUpdateKey === updateKey || selectedTextureType === 'none'}
                      />
                      <span>读取 BaseColor 的 Alpha 作为透明度</span>
                      </label>
                    ) : null}
                  </>
                ) : (
                  <p className="admin-inline-note">当前文件不是贴图候选，无需标记通道。</p>
                )}

                <button
                  type="button"
                  className="admin-file-delete"
                  onClick={() => handleDeleteFile(modelId, relativePathForRequest)}
                  disabled={isDeletingFileKey === updateKey}
                >
                  {isDeletingFileKey === updateKey ? '删除中...' : '删除文件'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  if (isBootstrapping) {
    return (
      <div className="admin-auth-shell">
        <section className="admin-auth-card">
          <header className="admin-auth-header">
            <p className="admin-kicker">Admin Console</p>
            <h1>正在初始化后台</h1>
            <p className="admin-auth-copy">正在检查管理员会话并加载模型资源清单，请稍候。</p>
          </header>
        </section>
      </div>
    )
  }

  if (!authState.authenticated) {
    return (
      <AdminLogin
        apiOrigin={apiOrigin}
        apiOriginInput={apiOriginInput}
        setApiOriginInput={setApiOriginInput}
        onSaveApiOrigin={saveApiOrigin}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        onLogin={handleLogin}
        isSubmitting={isSubmitting}
        notice={notice}
      />
    )
  }

  const overviewStats = [
    { key: 'models', label: '模型数量', value: formatNumber(models.length) },
    { key: 'files', label: '资源文件', value: formatNumber(modelTotals.fileCount) },
    { key: 'size', label: '总容量', value: formatBytes(modelTotals.totalBytes) },
    { key: 'orders', label: '订单数量', value: formatNumber(salesState.orders?.length ?? 0) },
    { key: 'newOrders', label: '待跟进订单', value: formatNumber(salesState.newOrderCount) }
  ]

  const navItems = [
    { key: 'models', label: '模型与内容' },
    { key: 'inventory', label: '资源清单' },
    { key: 'orders', label: '订单管理', badge: salesState.newOrderCount },
    { key: 'videos', label: '视频内容' },
    { key: 'account', label: '账户设置' }
  ]

  return (
    <div className="admin-shell">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">
            <p className="admin-sidebar-kicker">SalesBoat Admin</p>
            <h1>京穗船舶后台</h1>
            <p>上传模型、检查材质槽、管理贴图通道、更新展示内容与订单状态。</p>
          </div>

          <div className="admin-sidebar-group">
            <p className="admin-sidebar-label">工作台</p>
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`admin-nav-button ${item.badge ? 'admin-nav-button-with-badge' : ''} ${
                  activeSection === item.key ? 'is-active' : ''
                }`}
                onClick={() => setActiveSection(item.key)}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="admin-nav-badge">{item.badge}</span> : null}
              </button>
            ))}
          </div>

          <div className="admin-sidebar-group">
            <p className="admin-sidebar-label">快捷操作</p>
            <button type="button" className="admin-sidebar-link" onClick={() => refreshAll('后台数据已刷新')} disabled={isLoadingDashboard || isLoadingOrders}>
              刷新后台数据
            </button>
            <button type="button" className="admin-sidebar-link" onClick={handleSyncAssets} disabled={isSyncingAssets}>
              {isSyncingAssets ? '同步中...' : '同步资源到前台/COS'}
            </button>
            <button type="button" className="admin-sidebar-link" onClick={handleLogout} disabled={isSubmitting}>
              退出登录
            </button>
          </div>
        </aside>

        <main className="admin-content">
          <header className="admin-page-header">
            <p className="admin-kicker">Control Center</p>
            <h2>上传链路与展示内容管理</h2>
            <p>
              当前管理员：{authState.user?.email ?? DEFAULT_ADMIN_EMAIL}。最近一次资源扫描时间为{' '}
              {formatDateTime(dashboard?.updatedAt)}，当前 API 地址为 {apiOrigin || '同源'}。
            </p>
          </header>

          <section className="admin-hero-grid">
            <article className="admin-hero-card">
              <div className="admin-hero-card-head">
                <div>
                  <p className="admin-panel-eyebrow">资源总览</p>
                  <h3>模型与静态资源</h3>
                </div>
                <strong>{formatNumber(models.length)}</strong>
              </div>
              <div className="admin-mini-bars">
                {overviewStats.slice(0, 4).map((stat, index) => {
                  const ratios = [models.length || 1, modelTotals.fileCount || 1, modelTotals.totalBytes / (1024 * 1024) || 1, salesState.orders?.length || 1]
                  const ratio = Math.max(18, Math.min(100, (ratios[index] / Math.max(...ratios)) * 100))
                  return (
                    <div key={stat.key} className="admin-mini-bar-item">
                      <span className="admin-mini-bar-value">{stat.value}</span>
                      <div className="admin-mini-bar-track">
                        <span style={{ height: `${ratio}%` }} />
                      </div>
                      <span className="admin-mini-bar-label">{stat.label}</span>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="admin-hero-card">
              <div className="admin-hero-card-head">
                <div>
                  <p className="admin-panel-eyebrow">订单状态</p>
                  <h3>销售跟进节奏</h3>
                </div>
                <strong>{formatNumber(salesState.newOrderCount)}</strong>
              </div>
              <div className="admin-order-chart-track" aria-hidden="true">
                <span className="new" style={{ width: `${Math.max(8, (orderStatusCounts.new / Math.max(1, salesState.orders.length)) * 100)}%` }} />
                <span className="following" style={{ width: `${Math.max(8, (orderStatusCounts.following / Math.max(1, salesState.orders.length)) * 100)}%` }} />
                <span className="completed" style={{ width: `${Math.max(8, (orderStatusCounts.completed / Math.max(1, salesState.orders.length)) * 100)}%` }} />
              </div>
              <div className="admin-order-chart-legend">
                <div className="admin-order-chart-item">
                  <span className="admin-order-chart-dot new" />
                  <span>新提交</span>
                  <strong>{formatNumber(orderStatusCounts.new)}</strong>
                </div>
                <div className="admin-order-chart-item">
                  <span className="admin-order-chart-dot following" />
                  <span>跟进中</span>
                  <strong>{formatNumber(orderStatusCounts.following)}</strong>
                </div>
                <div className="admin-order-chart-item">
                  <span className="admin-order-chart-dot completed" />
                  <span>已完成</span>
                  <strong>{formatNumber(orderStatusCounts.completed)}</strong>
                </div>
              </div>
            </article>
          </section>

          <section className="admin-stat-strip">
            {overviewStats.map((stat) => (
              <div key={stat.key} className="admin-stat-cell">
                <span className="admin-stat-label">{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </section>

          {activeSection === 'models' && (
            <section className="admin-section-grid">
              <section className="admin-section">
                <div className="admin-section-header">
                  <div>
                    <p className="admin-panel-eyebrow">Upload</p>
                    <h2>上传模型与整包资源</h2>
                  </div>
                  <p className="admin-panel-caption">支持直接上传 FBX、GLB、贴图与预览图，上传后会自动同步 manifest 与运行时选择信息。</p>
                </div>

                <form
                  className="admin-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleUploadModel()
                  }}
                >
                  <div className="admin-form-split">
                    <label className="admin-field">
                      <span>模型目录名</span>
                      <input
                        className="admin-input"
                        value={uploadForm.modelId}
                        onChange={(event) => setUploadForm((current) => ({ ...current, modelId: event.target.value }))}
                        placeholder="例如 40mijianchuan 或 FireFighting"
                      />
                    </label>

                    <label className="admin-field">
                      <span>子目录</span>
                      <input
                        className="admin-input"
                        value={uploadForm.subdir}
                        onChange={(event) => setUploadForm((current) => ({ ...current, subdir: event.target.value }))}
                        placeholder="留空表示上传到模型根目录"
                      />
                    </label>
                  </div>

                  <label className="admin-field">
                    <span>选择文件</span>
                    <input
                      className="admin-input admin-file-input"
                      type="file"
                      multiple
                      onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                    />
                  </label>

                  <label className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={uploadForm.replaceExisting}
                      onChange={(event) => setUploadForm((current) => ({ ...current, replaceExisting: event.target.checked }))}
                    />
                    <span>允许覆盖同名文件</span>
                  </label>

                  <p className="admin-helper">
                    {uploadFiles.length
                      ? `已选择 ${uploadFiles.length} 个文件，共 ${formatBytes(uploadFiles.reduce((sum, file) => sum + (file.size || 0), 0))}`
                      : '建议一次上传模型主体文件与对应贴图目录，上传后后台会自动重建资源清单。'}
                  </p>

                  <div className="admin-actions">
                    <button type="submit" className="btn primary" disabled={isUploadingModel}>
                      {isUploadingModel ? '上传中...' : '上传资源'}
                    </button>
                    <button type="button" className="mini-btn" onClick={handleSyncAssets} disabled={isSyncingAssets}>
                      {isSyncingAssets ? '同步中...' : '仅重新同步'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="admin-section">
                <div className="admin-section-header">
                  <div>
                    <p className="admin-panel-eyebrow">Content</p>
                    <h2>模型展示内容</h2>
                  </div>
                  <p className="admin-panel-caption">这里负责前台展示名称、类型、价格、参数、详情图和介绍文字。</p>
                </div>

                <div className="admin-form">
                  <label className="admin-field">
                    <span>选择模型</span>
                    <select
                      className="admin-input admin-select"
                      value={selectedModelId}
                      onChange={(event) => setSelectedModelId(event.target.value)}
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.displayName || model.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  {modelContentForm ? (
                    <>
                      <div className="admin-form-split">
                        <label className="admin-field">
                          <span>船只名称</span>
                          <input
                            className="admin-input"
                            value={modelContentForm.displayName}
                            onChange={(event) =>
                              setModelContentForm((current) => ({ ...current, displayName: event.target.value }))
                            }
                            placeholder="前台展示名称"
                          />
                        </label>

                        <label className="admin-field">
                          <span>船型</span>
                          <select
                            className="admin-input admin-select"
                            value={modelContentForm.type}
                            onChange={(event) =>
                              setModelContentForm((current) => ({ ...current, type: event.target.value }))
                            }
                          >
                            <option value="">请选择</option>
                            {MODEL_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="admin-field">
                        <span>价格</span>
                        <input
                          className="admin-input"
                          value={modelContentForm.price}
                          onChange={(event) =>
                            setModelContentForm((current) => ({ ...current, price: event.target.value }))
                          }
                          placeholder="例如 588000"
                        />
                      </label>

                      <div className="admin-detail-image-panel">
                        <div className="admin-detail-image-preview">
                          {modelContentForm.detailImagePath ? (
                            <img
                              src={buildModelDetailImageUrl(apiOrigin, modelContentForm.modelId, modelContentForm.detailImagePath)}
                              alt={modelContentForm.displayName || modelContentForm.modelId}
                            />
                          ) : (
                            <span>当前未设置详情图。可先在模型目录中上传一张 PNG/JPG/WebP，再在右侧选择。</span>
                          )}
                        </div>

                        <div className="admin-detail-image-meta">
                          <label className="admin-field">
                            <span>详情图路径</span>
                            <select
                              className="admin-input admin-select"
                              value={modelContentForm.detailImagePath}
                              onChange={(event) =>
                                setModelContentForm((current) => ({ ...current, detailImagePath: event.target.value }))
                              }
                            >
                              <option value="">不使用详情图</option>
                              {detailImageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="admin-helper">详情图会用于第三屏的资料展示卡与船型说明卡片。</p>
                        </div>
                      </div>

                      <div className="admin-spec-grid">
                        {MODEL_SPEC_FIELDS.map((field) => (
                          <label key={field.key} className="admin-field">
                            <span>{field.label}</span>
                            <input
                              className="admin-input"
                              value={modelContentForm.specs[field.key] ?? ''}
                              onChange={(event) =>
                                setModelContentForm((current) => ({
                                  ...current,
                                  specs: {
                                    ...current.specs,
                                    [field.key]: event.target.value
                                  }
                                }))
                              }
                              placeholder={field.placeholder}
                            />
                          </label>
                        ))}
                      </div>

                      <label className="admin-field">
                        <span>简介</span>
                        <textarea
                          className="admin-input admin-textarea"
                          value={modelContentForm.summary}
                          onChange={(event) =>
                            setModelContentForm((current) => ({ ...current, summary: event.target.value }))
                          }
                          placeholder="填写这条船的核心卖点、应用场景与简述。"
                        />
                      </label>

                      <div className="admin-actions">
                        <button type="button" className="btn primary" onClick={handleSaveModelContent} disabled={isSavingModelContent}>
                          {isSavingModelContent ? '保存中...' : '保存展示内容'}
                        </button>
                        <button
                          type="button"
                          className="admin-danger-btn"
                          onClick={() => handleDeleteModel(modelContentForm.modelId)}
                          disabled={isDeletingModelId === modelContentForm.modelId}
                        >
                          {isDeletingModelId === modelContentForm.modelId ? '删除中...' : '删除整船模型'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="admin-empty">当前还没有可编辑的模型。</p>
                  )}
                </div>
              </section>
            </section>
          )}

          {activeSection === 'inventory' && (
            <section className="admin-section">
              <div className="admin-section-header">
                <div>
                  <p className="admin-panel-eyebrow">Inventory</p>
                  <h2>资源清单与贴图通道</h2>
                </div>
                <p className="admin-panel-caption">这一页负责解决白模问题。先看运行时选中了哪个模型文件，再对照材质槽和贴图通道逐个核对。</p>
              </div>

              <div className="admin-inventory-stack">
                <div className="admin-inventory-toolbar">
                  <span className="admin-inventory-toolbar-label">选择模型</span>
                  <div className="admin-inventory-toolbar-controls">
                    <div className="admin-inventory-picker">
                      <select
                        className="admin-input admin-select"
                        value={selectedInventoryModelId}
                        onChange={(event) => setSelectedInventoryModelId(event.target.value)}
                      >
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName || model.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-inventory-summary">
                      <p>{inventorySummary}</p>
                    </div>
                  </div>
                </div>

                {selectedInventoryModel ? (
                  <div className="admin-inventory-detail">
                    <div className="admin-inventory-detail-head">
                      <div>
                        <p className="admin-model-id">{selectedInventoryModel.displayName || selectedInventoryModel.id}</p>
                        <p className="admin-model-meta">
                          目录：{selectedInventoryModel.id} | 文件数 {selectedInventoryModel.fileCount} | 容量 {formatBytes(selectedInventoryModel.totalBytes)}
                        </p>
                        <p className="admin-model-content-meta">
                          当前运行时模型：{selectedInventoryModel.selectedModelPath || '未选中'}
                        </p>
                      </div>
                      <p className="admin-panel-caption">
                        运行时 UV 覆盖率 {formatNumber((selectedInventoryModel.runtime?.uvCoverage ?? 0) * 100, 1)}%
                        {' | '}
                        UV2 覆盖率 {formatNumber((selectedInventoryModel.runtime?.uv2Coverage ?? 0) * 100, 1)}%
                      </p>
                    </div>

                    <div className="admin-file-section">
                      <p className="admin-file-section-title">补传贴图到当前模型</p>
                      <form
                        className="admin-form"
                        onSubmit={(event) => {
                          event.preventDefault()
                          handleUploadInventoryFiles()
                        }}
                      >
                        <div className="admin-form-split">
                          <label className="admin-field">
                            <span>上传到子目录</span>
                            <input
                              className="admin-input"
                              value={inventorySubdir}
                              onChange={(event) => setInventorySubdir(event.target.value)}
                              placeholder="例如 mt 或 cc 或 glass"
                            />
                          </label>

                          <label className="admin-field">
                            <span>选择贴图文件</span>
                            <input
                              className="admin-input admin-file-input"
                              type="file"
                              multiple
                              onChange={(event) => setInventoryFiles(Array.from(event.target.files ?? []))}
                            />
                          </label>
                        </div>

                        <p className="admin-helper">
                          {inventoryFiles.length
                            ? `已选择 ${inventoryFiles.length} 个文件，共 ${formatBytes(inventoryFiles.reduce((sum, file) => sum + (file.size || 0), 0))}`
                            : '这里用于给当前模型根目录或材质目录补充贴图，不需要重新传整条船。'}
                        </p>

                        <div className="admin-actions">
                          <button type="submit" className="btn primary" disabled={isUploadingInventory}>
                            {isUploadingInventory ? '上传中...' : '上传贴图'}
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="admin-file-section">
                      <p className="admin-file-section-title">材质槽识别</p>
                      {!materialSlots.length ? (
                        <p className="admin-helper">当前运行时模型没有识别到材质槽，或者模型文件本身没有稳定的材质命名。</p>
                      ) : (
                        <div className="admin-material-slot-list">
                          {materialSlots.map((slot) => (
                            <article key={`${selectedInventoryModel.id}:${slot.name}`} className="admin-material-slot-card">
                              <div className="admin-material-slot-copy">
                                <p className="admin-material-slot-name">{slot.name}</p>
                                <p className="admin-material-slot-meta">
                                  命中网格 {slot.meshCount ?? 0} 个
                                  {slot.matchedUvSetId ? ` | 已匹配目录 ${slot.matchedUvSetId}` : ' | 暂未匹配目录'}
                                  {slot.matchedUvSetFileCount ? ` | 目录文件 ${slot.matchedUvSetFileCount} 个` : ''}
                                </p>
                              </div>
                              <div className="admin-material-slot-actions">
                                <span className="admin-material-slot-subdir">{slot.suggestedSubdir || '建议新建子目录'}</span>
                                <button type="button" className="mini-btn" onClick={() => handleUseMaterialSlotSubdir(slot)}>
                                  用于上传
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="admin-file-section">
                      <p className="admin-file-section-title">运行时诊断</p>
                      <div className="admin-model-list">
                        <article className="admin-model-record">
                          <div className="admin-model-record-head">
                            <div>
                              <p className="admin-model-id">当前选中模型文件</p>
                              <p className="admin-model-meta">{selectedInventoryModel.selectedModelPath || '未选中'}</p>
                            </div>
                            <p className="admin-panel-caption">
                              网格 {selectedInventoryModel.runtime?.meshCount ?? 0}
                              {' | '}
                              UV {selectedInventoryModel.runtime?.meshWithUvCount ?? 0}
                              {' | '}
                              UV2 {selectedInventoryModel.runtime?.meshWithUv2Count ?? 0}
                            </p>
                          </div>
                          <div className="admin-file-section">
                            {selectedInventoryModel.runtime?.inspectionError ? (
                              <p className="admin-inline-note">检查警告：{selectedInventoryModel.runtime.inspectionError}</p>
                            ) : (
                              <p className="admin-inline-note">运行时检查正常，未报告解析错误。</p>
                            )}
                          </div>
                        </article>

                        {(selectedInventoryModel.runtime?.candidates ?? []).map((candidate) => (
                          <article key={`${selectedInventoryModel.id}:${candidate.path}`} className="admin-model-record">
                            <div className="admin-model-record-head">
                              <div>
                                <p className="admin-model-id">{candidate.fileName}</p>
                                <p className="admin-model-meta">
                                  {candidate.path} | {candidate.format} | 评分 {formatNumber(candidate.score ?? 0, 2)}
                                </p>
                              </div>
                              <p className="admin-panel-caption">
                                网格 {candidate.meshCount ?? 0}
                                {' | '}
                                UV {candidate.meshWithUvCount ?? 0}
                                {' | '}
                                UV2 {candidate.meshWithUv2Count ?? 0}
                              </p>
                            </div>
                            <div className="admin-file-section">
                              <p className="admin-inline-note">
                                UV 覆盖率 {formatNumber((candidate.uvCoverage ?? 0) * 100, 1)}%
                                {' | '}
                                UV2 覆盖率 {formatNumber((candidate.uv2Coverage ?? 0) * 100, 1)}%
                              </p>
                              {candidate.inspectionError ? (
                                <p className="admin-inline-note">检查警告：{candidate.inspectionError}</p>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="admin-file-section">
                      <p className="admin-file-section-title">根目录文件</p>
                      {renderFileList(selectedInventoryModel.id, selectedInventoryModel.files)}
                    </div>

                    {(selectedInventoryModel.uvSets ?? []).map((uvSet) => (
                      <div key={`${selectedInventoryModel.id}:${uvSet.id}`} className="admin-file-section">
                        <p className="admin-file-section-title">
                          UV 目录 {uvSet.id} | 文件 {uvSet.fileCount} 个 | 容量 {formatBytes(uvSet.totalBytes)}
                        </p>
                        <div className="admin-form-split">
                          <label className="admin-field">
                            <span>材质槽绑定</span>
                            <input
                              key={`${selectedInventoryModel.id}:${uvSet.id}:${uvSet.materialNameHint || ''}`}
                              className="admin-input"
                              defaultValue={uvSet.materialNameHint || ''}
                              placeholder="例如 M_01___Default 或 01 - Default"
                              onBlur={(event) =>
                                handleUpdateUvSetMaterialHint(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  event.target.value
                                )
                              }
                            />
                          </label>
                          <div className="admin-field">
                            <span>来源</span>
                            <p className="admin-helper">
                              {formatMaterialHintSource(uvSet.materialHintSource)}
                            </p>
                          </div>
                        </div>
                        <div className="admin-form-split">
                          <label className="admin-field">
                            <span>透明模式</span>
                            <select
                              className="admin-input admin-select"
                              value={normalizeUvSetRenderProfileInput(uvSet.renderProfile).alphaMode}
                              onChange={(event) =>
                                handleUpdateUvSetRenderProfile(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  {
                                    ...normalizeUvSetRenderProfileInput(uvSet.renderProfile),
                                    alphaMode: event.target.value
                                  }
                                )
                              }
                              disabled={uvSetUpdateKey === `${selectedInventoryModel.id}:${uvSet.directoryPath || uvSet.id}:render-profile`}
                            >
                              <option value="">自动</option>
                              <option value="opaque">不透明</option>
                              <option value="cutout">裁切透明</option>
                              <option value="blend">混合透明</option>
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>面朝向</span>
                            <select
                              className="admin-input admin-select"
                              value={normalizeUvSetRenderProfileInput(uvSet.renderProfile).side}
                              onChange={(event) =>
                                handleUpdateUvSetRenderProfile(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  {
                                    ...normalizeUvSetRenderProfileInput(uvSet.renderProfile),
                                    side: event.target.value
                                  }
                                )
                              }
                              disabled={uvSetUpdateKey === `${selectedInventoryModel.id}:${uvSet.directoryPath || uvSet.id}:render-profile`}
                            >
                              <option value="">自动</option>
                              <option value="front">单面</option>
                              <option value="double">双面</option>
                            </select>
                          </label>
                        </div>
                        <div className="admin-form-split">
                          <label className="admin-field">
                            <span>Depth Write</span>
                            <select
                              className="admin-input admin-select"
                              value={normalizeUvSetRenderProfileInput(uvSet.renderProfile).depthWrite}
                              onChange={(event) =>
                                handleUpdateUvSetRenderProfile(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  {
                                    ...normalizeUvSetRenderProfileInput(uvSet.renderProfile),
                                    depthWrite: event.target.value
                                  }
                                )
                              }
                              disabled={uvSetUpdateKey === `${selectedInventoryModel.id}:${uvSet.directoryPath || uvSet.id}:render-profile`}
                            >
                              <option value="">自动</option>
                              <option value="on">开启</option>
                              <option value="off">关闭</option>
                            </select>
                          </label>
                          <label className="admin-field">
                            <span>Depth Test</span>
                            <select
                              className="admin-input admin-select"
                              value={normalizeUvSetRenderProfileInput(uvSet.renderProfile).depthTest}
                              onChange={(event) =>
                                handleUpdateUvSetRenderProfile(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  {
                                    ...normalizeUvSetRenderProfileInput(uvSet.renderProfile),
                                    depthTest: event.target.value
                                  }
                                )
                              }
                              disabled={uvSetUpdateKey === `${selectedInventoryModel.id}:${uvSet.directoryPath || uvSet.id}:render-profile`}
                            >
                              <option value="">Auto</option>
                              <option value="on">On</option>
                              <option value="off">Off</option>
                            </select>
                          </label>
                        </div>
                        <div className="admin-form-split">
                          <label className="admin-field">
                            <span>Alpha Cutoff</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="0"
                              max="1"
                              step="0.01"
                              value={normalizeUvSetRenderProfileInput(uvSet.renderProfile).alphaCutoff}
                              onChange={(event) =>
                                handleUpdateUvSetRenderProfile(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  {
                                    ...normalizeUvSetRenderProfileInput(uvSet.renderProfile),
                                    alphaCutoff: event.target.value
                                  }
                                )
                              }
                              disabled={uvSetUpdateKey === `${selectedInventoryModel.id}:${uvSet.directoryPath || uvSet.id}:render-profile`}
                            />
                          </label>
                          <label className="admin-field">
                            <span>Render Order</span>
                            <input
                              className="admin-input"
                              type="number"
                              min="-1000"
                              max="1000"
                              step="1"
                              placeholder="Auto"
                              value={normalizeUvSetRenderProfileInput(uvSet.renderProfile).renderOrder}
                              onChange={(event) =>
                                handleUpdateUvSetRenderProfile(
                                  selectedInventoryModel.id,
                                  uvSet.directoryPath || uvSet.id,
                                  {
                                    ...normalizeUvSetRenderProfileInput(uvSet.renderProfile),
                                    renderOrder: event.target.value
                                  }
                                )
                              }
                              disabled={uvSetUpdateKey === `${selectedInventoryModel.id}:${uvSet.directoryPath || uvSet.id}:render-profile`}
                            />
                          </label>
                        </div>
                        {renderFileList(selectedInventoryModel.id, uvSet.files, uvSet.id)}
                      </div>
                    ))}
                    <div className="admin-file-section">
                      <p className="admin-file-section-title">马达挂载配置</p>
                      <p className="admin-helper">这里用于给当前船型配置最多 4 个马达的启用状态、类型、位置和旋转。</p>
                      <div className="admin-engine-config">
                        <div className="admin-engine-grid">
                          {inventoryEngineForm.map((engine, index) => (
                            <article key={`${selectedInventoryModel.id}:engine:${index}`} className="admin-engine-card">
                              <div className="admin-engine-card-head">
                                <strong>{`马达 ${index + 1}`}</strong>
                                <label className="admin-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(engine.enabled)}
                                    onChange={(event) =>
                                      setInventoryEngineForm((current) =>
                                        current.map((item, itemIndex) => (
                                          itemIndex === index
                                            ? { ...item, enabled: event.target.checked }
                                            : item
                                        ))
                                      )
                                    }
                                  />
                                  <span>启用</span>
                                </label>
                              </div>

                              <label className="admin-field">
                                <span>马达类型</span>
                                <select
                                  className="admin-input admin-select"
                                  value={engine.type}
                                  onChange={(event) =>
                                    setInventoryEngineForm((current) =>
                                      current.map((item, itemIndex) => (
                                        itemIndex === index
                                          ? { ...item, type: event.target.value }
                                          : item
                                      ))
                                    )
                                  }
                                >
                                  {ENGINE_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="admin-engine-vector-grid">
                                {['x', 'y', 'z'].map((axis) => (
                                  <label key={`inventory-position-${index}-${axis}`} className="admin-field">
                                    <span>{`位置 ${axis.toUpperCase()}`}</span>
                                    <input
                                      className="admin-input"
                                      type="number"
                                      step="0.01"
                                      value={engine.position?.[axis] ?? 0}
                                      onChange={(event) =>
                                        setInventoryEngineForm((current) =>
                                          current.map((item, itemIndex) => (
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  position: {
                                                    ...item.position,
                                                    [axis]: Number(event.target.value) || 0
                                                  }
                                                }
                                              : item
                                          ))
                                        )
                                      }
                                    />
                                  </label>
                                ))}
                              </div>

                              <div className="admin-engine-vector-grid">
                                {['x', 'y', 'z'].map((axis) => (
                                  <label key={`inventory-rotation-${index}-${axis}`} className="admin-field">
                                    <span>{`旋转 ${axis.toUpperCase()}`}</span>
                                    <input
                                      className="admin-input"
                                      type="number"
                                      step="0.01"
                                      value={engine.rotation?.[axis] ?? 0}
                                      onChange={(event) =>
                                        setInventoryEngineForm((current) =>
                                          current.map((item, itemIndex) => (
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  rotation: {
                                                    ...item.rotation,
                                                    [axis]: Number(event.target.value) || 0
                                                  }
                                                }
                                              : item
                                          ))
                                        )
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>

                        <div className="admin-actions">
                          <button
                            type="button"
                            className="btn primary"
                            onClick={handleSaveInventoryEngines}
                            disabled={isSavingInventoryEngines || !selectedInventoryModel?.id}
                          >
                            {isSavingInventoryEngines ? '保存中...' : `保存 ${selectedInventoryModel.displayName || selectedInventoryModel.id} 的马达配置`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="admin-empty">当前没有可查看的模型。</p>
                )}
              </div>
            </section>
          )}

          {activeSection === 'orders' && (
            <section className="admin-section">
              <div className="admin-section-header">
                <div>
                  <p className="admin-panel-eyebrow">Orders</p>
                  <h2>销售订单管理</h2>
                </div>
                <p className="admin-panel-caption">前台提交订购意向后会落到这里。可以按状态切换为新提交、跟进中、已完成。</p>
              </div>

              <div className="admin-sales-alert">
                <div>
                  <p className="admin-panel-eyebrow">New Orders</p>
                  <h3>当前有 {salesState.newOrderCount} 条待跟进订单</h3>
                  <p>最近更新时间：{formatDateTime(salesState.updatedAt)}</p>
                </div>
                <div className="admin-actions">
                  <button type="button" className="mini-btn" onClick={() => loadOrders(apiOrigin, { successMessage: '订单数据已刷新' })} disabled={isLoadingOrders}>
                    {isLoadingOrders ? '刷新中...' : '刷新订单'}
                  </button>
                </div>
              </div>

              <div className="admin-sales-list">
                {(salesState.orders ?? []).length ? (
                  salesState.orders.map((order) => {
                    const statusMeta = getStatusMeta(order.status)
                    return (
                      <article key={order.id} className="admin-sales-row">
                        <div className="admin-sales-main">
                          <div className="admin-sales-head">
                            <div>
                              <p className={`admin-sales-status ${statusMeta.value}`}>{statusMeta.label}</p>
                              <h3>{order.modelLabel || order.modelId || '未命名订单'}</h3>
                            </div>
                            <div className="admin-sales-meta">
                              <span>订单号</span>
                              <strong>{order.id}</strong>
                            </div>
                          </div>

                          <div className="admin-sales-meta">
                            <span>创建于 {formatDateTime(order.createdAt)}</span>
                            <span>更新于 {formatDateTime(order.updatedAt)}</span>
                            <span>来源 {order.source || 'showcase-web'}</span>
                          </div>

                          <div className="admin-sales-grid">
                            <div>
                              <span className="admin-row-label">客户信息</span>
                              <p>称呼：{order.customerName || '未填写'}</p>
                              <p>联系方式：{order.customerContact || '未填写'}</p>
                            </div>
                            <div>
                              <span className="admin-row-label">基础配置</span>
                              <p>船型：{order.category || '未填写'}</p>
                              <p>外观：{order.appearanceLabel || '未填写'}</p>
                              <p>颜色：{order.colorLabel || '未填写'} {order.colorHex ? `(${order.colorHex})` : ''}</p>
                            </div>
                            <div>
                              <span className="admin-row-label">内部与动力</span>
                              <p>内饰：{order.interiorLabel || '未填写'}</p>
                              <p>动力：{order.powerLabel || '未填写'}</p>
                              <p>价格：¥{formatNumber(order.totalPrice)}</p>
                            </div>
                          </div>

                          <div className="admin-sales-options">
                            <span className="admin-row-label">选装</span>
                            <p>
                              {order.optionalPackageLabels?.length
                                ? order.optionalPackageLabels.join('、')
                                : '未选择选装'}
                            </p>
                          </div>
                        </div>

                        <div className="admin-row-actions">
                          <span className="admin-row-label">状态切换</span>
                          {ORDER_STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={option.value === order.status ? 'btn primary' : 'mini-btn'}
                              onClick={() => handleUpdateOrderStatus(order.id, option.value)}
                              disabled={updatingOrderId === order.id}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </article>
                    )
                  })
                ) : (
                  <p className="admin-empty">当前还没有订单记录。</p>
                )}
              </div>
            </section>
          )}

          {activeSection === 'videos' && (
            <section className="admin-section">
              <div className="admin-section-header">
                <div>
                  <p className="admin-panel-eyebrow">Videos</p>
                  <h2>视频内容管理</h2>
                </div>
                <p className="admin-panel-caption">支持 YouTube 与 Bilibili 链接，保存后会进入前台视频模块。</p>
              </div>

              <div className="admin-video-layout">
                <form
                  className="admin-video-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleSaveVideo()
                  }}
                >
                  <label className="admin-field">
                    <span>视频标题</span>
                    <input
                      className="admin-input"
                      value={videoForm.title}
                      onChange={(event) => setVideoForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="例如 智能消防艇全景演示"
                    />
                  </label>

                  <label className="admin-field">
                    <span>视频链接</span>
                    <input
                      className="admin-input"
                      value={videoForm.url}
                      onChange={(event) => setVideoForm((current) => ({ ...current, url: event.target.value }))}
                      placeholder="输入 YouTube 或 Bilibili 链接"
                    />
                  </label>

                  <label className="admin-field">
                    <span>视频简介</span>
                    <textarea
                      className="admin-input admin-textarea"
                      value={videoForm.summary}
                      onChange={(event) => setVideoForm((current) => ({ ...current, summary: event.target.value }))}
                      placeholder="简述视频想传达的卖点。"
                    />
                  </label>

                  <div className="admin-actions">
                    <button type="submit" className="btn primary" disabled={isSavingVideo}>
                      {isSavingVideo ? '保存中...' : videoForm.id ? '更新视频' : '新增视频'}
                    </button>
                    {videoForm.id ? (
                      <button type="button" className="mini-btn" onClick={() => setVideoForm(EMPTY_VIDEO_FORM)}>
                        取消编辑
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="admin-video-list">
                  {videos.length ? (
                    videos.map((video) => (
                      <article key={video.id} className="admin-video-row">
                        <div className="admin-video-main">
                          <p className="admin-video-platform">{video.platform}</p>
                          <div className="admin-video-meta">
                            <h3>{video.title}</h3>
                          </div>
                          <p className="admin-video-summary">{video.summary || '暂无简介'}</p>
                          <div className="admin-video-links">
                            <a href={video.sourceUrl} target="_blank" rel="noreferrer">
                              原始链接
                            </a>
                            {video.externalUrl ? (
                              <a href={video.externalUrl} target="_blank" rel="noreferrer">
                                外部播放页
                              </a>
                            ) : null}
                            {video.embedUrl ? (
                              <a href={video.embedUrl} target="_blank" rel="noreferrer">
                                嵌入地址
                              </a>
                            ) : null}
                          </div>
                        </div>

                        <div className="admin-video-side">
                          <span className="admin-row-label">视频 ID</span>
                          <p>{video.id}</p>
                        </div>

                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() =>
                              setVideoForm({
                                id: video.id,
                                title: video.title ?? '',
                                url: video.sourceUrl ?? '',
                                summary: video.summary ?? ''
                              })
                            }
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="admin-danger-btn"
                            onClick={() => handleDeleteVideo(video.id)}
                            disabled={isDeletingVideoId === video.id}
                          >
                            {isDeletingVideoId === video.id ? '删除中...' : '删除'}
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="admin-empty">当前还没有配置视频内容。</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeSection === 'account' && (
            <section className="admin-section-grid is-single">
              <section className="admin-section">
                <div className="admin-section-header">
                  <div>
                    <p className="admin-panel-eyebrow">Account</p>
                    <h2>账户与接口设置</h2>
                  </div>
                  <p className="admin-panel-caption">可以在这里切换 API 地址、修改后台密码，并查看当前管理员账号。</p>
                </div>

                <div className="admin-hero-card admin-user-card">
                  <p className="admin-panel-eyebrow">Current User</p>
                  <span className="admin-user-email">{authState.user?.email ?? DEFAULT_ADMIN_EMAIL}</span>
                </div>

                <form
                  className="admin-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveApiOrigin()
                  }}
                >
                  <label className="admin-field">
                    <span>API 地址覆盖</span>
                    <input
                      className="admin-input"
                      value={apiOriginInput}
                      onChange={(event) => setApiOriginInput(event.target.value)}
                      placeholder="例如 http://1.14.77.78:8080"
                    />
                  </label>
                  <div className="admin-actions">
                    <button type="submit" className="mini-btn">
                      保存接口地址
                    </button>
                  </div>
                </form>

                <form
                  className="admin-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleChangePassword()
                  }}
                >
                  <div className="admin-form-split">
                    <label className="admin-field">
                      <span>当前密码</span>
                      <input
                        className="admin-input"
                        type="password"
                        autoComplete="current-password"
                        value={passwordForm.currentPassword}
                        onChange={(event) =>
                          setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                        }
                      />
                    </label>

                    <label className="admin-field">
                      <span>新密码</span>
                      <input
                        className="admin-input"
                        type="password"
                        autoComplete="new-password"
                        value={passwordForm.newPassword}
                        onChange={(event) =>
                          setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                        }
                      />
                    </label>
                  </div>

                  <label className="admin-field">
                    <span>确认新密码</span>
                    <input
                      className="admin-input"
                      type="password"
                      autoComplete="new-password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                      }
                    />
                  </label>

                  <div className="admin-actions">
                    <button type="submit" className="btn primary" disabled={isSubmitting}>
                      {isSubmitting ? '提交中...' : '修改密码'}
                    </button>
                  </div>
                </form>
              </section>
            </section>
          )}

          {notice && (
            <section className={`admin-notice admin-content-notice ${notice.tone}`}>
              <p>{notice.message}</p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
