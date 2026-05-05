import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(frontendDir, '..')
const loadSharp = async () => {
  try {
    const sharpModule = await import('sharp')
    return sharpModule.default ?? sharpModule
  } catch {
    return null
  }
}
const sharp = await loadSharp()

// 仓库中的源资源目录。
const sourceDir = path.resolve(repoRoot, 'gltf')
// Vite 静态资源目标目录。
const targetDir = path.resolve(frontendDir, 'public/gltf')
const manifestPath = path.join(targetDir, 'asset-manifest.json')
const textureAssignmentsPath = path.resolve(repoRoot, 'data', 'texture-assignments.json')

// 仅同步与 3D 模型和贴图相关的文件类型。
const allowedExtensions = new Set([
  '.glb',
  '.gltf',
  '.bin',
  '.fbx',
  '.obj',
  '.mtl',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.ktx2',
  '.dds',
  '.hdr',
  '.exr'
])

const modelExtensions = ['.glb', '.gltf', '.fbx', '.obj']
const optimizableImageExtensions = new Set(['.png', '.jpg', '.jpeg'])
const preferredModelFileNames = ['1.glb', '1.fbx', '2.glb', '2.fbx']
const modelExtensionPriority = ['.glb', '.gltf', '.fbx', '.obj']
const preferredPrimaryModelId = 'PleasureBoat1'
const optimizedTextureModelIds = new Set(['LiuYun'])
const minimumOptimizableTextureBytes = 256 * 1024
const forceCompositeModelIds = new Set([])
const preferredCompositePartModelFileNames = {
  LiuYun: {
    cc: ['cc.fbx', 'cc.glb'],
    mt: ['mt.fbx', 'mt.glb']
  },
  TestHigh: {
    '灯带+控制台（1024）': ['灯带+控制台（完整）.fbx', '灯带+控制台.glb'],
    '船体+顶棚（2048）': ['船体+顶棚(整体).fbx', '船体+顶棚.glb'],
    '船舱+栏杆+沙发（2048）': ['船舱+栏杆+沙发（完整）.fbx', '船舱+栏杆+沙发.glb'],
    '马达（2048）': ['马达.fbx', '马达.glb']
  }
}

