import { useEffect, useRef, useState } from 'react'

const ADMIN_API_ORIGIN_STORAGE_KEY = 'salesboat.admin-api-origin'
const DEFAULT_ADMIN_API_ORIGIN = ''
const EMPTY_VIDEO_FORM = {
  id: '',
  title: '',
  url: '',
  summary: ''
}

const TEXTURE_TYPE_LABELS = {
  baseColor: 'BaseColor',
  emissive: 'Emissive',
  normal: 'Normal',
  ao: 'AO',
  metalness: 'Metalness',
  roughness: 'Roughness',
  none: '不作为贴图'
}

const TEXTURE_TYPE_OPTIONS = [
  { value: 'baseColor', label: 'BaseColor' },
  { value: 'emissive', label: 'Emissive' },
  { value: 'normal', label: 'Normal' },
  { value: 'ao', label: 'AO' },
  { value: 'metalness', label: 'Metalness' },
  { value: 'roughness', label: 'Roughness' }
]

function normalizeApiOrigin(value) {
  const trimmed = value.trim()
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

function formatBytes(value) {
  if (!value) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let amount = value
  let unitIndex = 0

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }

  const decimals = amount >= 10 || unitIndex === 0 ? 0 : 1
  return `${amount.toFixed(decimals)} ${units[unitIndex]}`
}

