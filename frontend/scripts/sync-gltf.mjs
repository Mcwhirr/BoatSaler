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

const getPreferredModelFileNames = (modelId) => {
  if (modelId === 'Yacht') {
    return ['950.fbx', '950.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  if (modelId === 'PleasureBoat1') {
    return ['11.fbx', '11.glb', ...preferredModelFileNames].map((fileName) => fileName.toLowerCase())
  }

  return preferredModelFileNames.map((fileName) => fileName.toLowerCase())
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

const classifyTexture = (fileName) => {
  const normalizedName = fileName.toLowerCase()

  if (normalizedName.includes('basecolor') || normalizedName.includes('base_color') || normalizedName.includes('albedo')) {
    return 'baseColor'
  }

  if (normalizedName.includes('emissive')) {
    return 'emissive'
  }

  if (normalizedName.includes('normal')) {
    return 'normal'
  }

  if (normalizedName === 'ao.png' || normalizedName.startsWith('ao_') || normalizedName.includes('ambientocclusion')) {
    return 'ao'
  }

  if (normalizedName.includes('roughness') || normalizedName.startsWith('rou')) {
    return 'roughness'
  }

  if (normalizedName.includes('metallic') || normalizedName.includes('metalness') || normalizedName.startsWith('meti')) {
    return 'metalness'
  }

  return null
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
  const topLevelEntries = listFiles(sourceDir)
  const models = []

  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const modelDir = path.join(sourceDir, entry.name)
    const childEntries = listFiles(modelDir)
    const modelFileCandidates = childEntries.filter((childEntry) => {
      if (!childEntry.isFile()) {
        return false
      }

      return modelExtensions.includes(path.extname(childEntry.name).toLowerCase())
    })

    const modelFileEntry = modelFileCandidates
      .slice()
      .sort((left, right) => {
        const localPreferredModelFileNames = getPreferredModelFileNames(entry.name)
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

    if (!modelFileEntry) {
      continue
    }

    const modelFilePath = path.join(modelDir, modelFileEntry.name)
    const uvSets = childEntries
      .filter((childEntry) => childEntry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .map((childEntry) => {
        const uvDir = path.join(modelDir, childEntry.name)
        const textures = {}
        const textureFileNames = []

        for (const textureEntry of listFiles(uvDir)) {
          if (!textureEntry.isFile()) {
            continue
          }

          const texturePath = path.join(uvDir, textureEntry.name)
          const ext = path.extname(textureEntry.name).toLowerCase()
          if (!allowedExtensions.has(ext)) {
            continue
          }

          textureFileNames.push(textureEntry.name)

          const textureType = classifyTexture(textureEntry.name)
          if (textureType) {
            textures[textureType] = toPublicAssetPath(texturePath)
            continue
          }
        }

        return {
          id: childEntry.name,
          label: `UV ${childEntry.name}`,
          directory: `/gltf/${entry.name}/${childEntry.name}`,
          materialNameHint: inferMaterialNameHint(textureFileNames),
          textures
        }
      })

    models.push({
      id: entry.name,
      label: entry.name,
      model: {
        format: path.extname(modelFileEntry.name).slice(1).toLowerCase(),
        path: toPublicAssetPath(modelFilePath)
      },
      defaultUvSetId: uvSets[0]?.id ?? null,
      uvSets
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