const getPreferredModelFileNames = (modelId) => {
  if (modelId === '40mijianchuan') {
    return ['40.fbx', '40.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  if (modelId === 'Yacht') {
    return ['950.fbx', '950.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  if (modelId === 'LiuYun') {
    return ['1198.fbx', '1198.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  if (modelId === 'Cabnet') {
    return ['119b.fbx', '119b.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  if (modelId === 'FireFighting') {
    return ['13.fbx', '13.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  if (modelId === 'PleasureBoat1') {
    return ['11.fbx', '11.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  return preferredModelFileNames.map((fileName) => fileName.toLowerCase())
}

const getPreferredCompositePartFileNames = (modelId, partId) => {
  return (
    preferredCompositePartModelFileNames[modelId]?.[partId]?.map((fileName) => fileName.toLowerCase()) ??
    []
  )
}

const installNodeTextureInspectionShim = () => {
  if (typeof globalThis.document !== 'undefined') {
    return
  }

  const createImageStub = () => ({
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    style: {},
    set src(_value) {},
    get src() {
      return ''
    }
  })

  globalThis.document = {
    createElementNS: createImageStub
  }
  globalThis.Image = class {
    addEventListener() {}
    removeEventListener() {}
    setAttribute() {}
    set src(_value) {}
    get src() {
      return ''
    }
  }
}

const normalizeMaterialSlotName = (value) => {
  if (!value) {
    return ''
  }

  return String(value)
    .toLowerCase()
    .replace(/^m[_\s-]*/, '')
    .replace(/[^a-z0-9]+/g, '')
}

if (!fs.existsSync(sourceDir)) {
  console.warn(`[sync:gltf] Source directory not found: ${sourceDir}`)
  process.exit(0)
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })

let copiedCount = 0
let optimizedTextureCount = 0
let optimizedTextureSavedBytes = 0

const toPosixPath = (value) => value.replace(/\\/g, '/')
const getSourceRelativePath = (absolutePath) => toPosixPath(path.relative(sourceDir, absolutePath))

const toPublicAssetPath = (absolutePath) => `/gltf/${getSourceRelativePath(absolutePath)}`
const optimizedTexturePublicPaths = new Map()

const toOptimizedPublicAssetPath = (absolutePath) => {
  const relativePath = path.relative(sourceDir, absolutePath)
  const parsedPath = path.parse(relativePath)
  return `/gltf/${toPosixPath(path.join(parsedPath.dir, `${parsedPath.name}.optimized.webp`))}`
}

const toOptimizedTargetPath = (absolutePath) => {
  const relativePath = path.relative(sourceDir, absolutePath)
  const parsedPath = path.parse(relativePath)
  return path.join(targetDir, parsedPath.dir, `${parsedPath.name}.optimized.webp`)
}

const toTexturePublicAssetPath = (absolutePath) => {
  const sourceRelativePath = getSourceRelativePath(absolutePath)
  return optimizedTexturePublicPaths.get(sourceRelativePath) ?? toPublicAssetPath(absolutePath)
}

const formatBytes = (value) => {
  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

const readTextureAssignments = () => {
  if (!fs.existsSync(textureAssignmentsPath)) {
    return { updatedAt: new Date().toISOString(), files: {}, uvSets: {} }
  }

  const raw = JSON.parse(fs.readFileSync(textureAssignmentsPath, 'utf8'))
  const files = {}
  const uvSets = {}

  for (const [relativePath, rawAssignment] of Object.entries(raw.files ?? {})) {
    const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '')
    const normalizedAssignment = normalizeTextureAssignmentRecord(rawAssignment)
    if (!normalizedPath || !normalizedAssignment) {
      continue
    }

    files[normalizedPath] = normalizedAssignment
  }

  for (const [relativePath, rawAssignment] of Object.entries(raw.uvSets ?? {})) {
    const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '')
    const normalizedAssignment = normalizeUVSetAssignmentRecord(rawAssignment)
    if (!normalizedPath || !normalizedAssignment) {
      continue
    }

    uvSets[normalizedPath] = normalizedAssignment
  }

  return {
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    files,
    uvSets
  }
}

const classifyTexture = (fileName) => {
  const normalizedName = fileName
    .slice(0, fileName.length - path.extname(fileName).length)
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')

  if (
    normalizedName.includes('r+m+ao') ||
    normalizedName.includes('r_m_ao') ||
    normalizedName.includes('occlusionroughnessmetallic') ||
    normalizedName.includes('occlusion_roughness_metallic')
  ) {
    return 'orm'
  }

  if (hasStandaloneOrmToken(normalizedName)) {
    return 'orm'
  }

  if (
    normalizedName.includes('basecolor') ||
    normalizedName.includes('base_color') ||
    normalizedName.includes('albedo') ||
    normalizedName.includes('diffuse')
  ) {
    return 'baseColor'
  }

  if (normalizedName.includes('emissive') || normalizedName.includes('emission')) {
    return 'emissive'
  }

  if (normalizedName.includes('normal')) {
    return 'normal'
  }

  if (
    normalizedName === 'ao' ||
    normalizedName.startsWith('ao_') ||
    normalizedName.endsWith('_ao') ||
    normalizedName.includes('ambientocclusion') ||
    normalizedName.includes('ambient_occlusion') ||
    normalizedName.includes('occlusion')
  ) {
    return 'ao'
  }

  if (normalizedName.includes('roughness') || normalizedName.includes('rough')) {
    return 'roughness'
  }

  if (
    normalizedName.includes('metallic') ||
    normalizedName.includes('metalness') ||
    normalizedName.includes('metal')
  ) {
    return 'metalness'
  }

  if (
    normalizedName.includes('opacity') ||
    normalizedName.includes('transparency') ||
    normalizedName === 'alpha' ||
    normalizedName.startsWith('alpha_') ||
    normalizedName.endsWith('_alpha') ||
    normalizedName.includes('transparent')
  ) {
    return 'opacity'
  }

  return null
}

const hasStandaloneOrmToken = (value) => (
  value === 'orm' ||
  value.startsWith('orm.') ||
  value.endsWith('_orm') ||
  value.includes('_orm_')
)

const canonicalTextureType = (value) => {
  const normalizedValue = String(value ?? '').trim().toLowerCase()

  switch (normalizedValue) {
    case 'basecolor':
    case 'base_color':
    case 'base color':
    case 'albedo':
    case 'diffuse':
      return 'baseColor'
    case 'emissive':
    case 'emission':
      return 'emissive'
    case 'normal':
      return 'normal'
    case 'ao':
    case 'ambientocclusion':
    case 'ambient_occlusion':
    case 'occlusion':
      return 'ao'
    case 'metalness':
    case 'metallic':
    case 'metal':
      return 'metalness'
    case 'roughness':
    case 'rough':
      return 'roughness'
    case 'orm':
    case 'rmao':
    case 'r+m+ao':
    case 'occlusionroughnessmetallic':
    case 'occlusion_roughness_metallic':
      return 'orm'
    case 'opacity':
    case 'alpha':
    case 'transparent':
    case 'transparency':
      return 'opacity'
    default:
      return null
  }
}

const normalizeTextureAssignment = (value) => {
  const normalizedValue = String(value ?? '').trim().toLowerCase()
  if (!normalizedValue || normalizedValue === 'auto') {
    return null
  }

  if (normalizedValue === 'none') {
    return 'none'
  }

  return canonicalTextureType(normalizedValue)
}

const normalizeTextureAssignmentRecord = (value) => {
  if (typeof value === 'string') {
    const textureType = normalizeTextureAssignment(value)
    if (!textureType) {
      return null
    }

    return {
      textureType,
      useAlphaAsOpacity: false
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const textureType = normalizeTextureAssignment(value.textureType)
  const useAlphaAsOpacity = value.useAlphaAsOpacity === true && (textureType === null || textureType === 'baseColor')

  if (!textureType && !useAlphaAsOpacity) {
    return null
  }

  return {
    textureType,
    useAlphaAsOpacity
  }
}

const normalizeUVSetAssignmentRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const materialNameHint = String(value.materialNameHint ?? '').trim()
  const renderProfile = normalizeUVSetRenderProfile(value.renderProfile)
  if (!materialNameHint && !renderProfile) {
    return null
  }

  return {
    materialNameHint,
    ...(renderProfile ? { renderProfile } : {})
  }
}

const normalizeUVSetRenderProfile = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const alphaMode = String(value.alphaMode ?? '').trim().toLowerCase()
  const side = String(value.side ?? '').trim().toLowerCase()
  const depthWrite = String(value.depthWrite ?? '').trim().toLowerCase()
  const depthTest = String(value.depthTest ?? '').trim().toLowerCase()
  const alphaCutoff = Number(value.alphaCutoff)
  const renderOrder = Number(value.renderOrder)
  const profile = {}

  if (['opaque', 'cutout', 'blend'].includes(alphaMode)) {
    profile.alphaMode = alphaMode
  }
  if (['front', 'double'].includes(side)) {
    profile.side = side
  }
  if (['on', 'off'].includes(depthWrite)) {
    profile.depthWrite = depthWrite
  }
  if (['on', 'off'].includes(depthTest)) {
    profile.depthTest = depthTest
  }
  if (Number.isFinite(alphaCutoff) && alphaCutoff > 0 && alphaCutoff <= 1) {
    profile.alphaCutoff = alphaCutoff
  }
  if (Number.isFinite(renderOrder) && renderOrder >= -1000 && renderOrder <= 1000) {
    profile.renderOrder = Math.trunc(renderOrder)
  }

  return Object.keys(profile).length ? profile : null
}

const resolveTextureType = (fileName, absolutePath, textureAssignments) => {
  const sourceRelativePath = getSourceRelativePath(absolutePath)
  const detectedType = classifyTexture(fileName)
  const assignment = textureAssignments.files[sourceRelativePath] ?? null

  if (assignment?.textureType === 'none') {
    return {
      effectiveType: null,
      useAlphaAsOpacity: false
    }
  }

  const effectiveType = assignment?.textureType ?? detectedType

  return {
    effectiveType,
    useAlphaAsOpacity: assignment?.useAlphaAsOpacity === true && effectiveType === 'baseColor'
  }
}

const inferMaterialNameHint = (fileNames) => {
  for (const fileName of fileNames) {
    const match = fileName.match(/_(\d{2})\s-\sDefault/i)
    if (match) {
      return `M_${match[1]}___Default`
    }
  }

  return null
}

const listFiles = (dirPath) => fs.readdirSync(dirPath, { withFileTypes: true })

const getTextureOptimizationOptions = (textureType) => {
  if (textureType === 'baseColor' || textureType === 'emissive') {
    return {
      quality: 82,
      alphaQuality: 92,
      effort: 6,
      smartSubsample: true
    }
  }

  return {
    lossless: true,
    effort: 6
  }
}

const normalizeUVSetRelativePath = (relativePath = '') => {
  const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '').trim()
  if (!normalizedPath || normalizedPath === '.') {
    return ''
  }

  return normalizedPath
}

const buildUVSetAssignmentKey = (modelId, relativePath = '') => {
  const normalizedPath = normalizeUVSetRelativePath(relativePath)
  return normalizedPath
    ? toPosixPath(path.posix.join(modelId, normalizedPath))
    : modelId
}

const resolveManualMaterialNameHint = (textureAssignments, modelId, relativePath = '') => (
  textureAssignments?.uvSets?.[buildUVSetAssignmentKey(modelId, relativePath)]?.materialNameHint ?? ''
)

const resolveManualRenderProfile = (textureAssignments, modelId, relativePath = '') => (
  textureAssignments?.uvSets?.[buildUVSetAssignmentKey(modelId, relativePath)]?.renderProfile ?? null
)

const collectOptimizableTextureFiles = (dirPath, textureAssignments, queue = []) => {
  for (const entry of listFiles(dirPath)) {
    const absolutePath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      collectOptimizableTextureFiles(absolutePath, textureAssignments, queue)
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!optimizableImageExtensions.has(ext)) {
      continue
    }

    const sourceRelativePath = getSourceRelativePath(absolutePath)
    const [modelId] = sourceRelativePath.split('/')
    if (!optimizedTextureModelIds.has(modelId)) {
      continue
    }

    const resolution = resolveTextureType(entry.name, absolutePath, textureAssignments)
    if (!resolution.effectiveType) {
      continue
    }

    const stat = fs.statSync(absolutePath)
    if (stat.size < minimumOptimizableTextureBytes) {
      continue
    }

    queue.push({
      absolutePath,
      sourceRelativePath,
      textureType: resolution.effectiveType,
      originalSize: stat.size
    })
  }

  return queue
}

const optimizeCopiedTextureAssets = async () => {
  if (!sharp) {
    console.warn('[sync:gltf] sharp not available, skipped texture optimization step')
    return
  }

  const textureAssignments = readTextureAssignments()
  const candidates = collectOptimizableTextureFiles(sourceDir, textureAssignments)

  for (const candidate of candidates) {
    const optimizedTargetPath = toOptimizedTargetPath(candidate.absolutePath)
    const optimizedPublicPath = toOptimizedPublicAssetPath(candidate.absolutePath)

    try {
      await sharp(candidate.absolutePath)
        .webp(getTextureOptimizationOptions(candidate.textureType))
        .toFile(optimizedTargetPath)

      const optimizedSize = fs.statSync(optimizedTargetPath).size
      if (optimizedSize >= candidate.originalSize) {
        fs.rmSync(optimizedTargetPath, { force: true })
        continue
      }

      optimizedTexturePublicPaths.set(candidate.sourceRelativePath, optimizedPublicPath)
      optimizedTextureCount += 1
      optimizedTextureSavedBytes += candidate.originalSize - optimizedSize

      console.log(
        `[sync:gltf] Optimized ${candidate.sourceRelativePath} (${formatBytes(candidate.originalSize)} -> ${formatBytes(optimizedSize)})`
      )
    } catch (error) {
      console.warn(`[sync:gltf] Failed to optimize ${candidate.sourceRelativePath}: ${error.message}`)
    }
  }
}

const selectModelFileEntry = (entries, modelId, extraPreferredFileNames = []) => entries
  .filter((entry) => entry.isFile() && modelExtensions.includes(path.extname(entry.name).toLowerCase()))
  .slice()
  .sort((left, right) => {
    const localPreferredModelFileNames = [
      ...extraPreferredFileNames.map((fileName) => fileName.toLowerCase()),
      ...getPreferredModelFileNames(modelId)
    ]
    const leftName = left.name.toLowerCase()
    const rightName = right.name.toLowerCase()
    const leftPreferredIndex = localPreferredModelFileNames.indexOf(leftName)
    const rightPreferredIndex = localPreferredModelFileNames.indexOf(rightName)

    if (leftPreferredIndex !== rightPreferredIndex) {
      if (leftPreferredIndex === -1) {
        return 1
      }

      if (rightPreferredIndex === -1) {
        return -1
      }

      return leftPreferredIndex - rightPreferredIndex
    }

    const leftExtIndex = modelExtensionPriority.indexOf(path.extname(left.name).toLowerCase())
    const rightExtIndex = modelExtensionPriority.indexOf(path.extname(right.name).toLowerCase())
    if (leftExtIndex !== rightExtIndex) {
      return leftExtIndex - rightExtIndex
    }

    return leftName.localeCompare(rightName, 'en')
  })[0]

const collectTextureMaps = (textureDir, textureAssignments) => {
  const textures = {}
  const textureOptions = {}
  const textureFileNames = []

  for (const textureEntry of listFiles(textureDir)) {
    if (!textureEntry.isFile()) {
      continue
    }

    const texturePath = path.join(textureDir, textureEntry.name)
    const ext = path.extname(textureEntry.name).toLowerCase()
    if (!allowedExtensions.has(ext)) {
      continue
    }

    textureFileNames.push(textureEntry.name)

    const resolution = resolveTextureType(textureEntry.name, texturePath, textureAssignments)
    if (resolution.effectiveType) {
      textures[resolution.effectiveType] = toTexturePublicAssetPath(texturePath)
      if (resolution.useAlphaAsOpacity) {
        textureOptions[resolution.effectiveType] = {
          useAlphaAsOpacity: true
        }
      }
    }
  }

  return {
    textures,
    textureOptions: Object.keys(textureOptions).length > 0 ? textureOptions : undefined,
    textureFileNames
  }
}

const hasCollectedTextureMaps = (textureSet) => Object.keys(textureSet?.textures ?? {}).length > 0

installNodeTextureInspectionShim()
const fbxLoader = new FBXLoader()
const modelInspectionCache = new Map()
const textDecoder = new TextDecoder()

const inspectSceneObject = (rootObject) => {
  const materialSlotMap = new Map()
  let meshCount = 0
  let meshWithUvCount = 0
  let meshWithUv2Count = 0

  rootObject?.traverse?.((child) => {
    if (!child?.isMesh) {
      return
    }

    meshCount += 1
    if (child.geometry?.attributes?.uv) {
      meshWithUvCount += 1
    }
    if (child.geometry?.attributes?.uv2) {
      meshWithUv2Count += 1
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      const name = `${material?.name ?? ''}`.trim() || '(unnamed)'
      const normalizedName = normalizeMaterialSlotName(name)
      const existingSlot = materialSlotMap.get(name)
      if (existingSlot) {
        existingSlot.meshCount += 1
        return
      }

      materialSlotMap.set(name, {
        name,
        normalizedName,
        meshCount: 1
      })
    })
  })

  return {
    meshCount,
    meshWithUvCount,
    meshWithUv2Count,
    uvCoverage: meshCount > 0 ? meshWithUvCount / meshCount : 0,
    uv2Coverage: meshCount > 0 ? meshWithUv2Count / meshCount : 0,
    materialSlots: Array.from(materialSlotMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'en'))
  }
}

const inspectGltfLikeFile = (absolutePath) => {
  const ext = path.extname(absolutePath).toLowerCase()
  let json

  if (ext === '.gltf') {
    json = JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
  } else {
    const buffer = fs.readFileSync(absolutePath)
    if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546C67) {
      throw new Error('invalid glb header')
    }

    let offset = 12
    let jsonChunk = null
    while (offset + 8 <= buffer.length) {
      const chunkLength = buffer.readUInt32LE(offset)
      const chunkType = buffer.readUInt32LE(offset + 4)
      const chunkStart = offset + 8
      const chunkEnd = chunkStart + chunkLength
      if (chunkEnd > buffer.length) {
        throw new Error('invalid glb chunk length')
      }

      if (chunkType === 0x4E4F534A) {
        jsonChunk = buffer.subarray(chunkStart, chunkEnd)
        break
      }

      offset = chunkEnd
    }

    if (!jsonChunk) {
      throw new Error('glb json chunk not found')
    }

    json = JSON.parse(textDecoder.decode(jsonChunk).replace(/\u0000+$/g, ''))
  }

  const materialSlotMap = new Map()
  let meshCount = 0
  let meshWithUvCount = 0
  let meshWithUv2Count = 0
  const materials = Array.isArray(json?.materials) ? json.materials : []
  const meshes = Array.isArray(json?.meshes) ? json.meshes : []

  for (const mesh of meshes) {
    for (const primitive of mesh?.primitives ?? []) {
      meshCount += 1
      const attributes = primitive?.attributes ?? {}
      if (Object.prototype.hasOwnProperty.call(attributes, 'TEXCOORD_0')) {
        meshWithUvCount += 1
      }
      if (Object.prototype.hasOwnProperty.call(attributes, 'TEXCOORD_1')) {
        meshWithUv2Count += 1
      }

      const materialIndex = Number.isInteger(primitive?.material) ? primitive.material : -1
      const material = materialIndex >= 0 ? materials[materialIndex] : null
      const name = `${material?.name ?? ''}`.trim() || '(unnamed)'
      const normalizedName = normalizeMaterialSlotName(name)
      const existingSlot = materialSlotMap.get(name)
      if (existingSlot) {
        existingSlot.meshCount += 1
      } else {
        materialSlotMap.set(name, {
          name,
          normalizedName,
          meshCount: 1
        })
      }
    }
  }

  return {
    meshCount,
    meshWithUvCount,
    meshWithUv2Count,
    uvCoverage: meshCount > 0 ? meshWithUvCount / meshCount : 0,
    uv2Coverage: meshCount > 0 ? meshWithUv2Count / meshCount : 0,
    materialSlots: Array.from(materialSlotMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'en'))
  }
}

