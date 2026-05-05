import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const manifestPath = path.resolve(scriptDir, '..', 'public', 'gltf', 'asset-manifest.json')

const normalizeMaterialName = (value) => {
  if (!value) {
    return ''
  }

  return `${value}`
    .toLowerCase()
    .replace(/^m[_\s-]*/, '')
    .replace(/[^a-z0-9]+/g, '')
}

const hasTextureMaps = (uvSet) => Object.keys(uvSet?.textures ?? {}).length > 0

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const failures = []

for (const model of manifest.models ?? []) {
  const nodes = [model, ...(model.parts ?? [])]

  for (const node of nodes) {
    const runtimeSlots = node.runtime?.materialSlots ?? []
    if (runtimeSlots.length === 0) {
      continue
    }

    const normalizedSlots = new Set(
      runtimeSlots
        .map((slot) => `${slot?.normalizedName ?? ''}`.trim() || normalizeMaterialName(slot?.name))
        .filter(Boolean)
    )

    for (const uvSet of node.uvSets ?? []) {
      if (!hasTextureMaps(uvSet)) {
        continue
      }

      const normalizedHint = normalizeMaterialName(uvSet.materialNameHint)
      if (!normalizedHint || normalizedSlots.has(normalizedHint)) {
        continue
      }

      failures.push(
        `${model.id}/${node.id}/${uvSet.id}: materialNameHint "${uvSet.materialNameHint}" does not match runtime slots [${Array.from(normalizedSlots).join(', ')}]`
      )
    }
  }
}

if (failures.length > 0) {
  console.error(`[material-bindings] ${failures.length} broken material binding(s):`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('[material-bindings] all textured UV sets match runtime material slots when slots are available')
