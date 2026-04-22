import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(frontendDir, '..')

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
const preferredModelFileNames = ['1.glb', '1.fbx', '2.glb', '2.fbx']
const modelExtensionPriority = ['.glb', '.gltf', '.fbx', '.obj']
const preferredPrimaryModelId = 'PleasureBoat1'
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

if (!fs.existsSync(sourceDir)) {
  console.warn(`[sync:gltf] Source directory not found: ${sourceDir}`)
  process.exit(0)
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })

let copiedCount = 0

const toPosixPath = (value) => value.replace(/\\/g, '/')

const toPublicAssetPath = (absolutePath) => `/gltf/${toPosixPath(path.relative(sourceDir, absolutePath))}`

const readTextureAssignments = () => {
  if (!fs.existsSync(textureAssignmentsPath)) {
    return { updatedAt: new Date().toISOString(), files: {} }
  }

  const raw = JSON.parse(fs.readFileSync(textureAssignmentsPath, 'utf8'))
  const files = {}

  for (const [relativePath, rawAssignment] of Object.entries(raw.files ?? {})) {
    const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '')
    const normalizedAssignment = normalizeTextureAssignment(rawAssignment)
    if (!normalizedPath || !normalizedAssignment) {
      continue
    }

    files[normalizedPath] = normalizedAssignment
  }

  return {
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    files
  }
}

const classifyTexture = (fileName) => {
  const normalizedName = fileName
    .slice(0, fileName.length - path.extname(fileName).length)
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')

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

  return null
}

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

const resolveTextureType = (fileName, absolutePath, textureAssignments) => {
  const sourceRelativePath = toPosixPath(path.relative(sourceDir, absolutePath))
  const detectedType = classifyTexture(fileName)
  const assignment = textureAssignments.files[sourceRelativePath] ?? null

  if (assignment === 'none') {
    return null
  }

  return assignment ?? detectedType
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

    const textureType = resolveTextureType(textureEntry.name, texturePath, textureAssignments)
    if (textureType) {
      textures[textureType] = toPublicAssetPath(texturePath)
    }
  }

  return {
    textures,
    textureFileNames
  }
}

const resolveMaterialNameHint = (modelId, uvSetId, textureSet) => {
  if (modelId === 'LiuYun') {
    if (uvSetId === 'cc') {
      return 'M_01___Default'
    }

    if (uvSetId === 'mt') {
      return 'M_02___Default'
    }
  }

  return inferMaterialNameHint(textureSet.textureFileNames)
}

const createUvSetConfig = (modelId, id, directorySegments, textureSet) => ({
  id,
  label: `UV ${id}`,
  directory: `/gltf/${directorySegments.map((segment) => toPosixPath(segment)).join('/')}`,
  materialNameHint: resolveMaterialNameHint(modelId, id, textureSet),
  textures: textureSet.textures
})

const buildUvSets = (modelId, modelDir, basePathSegments, textureAssignments) => {
  const childEntries = listFiles(modelDir)
  const directTextureSet = collectTextureMaps(modelDir, textureAssignments)
  const directUvSetId = basePathSegments[basePathSegments.length - 1] ?? modelId
  const directUvSets = directTextureSet.textureFileNames.length > 0
    ? [createUvSetConfig(modelId, directUvSetId, basePathSegments, directTextureSet)]
    : []

  const nestedUvSets = childEntries
    .filter((childEntry) => childEntry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((childEntry) => {
      const uvDir = path.join(modelDir, childEntry.name)
      const childTextureSet = collectTextureMaps(uvDir, textureAssignments)

      if (childTextureSet.textureFileNames.length > 0) {
        return [createUvSetConfig(modelId, childEntry.name, [...basePathSegments, childEntry.name], childTextureSet)]
      }

      return listFiles(uvDir)
        .filter((nestedEntry) => nestedEntry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name, 'en'))
        .map((nestedEntry) => {
          const nestedUvDir = path.join(uvDir, nestedEntry.name)
          const nestedTextureSet = collectTextureMaps(nestedUvDir, textureAssignments)

          if (nestedTextureSet.textureFileNames.length === 0) {
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

const buildSingleModelConfig = (
  modelId,
  modelDir,
  modelFileEntry,
  textureAssignments,
  basePathSegments = [modelId],
  modelFileBaseDir = modelDir
) => {
  const modelFilePath = path.join(modelFileBaseDir, modelFileEntry.name)
  const uvSets = buildUvSets(modelId, modelDir, basePathSegments, textureAssignments)

  return {
    id: modelId,
    label: modelId,
    model: {
      format: path.extname(modelFileEntry.name).slice(1).toLowerCase(),
      path: toPublicAssetPath(modelFilePath)
    },
    defaultUvSetId: uvSets[0]?.id ?? null,
    uvSets
  }
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

const buildModelManifest = () => {
  const textureAssignments = readTextureAssignments()
  const topLevelEntries = listFiles(sourceDir)
  const models = []

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const modelDir = path.join(sourceDir, entry.name)
    const childEntries = listFiles(modelDir)
    const modelFileEntry = forceCompositeModelIds.has(entry.name)
      ? null
      : selectModelFileEntry(childEntries, entry.name)

    if (modelFileEntry) {
      models.push(buildSingleModelConfig(entry.name, modelDir, modelFileEntry, textureAssignments))
      continue
    }

    const partConfigs = childEntries
      .filter((childEntry) => childEntry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .map((childEntry) => {
        const partDir = path.join(modelDir, childEntry.name)
        const partEntries = listFiles(partDir)
        const siblingPartModelEntries = childEntries.filter((partEntry) => (
          partEntry.isFile()
          && modelExtensions.includes(path.extname(partEntry.name).toLowerCase())
          && path.basename(partEntry.name, path.extname(partEntry.name)).toLowerCase() === childEntry.name.toLowerCase()
        ))
        const partModelFileEntry = selectModelFileEntry(
          [...partEntries, ...siblingPartModelEntries],
          entry.name,
          [
            ...getPreferredCompositePartFileNames(entry.name, childEntry.name),
            `${childEntry.name}.glb`,
            `${childEntry.name}.fbx`,
            `${childEntry.name}.gltf`
          ]
        )

        if (!partModelFileEntry) {
          return null
        }

        const usesSiblingPartModel = siblingPartModelEntries.includes(partModelFileEntry)

        return {
          ...buildSingleModelConfig(
            entry.name,
            partDir,
            partModelFileEntry,
            textureAssignments,
            [entry.name, childEntry.name],
            usesSiblingPartModel ? modelDir : partDir
          ),
          id: childEntry.name,
          label: childEntry.name
        }
      })
      .filter(Boolean)

    if (partConfigs.length === 0) {
      continue
    }

    models.push({
      id: entry.name,
      label: entry.name,
      model: partConfigs[0].model,
      defaultUvSetId: null,
      uvSets: [],
      parts: partConfigs
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

const manifest = buildModelManifest()
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

if (manifest.models.length === 0) {
  console.warn(`[sync:gltf] No model directories found under ${sourceDir}`)
}

console.log(
  `[sync:gltf] Copied ${copiedCount} asset(s) and wrote manifest for ${manifest.models.length} model(s) from ${sourceDir} to ${targetDir}`
)