const inspectModelFile = async (absolutePath) => {
  const normalizedPath = path.resolve(absolutePath)
  if (modelInspectionCache.has(normalizedPath)) {
    return modelInspectionCache.get(normalizedPath)
  }

  const ext = path.extname(normalizedPath).toLowerCase()
  let inspection

  try {
    if (ext === '.fbx') {
      const buffer = fs.readFileSync(normalizedPath)
      const object = fbxLoader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
      inspection = inspectSceneObject(object)
    } else if (ext === '.glb' || ext === '.gltf') {
      inspection = inspectGltfLikeFile(normalizedPath)
    } else {
      inspection = null
    }
  } catch (error) {
    inspection = {
      error: error?.message ?? String(error),
      meshCount: 0,
      meshWithUvCount: 0,
      meshWithUv2Count: 0,
      uvCoverage: 0,
      uv2Coverage: 0,
      materialSlots: []
    }
  }

  modelInspectionCache.set(normalizedPath, inspection)
  return inspection
}

const getUvSetNormalizedHints = (uvSets) => {
  const values = new Set()
  for (const uvSet of uvSets) {
    const hint = normalizeMaterialSlotName(uvSet?.materialNameHint)
    if (hint) {
      values.add(hint)
    }
  }
  return values
}

const hasTextureMaps = (uvSet) => Object.keys(uvSet?.textures ?? {}).length > 0

