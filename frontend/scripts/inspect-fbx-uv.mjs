import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

const loader = new FBXLoader()
const modelUrl = 'file:///D:/Threejs/SalesBoat/gltf/Model314/1.fbx'

loader.load(
  modelUrl,
  (object3d) => {
    let meshCount = 0
    let meshWithUv = 0
    let meshWithUv1 = 0
    let meshWithUv2 = 0

    object3d.traverse((child) => {
      if (!child.isMesh) {
        return
      }

      meshCount += 1
      const attrs = child.geometry?.attributes ?? {}
      if (attrs.uv) {
        meshWithUv += 1
      }
      if (attrs.uv1) {
        meshWithUv1 += 1
      }
      if (attrs.uv2) {
        meshWithUv2 += 1
      }
    })

    console.log('meshCount:', meshCount)
    console.log('meshWithUv:', meshWithUv)
    console.log('meshWithUv1:', meshWithUv1)
    console.log('meshWithUv2:', meshWithUv2)
  },
  undefined,
  (error) => {
    console.error('Failed to parse FBX:', error)
    process.exitCode = 1
  }
)
