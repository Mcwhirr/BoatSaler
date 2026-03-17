import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

function updateOrthographicFrustum(camera, aspect, frustumHeight) {
  const safeAspect = Math.max(aspect, 0.01)
  const halfHeight = frustumHeight / 2
  const halfWidth = halfHeight * safeAspect

  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfHeight
  camera.bottom = -halfHeight
}

export default function ShipScene() {
  const assetBaseUrl = import.meta.env.BASE_URL
  const resolveAssetPath = (relativePath) => `${assetBaseUrl}${relativePath}`
  const canvasRef = useRef(null)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const modeRef = useRef('exterior')
  const interiorDeckRef = useRef('1')
  const setViewPresetRef = useRef(() => {})
  const [activeView, setActiveView] = useState('exterior')
  const [activeDeck, setActiveDeck] = useState('1')

  useEffect(() => {
    // 场景初始化：仅在组件挂载时执行一次。
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }

    // 创建 Three.js 场景、相机和渲染器。
    const scene = new THREE.Scene()

    const exteriorCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.005, 5000)
    const interiorCamera = new THREE.PerspectiveCamera(56, 1, 0.005, 5000)
    exteriorCamera.position.set(-6.2, 1.65, 1.7)
    exteriorCamera.zoom = 1.18
    interiorCamera.position.set(0, 0.68, -0.82)
    scene.add(exteriorCamera, interiorCamera)

    let activeCamera = exteriorCamera
    cameraRef.current = activeCamera

    // 基础照明设置：提高首屏亮度，并增加侧前方主光使轮廓更清晰。
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55)
    keyLight.position.set(4.2, 2.4, 3.4)
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.05)
    fillLight.position.set(-4.5, 4.2, -3.5)
    scene.add(ambientLight, keyLight, fillLight)
    // 辅助网格：用于调试和视觉参考，实际应用中可选择性移除。
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearAlpha(0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1

    // 给金属材质提供可见反射源（环境贴图），否则“金属度拉满”也会显得发灰。
    const pmremGenerator = new THREE.PMREMGenerator(renderer)
    const environmentTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environmentTexture

    // 交互控制：启用 OrbitControls 以支持鼠标旋转视角，禁用平移和缩放。
    const controls = new OrbitControls(exteriorCamera, canvas)
    controls.enableDamping = true
    controls.enablePan = false
    controls.enableZoom = false
    controls.target.set(0, 0.5, 0)
    controls.update()
    controlsRef.current = controls

    const interiorPose = {
      position: new THREE.Vector3(0, 0.68, -0.82),
      yaw: 0,
      pitch: 0,
      dragging: false,
      lastX: 0,
      lastY: 0
    }

    const interiorLookDirection = new THREE.Vector3()
    const interiorLookTarget = new THREE.Vector3()

    const updateInteriorOrientation = () => {
      interiorLookDirection.set(
        Math.sin(interiorPose.yaw) * Math.cos(interiorPose.pitch),
        Math.sin(interiorPose.pitch),
        Math.cos(interiorPose.yaw) * Math.cos(interiorPose.pitch)
      )
      interiorLookTarget.copy(interiorPose.position).add(interiorLookDirection)
      interiorCamera.position.copy(interiorPose.position)
      interiorCamera.lookAt(interiorLookTarget)
      interiorCamera.updateProjectionMatrix()
    }

    const onPointerDown = (event) => {
      if (modeRef.current !== 'interior') {
        return
      }

      interiorPose.dragging = true
      interiorPose.lastX = event.clientX
      interiorPose.lastY = event.clientY
    }

    const onPointerMove = (event) => {
      if (modeRef.current !== 'interior' || !interiorPose.dragging) {
        return
      }

      const deltaX = event.clientX - interiorPose.lastX
      const deltaY = event.clientY - interiorPose.lastY
      interiorPose.lastX = event.clientX
      interiorPose.lastY = event.clientY

      interiorPose.yaw -= deltaX * 0.004
      interiorPose.pitch -= deltaY * 0.003
      interiorPose.pitch = THREE.MathUtils.clamp(interiorPose.pitch, -1.25, 1.25)
      updateInteriorOrientation()
    }

    const onPointerUp = () => {
      interiorPose.dragging = false
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    const interiorDeckPresets = {
      '1': {
        position: new THREE.Vector3(0, 0, -0.66),
        yaw: 0,
        pitch: -0.08
      },
      '2': {
        position: new THREE.Vector3(0, 0.98, -0.66),
        yaw: 0,
        pitch: -0.08
      }
    }

    setViewPresetRef.current = (mode, deck = interiorDeckRef.current) => {
      modeRef.current = mode

      if (mode === 'interior') {
        activeCamera = interiorCamera
        cameraRef.current = interiorCamera
        controls.enabled = false

        const preset = interiorDeckPresets[deck] ?? interiorDeckPresets['1']
        interiorPose.position.copy(preset.position)
        interiorPose.yaw = preset.yaw
        interiorPose.pitch = preset.pitch
        updateInteriorOrientation()
      } else {
        activeCamera = exteriorCamera
        cameraRef.current = exteriorCamera
        controls.enabled = true
        exteriorCamera.position.set(-6.2, 1.65, 1.7)
        exteriorCamera.zoom = 1.18
        controls.target.set(0, 0.5, 0)
        exteriorCamera.updateProjectionMatrix()
        controls.update()
      }
    }

    setViewPresetRef.current('exterior')

    // 仅加载 TwoLayerBoat.glb。
    let loadedRoot = null
    const gltfLoader = new GLTFLoader()
    const textureLoader = new THREE.TextureLoader()
    const externalTextures = []

    const loadTextureAsync = (path) => new Promise((resolve, reject) => {
      textureLoader.load(path, resolve, undefined, reject)
    })

    const ensureAoUv = (mesh) => {
      const geometry = mesh.geometry
      if (!geometry?.attributes?.uv) {
        return
      }

      if (!geometry.attributes.uv2) {
        geometry.setAttribute('uv2', geometry.attributes.uv.clone())
      }
    }

    const applyM01MaterialMaps = (rootObject, maps) => {
      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          if (material?.name !== 'M_01___Default') {
            return
          }

          ensureAoUv(child)

          material.emissiveMap = maps.emissive
          material.normalMap = maps.normal
          material.aoMap = maps.ao
          material.metalnessMap = maps.metalness
          material.roughnessMap = maps.roughness
          material.metalness = 1
          material.roughness = 1
          material.normalScale = new THREE.Vector2(1, -1)
          material.needsUpdate = true
        })
      })
    }

    const applyM02MaterialMaps = (rootObject, maps) => {
      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          if (material?.name !== 'M_02___Default') {
            return
          }

          ensureAoUv(child)

          material.normalMap = maps.normal
          material.aoMap = maps.ao
          material.metalnessMap = maps.metalness
          material.roughnessMap = maps.roughness
          material.metalness = 1
          material.roughness = 1
          material.normalScale = new THREE.Vector2(1, -1)
          material.needsUpdate = true
        })
      })
    }

    gltfLoader.load(
      resolveAssetPath('gltf/TwoLayerBoat/TwoLayerBoat.glb'),
      async (gltf) => {
        const object3d = gltf.scene ?? gltf.scenes?.[0]
        if (!object3d) {
          console.error('TwoLayerBoat.glb does not contain a scene root.')
          return
        }

        try {
          const [emissive, normal, ao, metalness, roughness, normal2, ao2, metalness2, roughness2] = await Promise.all([
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/1/1_01 - Default_Emissive.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/1/1_01 - Default_Normal.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/1/AO.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/1/meti.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/1/rou.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/2/1_02 - Default_Normal.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/2/AO_3.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/2/meti_1.png')),
            loadTextureAsync(resolveAssetPath('gltf/TwoLayerBoat/2/rou_2.png'))
          ])

          emissive.flipY = false
          emissive.colorSpace = THREE.SRGBColorSpace

          normal.flipY = false
          ao.flipY = false
          metalness.flipY = false
          roughness.flipY = false

          normal2.flipY = false
          ao2.flipY = false
          metalness2.flipY = false
          roughness2.flipY = false

          externalTextures.push(emissive, normal, ao, metalness, roughness, normal2, ao2, metalness2, roughness2)
          applyM01MaterialMaps(object3d, { emissive, normal, ao, metalness, roughness })
          applyM02MaterialMaps(object3d, { normal: normal2, ao: ao2, metalness: metalness2, roughness: roughness2 })
        } catch (error) {
          console.error('Failed to load external maps for M_01___Default:', error)
        }

        // 为指定子网格单独替换银色金属材质。
        object3d.traverse((child) => {
          if (!child.isMesh) {
            return
          }

          if (child.name?.toLowerCase() === 'box018' && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.forEach((material) => {
              material.metalness = 0
              material.roughness = 0.95
              if ('envMapIntensity' in material) {
                material.envMapIntensity = 0.18
              }
              if ('clearcoat' in material) {
                material.clearcoat = 0
              }
              material.needsUpdate = true
            })
          }

          if (child.name === 'Cylinder019') {
            const silverMaterial = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color('#c7ccd3'),
              metalness: 1,
              roughness: 0.0,
              clearcoat: 0.5,
              clearcoatRoughness: 0.02,
              envMapIntensity: 2.2
            })

            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material?.dispose())
              child.material = child.material.map(() => silverMaterial.clone())
              silverMaterial.dispose()
            } else {
              child.material?.dispose()
              child.material = silverMaterial
            }
          }

          if (child.name === '对象004') {
            const glassMaterial = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color('#d9ecff'),
              metalness: 0,
              roughness: 0.02,
              transmission: 0.96,
              thickness: 1.2,
              ior: 1.5,
              transparent: true,
              opacity: 0.28,
              clearcoat: 1,
              clearcoatRoughness: 0.01,
              envMapIntensity: 2.4,
              side: THREE.DoubleSide
            })

            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material?.dispose())
              child.material = child.material.map(() => glassMaterial.clone())
              glassMaterial.dispose()
            } else {
              child.material?.dispose()
              child.material = glassMaterial
            }
          }
        })

        loadedRoot = object3d

        const bounds = new THREE.Box3().setFromObject(object3d)
        const size = bounds.getSize(new THREE.Vector3())
        const maxSize = Math.max(size.x, size.y, size.z)
        if (maxSize > 0) {
          object3d.scale.multiplyScalar(6 / maxSize)
        }

        bounds.setFromObject(object3d)
        const center = bounds.getCenter(new THREE.Vector3())
        object3d.position.sub(center)

        scene.add(object3d)
      },
      undefined,
      (error) => {
        console.error('Failed to load TwoLayerBoat.glb:', error)
      }
    )

    const resize = () => {
      const width = canvas.clientWidth || 1
      const height = canvas.clientHeight || 1

      updateOrthographicFrustum(exteriorCamera, width / height, 7.6)
      exteriorCamera.updateProjectionMatrix()
      interiorCamera.aspect = width / height
      interiorCamera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    let frameId = 0
    // 主渲染循环：用于驱动 OrbitControls 的交互更新。
    const renderLoop = () => {
      if (modeRef.current === 'exterior') {
        controls.update()
      }
      renderer.render(scene, activeCamera)
      frameId = window.requestAnimationFrame(renderLoop)
    }
    renderLoop()

    return () => {
      // 组件卸载时主动释放资源，避免 GPU 内存泄漏。
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)

      if (loadedRoot) {
        scene.remove(loadedRoot)
        loadedRoot.traverse((child) => {
          if (!child.isMesh) {
            return
          }

          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material?.dispose())
          } else {
            child.material?.dispose()
          }
        })
      }

      scene.environment = null
      environmentTexture.dispose()
      pmremGenerator.dispose()
      externalTextures.forEach((texture) => texture?.dispose())
      controlsRef.current = null
      cameraRef.current = null

      renderer.dispose()
    }
  }, [])

  const handleSwitchView = (mode) => {
    setActiveView(mode)
    setViewPresetRef.current(mode)
  }

  const handleInteriorDeckSwitch = (deck) => {
    interiorDeckRef.current = deck
    setActiveDeck(deck)
    if (activeView !== 'interior') {
      setActiveView('interior')
    }
    setViewPresetRef.current('interior', deck)
  }

  return (
    <div className="scene-shell" aria-label="3D cargo vessel preview">
      <canvas className="webgl" ref={canvasRef} />
      <div className="canvas-view-toggle" aria-label="场景视角切换">
        <div className="interior-toggle-group">
          <button
            type="button"
            className={`switch-btn ${activeView === 'interior' ? 'active' : ''}`}
            onClick={() => handleSwitchView('interior')}
          >
            内部
          </button>
          {activeView === 'interior' && (
            <div className="interior-level-toggle" aria-label="内部楼层切换">
              <button
                type="button"
                className={`switch-btn switch-btn-sm ${activeDeck === '1' ? 'active' : ''}`}
                onClick={() => handleInteriorDeckSwitch('1')}
              >
                一层
              </button>
              <button
                type="button"
                className={`switch-btn switch-btn-sm ${activeDeck === '2' ? 'active' : ''}`}
                onClick={() => handleInteriorDeckSwitch('2')}
              >
                二层
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`switch-btn ${activeView === 'exterior' ? 'active' : ''}`}
          onClick={() => handleSwitchView('exterior')}
        >
          外部
        </button>
      </div>
    </div>
  )
}