const getMaterialSlotByNormalizedName = (materialSlots = [], normalizedName = '') => {
  if (!normalizedName) {
    return null
  }

  return materialSlots.find((slot) => normalizeMaterialSlotName(slot?.name) === normalizedName || slot?.normalizedName === normalizedName) ?? null
}

const withRuntimeMaterialHints = (uvSets, inspection) => {
  const materialSlots = inspection?.materialSlots ?? []
  const texturedUvSets = uvSets.filter(hasTextureMaps)
  if (materialSlots.length === 0 || texturedUvSets.length === 0) {
    return uvSets
  }

  return uvSets.map((uvSet) => {
    if (!hasTextureMaps(uvSet)) {
      return uvSet
    }

    const normalizedHint = normalizeMaterialSlotName(uvSet.materialNameHint)
    const matchedSlot = getMaterialSlotByNormalizedName(materialSlots, normalizedHint)
    if (matchedSlot) {
      const slotName = matchedSlot.name
      if (slotName && slotName !== uvSet.materialNameHint) {
        return {
          ...uvSet,
          materialNameHint: slotName,
          materialHintSource: uvSet.materialHintSource === 'manual'
            ? 'manual-runtime'
            : 'runtime'
        }
      }

      return uvSet
    }

    if (materialSlots.length === 1 && texturedUvSets.length === 1) {
      return {
        ...uvSet,
        materialNameHint: materialSlots[0].name,
        materialHintSource: uvSet.materialHintSource === 'manual'
          ? 'manual-runtime-single'
          : 'runtime-single'
      }
    }

    return uvSet
  })
}

