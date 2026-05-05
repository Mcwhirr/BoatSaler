import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(frontendDir, '..')
const siteContentPath = path.resolve(repoRoot, 'data', 'site-content.json')

const detailImagePathByModelId = {
  Cabnet: 'render-card.png',
  FireFighting: 'tbrender.png',
  LiuYun: 'tbrender.png',
  PleasureBoat: 'render-card.png',
  PleasureBoat1: '1.png',
  TestHigh: 'tbrender.png',
  TwoLayerBoat: 'render-card.png',
  Yacht: '1.png'
}

if (!fs.existsSync(siteContentPath)) {
  console.error(`[merge:detail-images] Missing site content file: ${siteContentPath}`)
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(siteContentPath, 'utf8'))
const nextContent = {
  ...raw,
  updatedAt: new Date().toISOString(),
  models: {
    ...(raw.models ?? {})
  }
}

for (const [modelId, detailImagePath] of Object.entries(detailImagePathByModelId)) {
  const currentModel = nextContent.models[modelId] ?? {}
  nextContent.models[modelId] = {
    ...currentModel,
    detailImagePath
  }
}

fs.writeFileSync(siteContentPath, `${JSON.stringify(nextContent, null, 2)}\n`, 'utf8')
console.log(`[merge:detail-images] Updated detailImagePath for ${Object.keys(detailImagePathByModelId).length} model(s).`)