function formatTimestamp(value) {
  if (!value) {
    return '不可用'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
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

function getNoticeMessage(error, fallbackPrefix) {
  if (!error) {
    return fallbackPrefix
  }

  if (error.message?.startsWith('Request failed with status')) {
    return `${fallbackPrefix}：${error.message.replace('Request failed with status', '请求失败，状态码')}`
  }

  return error.message || fallbackPrefix
}

function getTextureTypeLabel(textureType) {
  return TEXTURE_TYPE_LABELS[textureType] ?? textureType ?? '未标记'
}

function getTextureAutoOptionLabel(file) {
  if (file.detectedTextureType) {
    return `自动识别（${getTextureTypeLabel(file.detectedTextureType)}）`
  }

  return '自动识别（未匹配）'
}

function getTextureStatusText(file) {
  if (file.textureAssignment === 'none') {
    return '不作为贴图'
  }

  if (!file.textureType) {
    return file.textureCandidate ? '未标记' : ''
  }

  return `${getTextureTypeLabel(file.textureType)}${file.textureAssignment ? '（手动）' : '（自动）'}`
}

export default function AdminPage() {
  const fileInputRef = useRef(null)
  const [apiOrigin, setApiOrigin] = useState(() => {
    const storedValue = window.localStorage.getItem(ADMIN_API_ORIGIN_STORAGE_KEY)
    return normalizeApiOrigin(storedValue ?? DEFAULT_ADMIN_API_ORIGIN)
  })
  const [draftApiOrigin, setDraftApiOrigin] = useState(apiOrigin)
  const [dashboard, setDashboard] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSavingVideo, setIsSavingVideo] = useState(false)
  const [savingTextureKey, setSavingTextureKey] = useState('')
  const [notice, setNotice] = useState(null)
  const [uploadModelId, setUploadModelId] = useState('')
  const [uploadSubdir, setUploadSubdir] = useState('')
  const [replaceExisting, setReplaceExisting] = useState(true)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [videoForm, setVideoForm] = useState(EMPTY_VIDEO_FORM)
  const [selectedInventoryModelId, setSelectedInventoryModelId] = useState('')

  const requestJson = async (path, options = {}, originOverride = apiOrigin) => {
    const response = await fetch(buildApiUrl(originOverride, path), options)
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(payload?.error ?? `Request failed with status ${response.status}`)
    }

    return payload
  }

  const loadDashboard = async (originOverride = apiOrigin, options = {}) => {
    const { showPendingState = true } = options

    if (showPendingState) {
      setIsLoading(true)
    }

    try {
      const payload = await requestJson('/api/admin/models', {}, originOverride)
      setDashboard(payload)

      if (options.successMessage) {
        setNotice({ tone: 'success', message: options.successMessage })
      }
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '加载后台数据失败') })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard(apiOrigin)
  }, [apiOrigin])

  useEffect(() => {
    const models = dashboard?.models ?? []
    if (models.length === 0) {
      setSelectedInventoryModelId('')
      return
    }

    const hasSelectedModel = models.some((model) => model.id === selectedInventoryModelId)
    if (!hasSelectedModel) {
      setSelectedInventoryModelId(models[0].id)
    }
  }, [dashboard, selectedInventoryModelId])

  const handleSaveApiOrigin = (event) => {
    event.preventDefault()
    const nextOrigin = normalizeApiOrigin(draftApiOrigin)

    window.localStorage.setItem(ADMIN_API_ORIGIN_STORAGE_KEY, nextOrigin)
    setApiOrigin(nextOrigin)
    setNotice(null)
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setNotice(null)

    try {
      const payload = await requestJson('/api/admin/sync', { method: 'POST' })
      setDashboard(payload.state)
      setNotice({ tone: 'success', message: payload.message })
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '同步资源失败') })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    if (selectedFiles.length === 0) {
      setNotice({ tone: 'error', message: '请至少选择一个文件后再上传。' })
      return
    }

    setIsUploading(true)
    setNotice(null)

    const formData = new FormData()
    formData.append('modelId', uploadModelId.trim())
    formData.append('subdir', uploadSubdir.trim())
    formData.append('replace', String(replaceExisting))
    selectedFiles.forEach((file) => {
      formData.append('files', file)
    })

    try {
      const response = await fetch(buildApiUrl(apiOrigin, '/api/admin/models/upload'), {
        method: 'POST',
        body: formData
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? `上传失败，状态码 ${response.status}`)
      }

      setDashboard(payload.state)
      setNotice({ tone: 'success', message: payload.message })
      setUploadModelId('')
      setUploadSubdir('')
      setReplaceExisting(true)
      setSelectedFiles([])

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '上传文件失败') })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteModel = async (modelId) => {
    if (!window.confirm(`确认删除模型“${modelId}”及其所有上传文件吗？`)) {
      return
    }

    setNotice(null)

    try {
      const payload = await requestJson(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: 'DELETE'
      })
      setDashboard(payload.state)
      setNotice({ tone: 'success', message: payload.message })
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '删除模型失败') })
    }
  }

  const handleDeleteFile = async (modelId, relativePath) => {
    if (!window.confirm(`确认删除模型“${modelId}”中的文件“${relativePath}”吗？`)) {
      return
    }

    setNotice(null)

    try {
      const payload = await requestJson(
        `/api/admin/models/${encodeURIComponent(modelId)}/files?path=${encodeURIComponent(relativePath)}`,
        { method: 'DELETE' }
      )
      setDashboard(payload.state)
      setNotice({ tone: 'success', message: payload.message })
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '删除文件失败') })
    }
  }

  const handleSaveVideo = async (event) => {
    event.preventDefault()
    setIsSavingVideo(true)
    setNotice(null)

    const payload = {
      title: videoForm.title.trim(),
      url: videoForm.url.trim(),
      summary: videoForm.summary.trim()
    }

    try {
      const response = await requestJson(
        videoForm.id
          ? `/api/admin/videos/${encodeURIComponent(videoForm.id)}`
          : '/api/admin/videos',
        {
          method: videoForm.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

      setDashboard(response.state)
      setNotice({ tone: 'success', message: response.message })
      setVideoForm(EMPTY_VIDEO_FORM)
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '保存视频失败') })
    } finally {
      setIsSavingVideo(false)
    }
  }

  const handleEditVideo = (video) => {
    setVideoForm({
      id: video.id,
      title: video.title,
      url: video.sourceUrl || video.externalUrl,
      summary: video.summary ?? ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteVideo = async (video) => {
    if (!window.confirm(`确认删除视频“${video.title}”吗？`)) {
      return
    }

    setNotice(null)

    try {
      const payload = await requestJson(`/api/admin/videos/${encodeURIComponent(video.id)}`, {
        method: 'DELETE'
      })
      setDashboard(payload.state)
      setNotice({ tone: 'success', message: payload.message })

      if (videoForm.id === video.id) {
        setVideoForm(EMPTY_VIDEO_FORM)
      }
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '删除视频失败') })
    }
  }

  const handleUpdateTextureType = async (modelId, relativePath, textureType) => {
    const requestKey = `${modelId}:${relativePath}`
    setSavingTextureKey(requestKey)
    setNotice(null)

    try {
      const payload = await requestJson('/api/admin/file-texture-type', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          modelId,
          path: relativePath,
          textureType
        })
      })

      setDashboard(payload.state)
      setNotice({ tone: 'success', message: payload.message })
    } catch (error) {
      setNotice({ tone: 'error', message: getNoticeMessage(error, '更新贴图标记失败') })
    } finally {
      setSavingTextureKey('')
    }
  }

  const renderFileList = (modelId, files) => {
    if (!files?.length) {
      return <p className="admin-empty">当前分组还没有文件。</p>
    }

    return (
      <ul className="admin-file-list">
        {files.map((file) => {
          const fileKey = `${modelId}:${file.relativePath}`
          const isSavingTexture = savingTextureKey === fileKey
          const textureStatus = getTextureStatusText(file)

          return (
            <li key={fileKey} className="admin-file-item">
              <div className="admin-file-copy">
                <p className="admin-file-name">{file.relativePath}</p>
                <p className="admin-file-meta">
                  {file.extension || '无扩展名'} | {formatBytes(file.size)}
                  {textureStatus ? ` | ${textureStatus}` : ''}
                  {!file.supported ? ' | 未同步到 public/gltf' : ''}
                </p>
              </div>

              <div className="admin-file-controls">
                {file.textureCandidate && (
                  <label className="admin-file-select-wrap">
                    <span className="admin-file-select-label">贴图标记</span>
                    <select
                      className="admin-input admin-select admin-file-select"
                      value={file.textureAssignment || 'auto'}
                      onChange={(event) => handleUpdateTextureType(modelId, file.relativePath, event.target.value)}
                      disabled={isSavingTexture}
                      aria-label={`设置 ${file.relativePath} 的贴图类型`}
                    >
                      <option value="auto">{getTextureAutoOptionLabel(file)}</option>
                      <option value="none">不作为贴图</option>
                      {TEXTURE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  className="admin-file-delete"
                  onClick={() => handleDeleteFile(modelId, file.relativePath)}
                >
                  删除
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  const videos = dashboard?.content?.videos ?? []
  const models = dashboard?.models ?? []
  const selectedInventoryModel = models.find((model) => model.id === selectedInventoryModelId) ?? null
  const stats = [
    {
      label: '主模型',
      value: dashboard?.manifest?.primaryModelId ?? '不可用'
    },
    {
      label: '清单更新时间',
      value: formatTimestamp(dashboard?.manifest?.generatedAt)
    },
    {
      label: '视频数量',
      value: String(videos.length)
    },
    {
      label: '内容更新时间',
      value: formatTimestamp(dashboard?.content?.updatedAt)
    }
  ]

  const handleScrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  return (
    <div className="admin-shell">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">
            <p className="admin-sidebar-kicker">SalesBoat</p>
            <h1>后台管理</h1>
            <p>统一管理运行时模型、同步资源以及前台展示用的视频外链。</p>
          </div>

          <div className="admin-sidebar-group">
            <p className="admin-sidebar-label">功能分区</p>
            <button type="button" className="admin-nav-button" onClick={() => handleScrollToSection('admin-overview')}>概览</button>
            <button type="button" className="admin-nav-button" onClick={() => handleScrollToSection('admin-connection')}>接口连接</button>
            <button type="button" className="admin-nav-button" onClick={() => handleScrollToSection('admin-upload')}>模型上传</button>
            <button type="button" className="admin-nav-button" onClick={() => handleScrollToSection('admin-media')}>视频管理</button>
            <button type="button" className="admin-nav-button" onClick={() => handleScrollToSection('admin-inventory')}>资源清单</button>
          </div>

          <div className="admin-sidebar-group">
            <p className="admin-sidebar-label">快捷操作</p>
            <button
              type="button"
              className="admin-nav-button"
              onClick={() => loadDashboard(apiOrigin, { successMessage: '控制台数据已刷新。' })}
              disabled={isLoading}
            >
              刷新数据
            </button>
            <button
              type="button"
              className="admin-nav-button"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? '同步中...' : '同步资源'}
            </button>
            <a className="admin-sidebar-link" href="#">打开前台页面</a>
          </div>
        </aside>

        <main className="admin-content">
          <section className="admin-page-header" id="admin-overview">
            <p className="admin-kicker">Go 后台</p>
            <h2>模型与媒体管理</h2>
            <p>在这里统一完成模型上传、资源同步，以及 YouTube 和 Bilibili 视频外链的维护。</p>
          </section>

          {notice && (
            <section className={`admin-notice ${notice.tone}`}>
              <p>{notice.message}</p>
            </section>
          )}

          <section className="admin-stat-strip" aria-label="后台概览指标">
            {stats.map((stat) => (
              <div key={stat.label} className="admin-stat-cell">
                <span className="admin-stat-label">{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </section>

          <div className="admin-section-grid">
            <section className="admin-section" id="admin-connection">
              <div className="admin-section-header">
                <div>
                  <p className="admin-panel-eyebrow">接口连接</p>
                  <h2>后端接口地址</h2>
                </div>
              </div>

              <form className="admin-form" onSubmit={handleSaveApiOrigin}>
                <label className="admin-field">
                  <span>API 地址</span>
                  <input
                    className="admin-input"
                    type="text"
                    value={draftApiOrigin}
                    onChange={(event) => setDraftApiOrigin(event.target.value)}
                    placeholder="留空则使用当前同源地址"
                  />
                </label>

                <p className="admin-helper">
                  当前台由 Go 服务直接托管时，这里建议保持留空。只有后台页面需要连接到其他服务地址时，才需要填写自定义接口域名。
                </p>

                <div className="admin-actions">
                  <button type="submit" className="btn primary">保存地址</button>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => loadDashboard(apiOrigin, { successMessage: '控制台数据已刷新。' })}
                    disabled={isLoading}
                  >
                    刷新
                  </button>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={handleSync}
                    disabled={isSyncing}
                  >
                    {isSyncing ? '同步中...' : '同步资源'}
                  </button>
                </div>
              </form>
            </section>

            <section className="admin-section" id="admin-upload">
              <div className="admin-section-header">
                <div>
                  <p className="admin-panel-eyebrow">模型上传</p>
                  <h2>上传新资源</h2>
                </div>
              </div>

              <form className="admin-form" onSubmit={handleUpload}>
                <label className="admin-field">
                  <span>模型 ID</span>
                  <input
                    className="admin-input"
                    type="text"
                    value={uploadModelId}
                    onChange={(event) => setUploadModelId(event.target.value)}
                    placeholder="PleasureBoat2"
                    required
                  />
                </label>

                <label className="admin-field">
                  <span>子目录</span>
                  <input
                    className="admin-input"
                    type="text"
                    value={uploadSubdir}
                    onChange={(event) => setUploadSubdir(event.target.value)}
                    placeholder="tt 或 1"
                  />
                </label>

                <label className="admin-field">
                  <span>文件</span>
                  <input
                    ref={fileInputRef}
                    className="admin-input admin-file-input"
                    type="file"
                    multiple
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  />
                </label>

                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(event) => setReplaceExisting(event.target.checked)}
                  />
                  <span>当存在同名文件时，允许直接覆盖。</span>
                </label>

                <p className="admin-helper">
                  先把模型文件上传到模型根目录，再把贴图上传到 `tt` 或 `1` 之类的 UV 子目录中。
                </p>

                <div className="admin-actions">
                  <button type="submit" className="btn primary" disabled={isUploading}>
                    {isUploading ? '上传中...' : '上传文件'}
                  </button>
                </div>
              </form>
            </section>
          </div>

          <section className="admin-section" id="admin-media">
            <div className="admin-section-header">
              <div>
                <p className="admin-panel-eyebrow">视频管理</p>
                <h2>YouTube 与 Bilibili 视频</h2>
              </div>
              <p className="admin-panel-caption">
                粘贴标准的 youtube.com 或 bilibili.com 视频链接，后端会自动规范化成前台可用的嵌入地址。
              </p>
            </div>

            <div className="admin-video-layout">
              <form className="admin-form admin-video-form" onSubmit={handleSaveVideo}>
                <label className="admin-field">
                  <span>视频标题</span>
                  <input
                    className="admin-input"
                    type="text"
                    value={videoForm.title}
                    onChange={(event) => setVideoForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例如：船型讲解视频"
                    required
                  />
                </label>

                <label className="admin-field">
                  <span>视频链接</span>
                  <input
                    className="admin-input"
                    type="text"
                    value={videoForm.url}
                    onChange={(event) => setVideoForm((current) => ({ ...current, url: event.target.value }))}
                    placeholder="https://www.youtube.com/watch?v=..."
                    required
                  />
                </label>

                <label className="admin-field">
                  <span>简介</span>
                  <textarea
                    className="admin-input admin-textarea"
                    value={videoForm.summary}
                    onChange={(event) => setVideoForm((current) => ({ ...current, summary: event.target.value }))}
                    placeholder="填写展示在前台详情页中的简短说明。"
                    rows={4}
                  />
                </label>

                <div className="admin-actions">
                  <button type="submit" className="btn primary" disabled={isSavingVideo}>
                    {isSavingVideo ? '保存中...' : videoForm.id ? '更新视频' : '新增视频'}
                  </button>
                  {videoForm.id && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setVideoForm(EMPTY_VIDEO_FORM)}
                    >
                      取消编辑
                    </button>
                  )}
                </div>
              </form>

              <div className="admin-video-list">
                {videos.length === 0 ? (
                  <p className="admin-empty">当前还没有添加任何外链视频。</p>
                ) : (
                  videos.map((video) => (
                    <article key={video.id} className="admin-video-row">
                      <div className="admin-video-main">
                        <p className="admin-video-platform">{getPlatformLabel(video.platform)}</p>
                        <h3>{video.title}</h3>
                        {video.summary && <p className="admin-video-summary">{video.summary}</p>}
                      </div>

                      <div className="admin-video-side">
                        <span className="admin-row-label">链接</span>
                        <div className="admin-video-links">
                          <a href={video.externalUrl} target="_blank" rel="noreferrer">打开源链接</a>
                          <a href={video.embedUrl} target="_blank" rel="noreferrer">打开嵌入链接</a>
                        </div>
                      </div>

                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => handleEditVideo(video)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="admin-danger-btn"
                          onClick={() => handleDeleteVideo(video)}
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="admin-section" id="admin-inventory">
            <div className="admin-section-header">
              <div>
                <p className="admin-panel-eyebrow">资源清单</p>
                <h2>模型资源查看</h2>
              </div>
              <p className="admin-panel-caption">
                源目录：{dashboard?.sourceRoot ?? '加载中...'}
              </p>
            </div>

            {isLoading && !dashboard ? (
              <p className="admin-empty">后台数据加载中...</p>
            ) : models.length === 0 ? (
              <p className="admin-empty">当前还没有可管理的模型资源。</p>
            ) : (
              <div className="admin-inventory-stack">
                <div className="admin-inventory-toolbar">
                  <p className="admin-inventory-toolbar-label">选择模型</p>

                  <div className="admin-inventory-toolbar-controls">
                    <div className="admin-inventory-picker">
                      <select
                        className="admin-input admin-select"
                        value={selectedInventoryModelId}
                        onChange={(event) => setSelectedInventoryModelId(event.target.value)}
                        aria-label="选择要查看资源的模型"
                      >
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.id} | {model.fileCount} 个文件 | {formatBytes(model.totalBytes)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedInventoryModel && (
                      <p className="admin-helper admin-inventory-summary">
                        当前查看：{selectedInventoryModel.id}，共 {selectedInventoryModel.fileCount} 个文件，
                        总大小 {formatBytes(selectedInventoryModel.totalBytes)}。
                      </p>
                    )}
                  </div>
                </div>

                <div className="admin-inventory-detail">
                  {selectedInventoryModel && (
                    <>
                      <div className="admin-inventory-detail-head">
                        <div>
                          <p className="admin-model-id">{selectedInventoryModel.id}</p>
                          <p className="admin-model-meta">
                            {selectedInventoryModel.fileCount} 个文件 | {formatBytes(selectedInventoryModel.totalBytes)}
                          </p>
                          {selectedInventoryModel.selectedModelPath && (
                            <p className="admin-inline-note">运行时模型：{selectedInventoryModel.selectedModelPath}</p>
                          )}
                        </div>

                        <button
                          type="button"
                          className="admin-danger-btn"
                          onClick={() => handleDeleteModel(selectedInventoryModel.id)}
                        >
                          删除模型
                        </button>
                      </div>

                      <div className="admin-file-section">
                        <p className="admin-file-section-title">根目录文件</p>
                        {renderFileList(selectedInventoryModel.id, selectedInventoryModel.files)}
                      </div>

                      {(selectedInventoryModel.uvSets ?? []).map((uvSet) => (
                        <div key={`${selectedInventoryModel.id}:${uvSet.id}`} className="admin-file-section">
                          <p className="admin-file-section-title">
                            UV 组：{uvSet.id} | {uvSet.fileCount} 个文件 | {formatBytes(uvSet.totalBytes)}
                          </p>
                          {renderFileList(selectedInventoryModel.id, uvSet.files)}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