const scoreModelInspection = (inspection, uvSets, entryName, preferredNames) => {
  const normalizedHints = getUvSetNormalizedHints(uvSets)
  const matchedMaterialSlotCount = inspection?.materialSlots?.filter((slot) => normalizedHints.has(slot.normalizedName)).length ?? 0
  const preferredIndex = preferredNames.indexOf(entryName.toLowerCase())
  const preferredScore = preferredIndex === -1 ? 0 : Math.max(0, preferredNames.length - preferredIndex)

  return (
    (inspection?.uvCoverage ?? 0) * 1000 +
    matchedMaterialSlotCount * 100 +
    (inspection?.meshWithUv2Count ?? 0) * 0.001 +
    preferredScore
  )
}

const resolveMaterialNameHint = (modelId, uvSetRelativePath, textureSet) => {
  const uvSetId = normalizeUVSetRelativePath(uvSetRelativePath).split('/').filter(Boolean).at(-1) ?? ''
  const manualHint = resolveManualMaterialNameHint(textureSet.textureAssignments, modelId, uvSetRelativePath)
  if (manualHint) {
    return {
      value: manualHint,
      source: 'manual'
    }
  }

  if (modelId === 'LiuYun') {
    if (uvSetId === 'cc') {
      return {
        value: 'M_01___Default',
        source: 'preset'
      }
    }

    if (uvSetId === 'mt') {
      return {
        value: 'M_02___Default',
        source: 'preset'
      }
    }
  }

  const inferredHint = inferMaterialNameHint(textureSet.textureFileNames)
  return inferredHint
    ? {
        value: inferredHint,
        source: 'inferred'
      }
    : {
        value: null,
        source: ''
      }
}

const createUvSetConfig = (modelId, id, directorySegments, textureSet) => {
  const uvSetRelativePath = directorySegments.slice(1).join('/')
  const materialHint = resolveMaterialNameHint(modelId, uvSetRelativePath, textureSet)
  const renderProfile = resolveManualRenderProfile(textureSet.textureAssignments, modelId, uvSetRelativePath)

  return {
    id,
    label: `UV ${id}`,
    directory: `/gltf/${directorySegments.map((segment) => toPosixPath(segment)).join('/')}`,
    materialNameHint: materialHint.value,
    materialHintSource: materialHint.source,
    textures: textureSet.textures,
    textureOptions: textureSet.textureOptions,
    ...(renderProfile ? { renderProfile } : {})
  }
}

const buildUvSets = (modelId, modelDir, basePathSegments, textureAssignments) => {
  const childEntries = listFiles(modelDir)
  const directTextureSet = {
    ...collectTextureMaps(modelDir, textureAssignments),
    textureAssignments
  }
  const directUvSetId = basePathSegments[basePathSegments.length - 1] ?? modelId
  const directUvSets = hasCollectedTextureMaps(directTextureSet)
    ? [createUvSetConfig(modelId, directUvSetId, basePathSegments, directTextureSet)]
    : []

  const nestedUvSets = childEntries
    .filter((childEntry) => childEntry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((childEntry) => {
      const uvDir = path.join(modelDir, childEntry.name)
      const childTextureSet = {
        ...collectTextureMaps(uvDir, textureAssignments),
        textureAssignments
      }

      if (hasCollectedTextureMaps(childTextureSet)) {
        return [createUvSetConfig(modelId, childEntry.name, [...basePathSegments, childEntry.name], childTextureSet)]
      }

      return listFiles(uvDir)
        .filter((nestedEntry) => nestedEntry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name, 'en'))
        .map((nestedEntry) => {
          const nestedUvDir = path.join(uvDir, nestedEntry.name)
          const nestedTextureSet = {
            ...collectTextureMaps(nestedUvDir, textureAssignments),
            textureAssignments
          }

          if (!hasCollectedTextureMaps(nestedTextureSet)) {
            return null
          }

          return createUvSetConfig(
            modelId,
            `${childEntry.name}/${nestedEntry.name}`,
            [...basePathSegments, childEntry.name, nestedEntry.name],
            nestedTextureSet
          )
        })
        .filter(Boolean)
    })

  return [...directUvSets, ...nestedUvSets]
}

const buildSingleModelConfig = async (
  modelId,
  modelDir,
  modelFileEntry,
  textureAssignments,
  basePathSegments = [modelId],
  modelFileBaseDir = modelDir
) => {
  const modelFilePath = path.join(modelFileBaseDir, modelFileEntry.name)
  const uvSets = buildUvSets(modelId, modelDir, basePathSegments, textureAssignments)
  const inspection = await inspectModelFile(modelFilePath)
  const runtimeUvSets = withRuntimeMaterialHints(uvSets, inspection)

  return {
    id: modelId,
    label: modelId,
    model: {
      format: path.extname(modelFileEntry.name).slice(1).toLowerCase(),
      path: toPublicAssetPath(modelFilePath)
    },
    defaultUvSetId: runtimeUvSets[0]?.id ?? null,
    uvSets: runtimeUvSets,
    runtime: {
      materialSlots: inspection?.materialSlots ?? [],
      meshCount: inspection?.meshCount ?? 0,
      meshWithUvCount: inspection?.meshWithUvCount ?? 0,
      meshWithUv2Count: inspection?.meshWithUv2Count ?? 0,
      uvCoverage: inspection?.uvCoverage ?? 0,
      uv2Coverage: inspection?.uv2Coverage ?? 0,
      inspectionError: inspection?.error ?? ''
    }
  }
}

const resolveNestedSingleModelConfig = async (modelId, modelDir, textureAssignments) => {
  const childDirectories = listFiles(modelDir)
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))

  const nestedCandidates = childDirectories
    .map((childEntry) => {
      const childDir = path.join(modelDir, childEntry.name)
      const nestedModelFileEntry = selectModelFileEntry(listFiles(childDir), modelId)

      if (!nestedModelFileEntry) {
        return null
      }

      return {
        childDir,
        childEntry,
        nestedModelFileEntry
      }
    })
    .filter(Boolean)

  if (nestedCandidates.length !== 1) {
    return null
  }

  const [{ childDir, childEntry, nestedModelFileEntry }] = nestedCandidates

  return buildSingleModelConfig(
    modelId,
    childDir,
    nestedModelFileEntry,
    textureAssignments,
    [modelId, childEntry.name],
    childDir
  )
}

const copySupportedAssets = (fromDir, toDir) => {
  const entries = listFiles(fromDir)

  for (const entry of entries) {
    const fromPath = path.join(fromDir, entry.name)
    const toPath = path.join(toDir, entry.name)

    if (entry.isDirectory()) {
      // 递归复制时保留源目录的层级结构。
      fs.mkdirSync(toPath, { recursive: true })
      copySupportedAssets(fromPath, toPath)
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!allowedExtensions.has(ext)) {
      continue
    }

    fs.copyFileSync(fromPath, toPath)
    copiedCount += 1
  }
}

const chooseBestModelFileEntry = async (entries, modelId, uvSets, resolveAbsolutePath, extraPreferredFileNames = []) => {
  const candidates = entries
    .filter((entry) => entry.isFile() && modelExtensions.includes(path.extname(entry.name).toLowerCase()))
    .slice()

  if (candidates.length === 0) {
    return { selected: null, candidates: [] }
  }

  const preferredNames = [
    ...extraPreferredFileNames.map((fileName) => fileName.toLowerCase()),
    ...getPreferredModelFileNames(modelId)
  ]

  const inspectedCandidates = []
  for (const entry of candidates) {
    const absolutePath = resolveAbsolutePath(entry)
    const inspection = await inspectModelFile(absolutePath)
    inspectedCandidates.push({
      entry,
      inspection,
      score: scoreModelInspection(inspection, uvSets, entry.name, preferredNames)
    })
  }

  inspectedCandidates.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score
    }

    const leftPreferredIndex = preferredNames.indexOf(left.entry.name.toLowerCase())
    const rightPreferredIndex = preferredNames.indexOf(right.entry.name.toLowerCase())
    if (leftPreferredIndex !== rightPreferredIndex) {
      if (leftPreferredIndex === -1) {
        return 1
      }
      if (rightPreferredIndex === -1) {
        return -1
      }
      return leftPreferredIndex - rightPreferredIndex
    }

    return left.entry.name.localeCompare(right.entry.name, 'en')
  })

  return {
    selected: inspectedCandidates[0]?.entry ?? null,
    candidates: inspectedCandidates.map((candidate) => ({
      fileName: candidate.entry.name,
      format: path.extname(candidate.entry.name).slice(1).toLowerCase(),
      path: toPublicAssetPath(path.join(sourceDir, modelId, candidate.entry.name)),
      score: candidate.score,
      materialSlots: candidate.inspection?.materialSlots ?? [],
      meshCount: candidate.inspection?.meshCount ?? 0,
      meshWithUvCount: candidate.inspection?.meshWithUvCount ?? 0,
      meshWithUv2Count: candidate.inspection?.meshWithUv2Count ?? 0,
      uvCoverage: candidate.inspection?.uvCoverage ?? 0,
      uv2Coverage: candidate.inspection?.uv2Coverage ?? 0,
      inspectionError: candidate.inspection?.error ?? ''
    }))
  }
}

const buildModelManifest = async () => {
  const textureAssignments = readTextureAssignments()
  const topLevelEntries = listFiles(sourceDir)
  const models = []

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const modelDir = path.join(sourceDir, entry.name)
    const childEntries = listFiles(modelDir)
    const uvSets = buildUvSets(entry.name, modelDir, [entry.name], textureAssignments)
    const runtimeSelection = forceCompositeModelIds.has(entry.name)
      ? { selected: null, candidates: [] }
      : await chooseBestModelFileEntry(
        childEntries,
        entry.name,
        uvSets,
        (candidateEntry) => path.join(modelDir, candidateEntry.name)
      )
    const modelFileEntry = runtimeSelection.selected

    if (modelFileEntry) {
      const modelConfig = await buildSingleModelConfig(entry.name, modelDir, modelFileEntry, textureAssignments)
      modelConfig.runtime = {
        ...(modelConfig.runtime ?? {}),
        candidates: runtimeSelection.candidates
      }
      models.push(modelConfig)
      continue
    }

    const nestedSingleModelConfig = await resolveNestedSingleModelConfig(entry.name, modelDir, textureAssignments)
    if (nestedSingleModelConfig) {
      models.push(nestedSingleModelConfig)
      continue
    }

    const partConfigs = childEntries
      .filter((childEntry) => childEntry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .map(async (childEntry) => {
        const partDir = path.join(modelDir, childEntry.name)
        const partEntries = listFiles(partDir)
        const partUvSets = buildUvSets(entry.name, partDir, [entry.name, childEntry.name], textureAssignments)
        const siblingPartModelEntries = childEntries.filter((partEntry) => (
          partEntry.isFile()
          && modelExtensions.includes(path.extname(partEntry.name).toLowerCase())
          && path.basename(partEntry.name, path.extname(partEntry.name)).toLowerCase() === childEntry.name.toLowerCase()
        ))
        const runtimeSelection = await chooseBestModelFileEntry(
          [...partEntries, ...siblingPartModelEntries],
          entry.name,
          partUvSets,
          (candidateEntry) => {
            const usesSiblingPartModel = siblingPartModelEntries.includes(candidateEntry)
            return path.join(usesSiblingPartModel ? modelDir : partDir, candidateEntry.name)
          },
          [
            ...getPreferredCompositePartFileNames(entry.name, childEntry.name),
            `${childEntry.name}.glb`,
            `${childEntry.name}.fbx`,
            `${childEntry.name}.gltf`
          ]
        )
        const partModelFileEntry = runtimeSelection.selected

        if (!partModelFileEntry) {
          return null
        }

        const usesSiblingPartModel = siblingPartModelEntries.includes(partModelFileEntry)
        const partConfig = await buildSingleModelConfig(
          entry.name,
          partDir,
          partModelFileEntry,
          textureAssignments,
          [entry.name, childEntry.name],
          usesSiblingPartModel ? modelDir : partDir
        )

        return {
          ...partConfig,
          runtime: {
            ...(partConfig.runtime ?? {}),
            candidates: runtimeSelection.candidates
          },
          id: childEntry.name,
          label: childEntry.name
        }
      })
    const resolvedPartConfigs = (await Promise.all(partConfigs)).filter(Boolean)

    if (resolvedPartConfigs.length === 0) {
      continue
    }

    const mergedMaterialSlots = new Map()
    let mergedMeshCount = 0
    let mergedMeshWithUvCount = 0
    let mergedMeshWithUv2Count = 0
    for (const part of resolvedPartConfigs) {
      const partRuntime = part.runtime ?? {}
      mergedMeshCount += partRuntime.meshCount ?? 0
      mergedMeshWithUvCount += partRuntime.meshWithUvCount ?? 0
      mergedMeshWithUv2Count += partRuntime.meshWithUv2Count ?? 0
      for (const slot of partRuntime.materialSlots ?? []) {
        const key = `${slot.name ?? ''}`
        const existingSlot = mergedMaterialSlots.get(key)
        if (existingSlot) {
          existingSlot.meshCount += slot.meshCount ?? 0
        } else {
          mergedMaterialSlots.set(key, { ...slot })
        }
      }
    }

    models.push({
      id: entry.name,
      label: entry.name,
      model: resolvedPartConfigs[0].model,
      defaultUvSetId: null,
      uvSets: [],
      parts: resolvedPartConfigs,
      runtime: {
        materialSlots: Array.from(mergedMaterialSlots.values()).sort((left, right) => left.name.localeCompare(right.name, 'en')),
        meshCount: mergedMeshCount,
        meshWithUvCount: mergedMeshWithUvCount,
        meshWithUv2Count: mergedMeshWithUv2Count,
        uvCoverage: mergedMeshCount > 0 ? mergedMeshWithUvCount / mergedMeshCount : 0,
        uv2Coverage: mergedMeshCount > 0 ? mergedMeshWithUv2Count / mergedMeshCount : 0,
        inspectionError: '',
        candidates: []
      }
    })
  }

  models.sort((left, right) => left.id.localeCompare(right.id, 'en'))

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      assetRoot: toPosixPath(path.relative(frontendDir, sourceDir)),
      publicRoot: 'public/gltf'
    },
    primaryModelId: models.find((model) => model.id === preferredPrimaryModelId)?.id ?? models[0]?.id ?? null,
    models
  }
}

copySupportedAssets(sourceDir, targetDir)
await optimizeCopiedTextureAssets()

const manifest = await buildModelManifest()
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

if (manifest.models.length === 0) {
  console.warn(`[sync:gltf] No model directories found under ${sourceDir}`)
}

console.log(
  `[sync:gltf] Copied ${copiedCount} asset(s) and wrote manifest for ${manifest.models.length} model(s) from ${sourceDir} to ${targetDir}`
)

if (optimizedTextureCount > 0) {
  console.log(
    `[sync:gltf] Generated ${optimizedTextureCount} optimized texture(s), saved ${formatBytes(optimizedTextureSavedBytes)}`
  )
}
