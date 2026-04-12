import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

function updateOrthographicFrustum(camera, aspect, frustumHeight) {
  const safeAspect = Math.max(aspect, 0.01)
  const halfHeight = frustumHeight / 2
  const halfWidth = halfHeight * safeAspect

  camera.left = -halfWidth
  camera.right = halfWidth
  camera.top = halfHeight
  camera.bottom = -halfHeight
}

function normalizeMaterialName(value) {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .replace(/^m[_\s-]*/, '')
    .replace(/[^a-z0-9]+/g, '')
}

const WATER_SURFACE_ENABLED = true
const EXTERIOR_STAGE_Y_OFFSET = 0.42
const EXTERIOR_TARGET_Y = 0.5 + EXTERIOR_STAGE_Y_OFFSET * 0.35
const EMPTY_ARRAY = []
const DEFAULT_WATER_TUNING = {
  levelFactor: 0.18,
  radiusScale: 0.84,
  zOffset: 0.16,
  exteriorModelLiftY: 0
}
const MODEL_WATER_TUNING = {
  PleasureBoat: {
    levelFactor: 0.06,
    exteriorModelLiftY: -0.02
  },
  PleasureBoat1: {
    exteriorModelLiftY: 0.1
  },
  Yacht: {
    exteriorModelLiftY: 0.06
  }
}

const DEFAULT_EXTERIOR_CAMERA_PRESET = {
  position: [-6.2, 1.65, 1.7],
  zoom: 1.18,
  targetY: EXTERIOR_TARGET_Y,
  stageOffsetY: EXTERIOR_STAGE_Y_OFFSET
}

const STUDIO_EXTERIOR_CAMERA_PRESET = {
  position: [-5.4, 1.32, 2.18],
  zoom: 1.34,
  targetY: 0.28,
  stageOffsetY: 0
}

const DEFAULT_INTERIOR_DECK_PRESETS = {
  '1': {
    position: [0, 0, -0.66],
    yaw: 0,
    pitch: -0.08
  },
  '2': {
    position: [0, 0.98, -0.66],
    yaw: 0,
    pitch: -0.08
  }
}

const TEST_HIGH_INTERIOR_DECK_PRESETS = {
  '1': {
    position: [0, 0.78, -1.55],
    yaw: 0,
    pitch: -0.14
  },
  '2': {
    position: [0, 0.78, -1.55],
    yaw: 0,
    pitch: -0.14
  }
}

function isStudioLookModel(modelId) {
  return modelId === 'TestHigh'
}

function getExteriorCameraPreset(modelId) {
  return isStudioLookModel(modelId)
    ? STUDIO_EXTERIOR_CAMERA_PRESET
    : DEFAULT_EXTERIOR_CAMERA_PRESET
}

function getInteriorDeckPresets(modelId) {
  return modelId === 'TestHigh'
    ? TEST_HIGH_INTERIOR_DECK_PRESETS
    : DEFAULT_INTERIOR_DECK_PRESETS
}

function getWaterTuning(modelId) {
  return {
    ...DEFAULT_WATER_TUNING,
    ...(MODEL_WATER_TUNING[modelId] ?? {})
  }
}

function createWaterSurface() {
  const geometry = new THREE.CircleGeometry(1, 120)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color('#72b8e9') },
      uDeepColor: { value: new THREE.Color('#0d3b61') },
      uHighlightColor: { value: new THREE.Color('#f2fbff') }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vWave;

      uniform float uTime;

      void main() {
        vUv = uv;

        vec3 transformed = position;
        float primaryWave = sin((position.x * 10.0) + uTime * 1.35) * 0.018;
        float secondaryWave = cos((position.y * 13.0) - uTime * 1.05) * 0.014;
        transformed.z += primaryWave + secondaryWave;
        vWave = transformed.z;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vWave;

      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform vec3 uDeepColor;
      uniform vec3 uHighlightColor;

      void main() {
        float dist = distance(vUv, vec2(0.5));
        float surfaceMask = smoothstep(0.56, 0.08, dist);
        float shimmer = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 24.0 + uTime * 0.9 + vWave * 40.0);
        float edgeGlow = smoothstep(0.55, 0.24, dist);
        float innerShadow = smoothstep(0.0, 0.44, dist);

        vec3 color = mix(uDeepColor, uBaseColor, 0.62 + vWave * 7.5);
        color = mix(color, uDeepColor * 0.9, innerShadow * 0.18);
        color = mix(color, uHighlightColor, shimmer * 0.14 * edgeGlow);

        float alpha = surfaceMask * (0.26 + shimmer * 0.12 + edgeGlow * 0.18);
        gl_FragColor = vec4(color, alpha);
      }
    `
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, -0.8, 0.2)

  return { mesh, material, geometry }
}

function createReflectionEnvironmentScene() {
  const environmentScene = new THREE.Scene()
  const disposables = []

  const registerMesh = (geometry, material, transform) => {
    const mesh = new THREE.Mesh(geometry, material)
    transform(mesh)
    environmentScene.add(mesh)
    disposables.push(geometry, material)
    return mesh
  }

  registerMesh(
    new THREE.SphereGeometry(14, 48, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#bcd3ea'),
      side: THREE.BackSide
    }),
    (mesh) => {
      mesh.scale.set(1, 0.88, 1)
    }
  )

  registerMesh(
    new THREE.PlaneGeometry(20, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#d7e6f5') }),
    (mesh) => {
      mesh.position.set(-6.4, 2.2, 1.8)
      mesh.rotation.y = Math.PI / 2.55
    }
  )

  registerMesh(
    new THREE.PlaneGeometry(18, 9),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#edf4fb') }),
    (mesh) => {
      mesh.position.set(5.6, 2.8, -2.6)
      mesh.rotation.y = -Math.PI / 2.2
    }
  )

  registerMesh(
    new THREE.CircleGeometry(1.2, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2b8') }),
    (mesh) => {
      mesh.position.set(-3.8, 4.6, 2.4)
      mesh.lookAt(0, 0.8, 0)
    }
  )

  registerMesh(
    new THREE.PlaneGeometry(22, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#5d6f7e') }),
    (mesh) => {
      mesh.position.set(0, -2.8, 0.4)
      mesh.rotation.x = -Math.PI / 2
    }
  )

  return {
    scene: environmentScene,
    dispose: () => {
      disposables.forEach((resource) => resource.dispose?.())
      environmentScene.clear()
    }
  }
}

function getOrderFocusPresets(modelId) {
  if (modelId === 'TestHigh') {
    return {
      overview: {
        type: 'exterior',
        position: STUDIO_EXTERIOR_CAMERA_PRESET.position,
        zoom: STUDIO_EXTERIOR_CAMERA_PRESET.zoom,
        target: [0, STUDIO_EXTERIOR_CAMERA_PRESET.targetY, 0]
      },
      interior: {
        type: 'interior',
        deck: '1'
      },
      engine: {
        type: 'exterior',
        position: [0.2, 1.08, -3.35],
        zoom: 2.52,
        target: [0.06, 0.6, -2.42]
      },
      console: {
        type: 'interior',
        deck: '1',
        position: [0, 0.82, -1.02],
        yaw: 0,
        pitch: -0.1
      }
    }
  }

  return {
    overview: {
      type: 'exterior',
      position: DEFAULT_EXTERIOR_CAMERA_PRESET.position,
      zoom: DEFAULT_EXTERIOR_CAMERA_PRESET.zoom,
      target: [0, DEFAULT_EXTERIOR_CAMERA_PRESET.targetY, 0]
    },
    interior: {
      type: 'interior',
      deck: '1'
    },
    engine: {
      type: 'exterior',
      position: DEFAULT_EXTERIOR_CAMERA_PRESET.position,
      zoom: DEFAULT_EXTERIOR_CAMERA_PRESET.zoom,
      target: [0, DEFAULT_EXTERIOR_CAMERA_PRESET.targetY, 0]
    },
    console: {
      type: 'exterior',
      position: DEFAULT_EXTERIOR_CAMERA_PRESET.position,
      zoom: DEFAULT_EXTERIOR_CAMERA_PRESET.zoom,
      target: [0, DEFAULT_EXTERIOR_CAMERA_PRESET.targetY, 0]
    }
  }
}

function getColorShaderPreset(colorConfig) {
  const colorId = colorConfig?.id ?? 'pearl-white'
  const fallbackHex = colorConfig?.hex ?? '#f2f3f5'
  const presetMap = {
    'pearl-white': {
      color: '#f5f6fa',
      strength: 0.22,
      lift: 0.02
    },
    'deep-sea-blue': {
      color: '#28567b',
      strength: 0.92,
      lift: -0.02
    },
    'graphite-gray': {
      color: '#626973',
      strength: 0.86,
      lift: -0.04
    },
    'rescue-red': {
      color: '#bc2b2b',
      strength: 0.96,
      lift: -0.01
    }
  }

  return presetMap[colorId] ?? {
    color: fallbackHex,
    strength: 0.6,
    lift: 0
  }
}

function isColorTintCandidate(material, options = {}) {
  const { allowHighMetalness = false } = options
  if (!material) {
    return false
  }

  const materialName = `${material.name ?? ''}`.toLowerCase()
  if (
    material.transparent ||
    material.opacity < 0.98 ||
    materialName.includes('glass') ||
    materialName.includes('window') ||
    materialName.includes('rail') ||
    materialName.includes('metal')
  ) {
    return false
  }

  if (allowHighMetalness) {
    return true
  }

  return (material.metalness ?? 0) < 0.72
}

function applyShaderTintMaterial(material, colorPreset, options = {}) {
  const {
    targetWhiteSurfaces = false,
    allowHighMetalness = false
  } = options

  if (!material?.isMeshStandardMaterial || !isColorTintCandidate(material, { allowHighMetalness })) {
    return material
  }

  const shaderTintUniforms = material.userData.shaderTintUniforms ?? {
    uShaderTintColor: { value: new THREE.Color(colorPreset.color) },
    uShaderTintStrength: { value: colorPreset.strength },
    uShaderTintLift: { value: colorPreset.lift },
    uShaderTintWhiteOnly: { value: targetWhiteSurfaces ? 1 : 0 }
  }

  shaderTintUniforms.uShaderTintColor.value.set(colorPreset.color)
  shaderTintUniforms.uShaderTintStrength.value = colorPreset.strength
  shaderTintUniforms.uShaderTintLift.value = colorPreset.lift
  shaderTintUniforms.uShaderTintWhiteOnly.value = targetWhiteSurfaces ? 1 : 0
  material.userData.shaderTintUniforms = shaderTintUniforms

  if (!material.userData.hasShaderTintHook) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uShaderTintColor = shaderTintUniforms.uShaderTintColor
      shader.uniforms.uShaderTintStrength = shaderTintUniforms.uShaderTintStrength
      shader.uniforms.uShaderTintLift = shaderTintUniforms.uShaderTintLift
      shader.uniforms.uShaderTintWhiteOnly = shaderTintUniforms.uShaderTintWhiteOnly

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uShaderTintColor;
uniform float uShaderTintStrength;
uniform float uShaderTintLift;
uniform float uShaderTintWhiteOnly;
`
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
float tintLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float tintChroma = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) - min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b);
float broadTintMask = smoothstep(0.04, 0.96, tintLuma);
float whiteTintMask = smoothstep(0.62, 0.94, tintLuma) * (1.0 - smoothstep(0.08, 0.24, tintChroma));
float tintMask = mix(broadTintMask, whiteTintMask, clamp(uShaderTintWhiteOnly, 0.0, 1.0)) * clamp(uShaderTintStrength, 0.0, 1.0);
vec3 tintTarget = diffuseColor.rgb * uShaderTintColor;
diffuseColor.rgb = mix(diffuseColor.rgb, tintTarget, tintMask);
diffuseColor.rgb += vec3(uShaderTintLift);
`
        )
    }

    material.customProgramCacheKey = () => 'salesboat-shader-tint-v1'
    material.userData.hasShaderTintHook = true
    material.needsUpdate = true
  }

  return material
}

function shouldApplyColorway(modelId, partRole) {
  if (partRole === 'hull') {
    return true
  }

  return ['PleasureBoat', 'PleasureBoat1', 'Yacht'].includes(modelId) && partRole === 'full'
}

export default function ShipScene({
  modelConfig,
  focusTarget = 'overview',
  colorConfig = null,
  overviewZoomScale = 1
}) {
  const assetBaseUrl = import.meta.env.BASE_URL
  const resolveAssetPath = (relativePath) => `${assetBaseUrl}${relativePath}`
  const resolveManifestPath = (assetPath) => {
    if (!assetPath) {
      return ''
    }

    if (/^https?:\/\//i.test(assetPath)) {
      return assetPath
    }

    if (assetPath.startsWith('/')) {
      return `${assetBaseUrl}${assetPath.slice(1)}`
    }

    return `${assetBaseUrl}${assetPath}`
  }

  const modelId = modelConfig?.id ?? 'TwoLayerBoat'
  const waterTuning = getWaterTuning(modelId)
  const compositeParts = modelConfig?.parts ?? EMPTY_ARRAY
  const hasCompositeParts = compositeParts.length > 0
  const modelFormat = (modelConfig?.model?.format ?? 'glb').toLowerCase()
  const modelPath = modelConfig?.model?.path
    ? resolveManifestPath(modelConfig.model.path)
    : resolveAssetPath('gltf/TwoLayerBoat/TwoLayerBoat.glb')
  const isTwoLayerBoat = modelId === 'TwoLayerBoat'
  const isStudioLook = isStudioLookModel(modelId)
  const baseExteriorCameraPreset = getExteriorCameraPreset(modelId)
  const exteriorCameraPreset = {
    ...baseExteriorCameraPreset,
    zoom: baseExteriorCameraPreset.zoom * overviewZoomScale
  }
  const interiorDeckPresetConfig = getInteriorDeckPresets(modelId)
  const baseOrderFocusPresets = getOrderFocusPresets(modelId)
  const orderFocusPresets = {
    ...baseOrderFocusPresets,
    overview: {
      ...baseOrderFocusPresets.overview,
      zoom: (baseOrderFocusPresets.overview?.zoom ?? exteriorCameraPreset.zoom) * overviewZoomScale
    }
  }
  const shouldShowWaterSurface = WATER_SURFACE_ENABLED && !isStudioLook
  // ===== TwoLayerBoat Locked Block START =====
  // TwoLayerBoat 维持固定 GLB 入口，避免被自动配置改动影响贴图稳定性。
  const effectiveModelPath = isTwoLayerBoat
    ? resolveAssetPath('gltf/TwoLayerBoat/TwoLayerBoat.glb')
    : modelPath
  const effectiveModelFormat = isTwoLayerBoat ? 'glb' : modelFormat
  // ===== TwoLayerBoat Locked Block END =====
  const uvSets = modelConfig?.uvSets ?? EMPTY_ARRAY

  const canvasRef = useRef(null)
  const controlsRef = useRef(null)
  const cameraRef = useRef(null)
  const modeRef = useRef('exterior')
  const interiorDeckRef = useRef('1')
  const setViewPresetRef = useRef(() => {})
  const setFocusTargetRef = useRef(() => {})
  const setColorConfigRef = useRef(() => {})
  const [activeView, setActiveView] = useState('exterior')
  const [activeDeck, setActiveDeck] = useState('1')
  const [isSceneLoading, setIsSceneLoading] = useState(true)
  const [sceneError, setSceneError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return undefined
    }

    let isDisposed = false
    setIsSceneLoading(true)
    setSceneError('')

    const scene = new THREE.Scene()
    const presentationRoot = new THREE.Group()
    const modelRoot = new THREE.Group()
    const waterRoot = new THREE.Group()
    const stageRoot = new THREE.Group()
    const waterSurface = shouldShowWaterSurface ? createWaterSurface() : null
    scene.add(presentationRoot)
    presentationRoot.add(stageRoot, waterRoot, modelRoot)

    const exteriorCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.005, 5000)
    const interiorCamera = new THREE.PerspectiveCamera(56, 1, isStudioLook ? 0.02 : 0.005, 5000)
    exteriorCamera.position.set(...exteriorCameraPreset.position)
    exteriorCamera.zoom = exteriorCameraPreset.zoom
    interiorCamera.position.set(...(interiorDeckPresetConfig['1']?.position ?? [0, 0.68, -0.82]))
    scene.add(exteriorCamera, interiorCamera)

    let activeCamera = exteriorCamera
    cameraRef.current = activeCamera

    const ambientLight = new THREE.HemisphereLight(
      new THREE.Color(isStudioLook ? '#dde8f6' : '#bfd9f2'),
      new THREE.Color(isStudioLook ? '#32251c' : '#52606c'),
      isStudioLook ? 0.62 : 1.02
    )
    const keyLight = new THREE.DirectionalLight(
      new THREE.Color(isStudioLook ? '#fff1de' : '#ffd7ab'),
      isStudioLook ? 2.05 : 1.18
    )
    keyLight.position.set(...(isStudioLook ? [5.4, 3.5, 4.8] : [6.8, 4.6, 2.2]))
    keyLight.target = modelRoot
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.bias = -0.0002
    keyLight.shadow.normalBias = 0.03
    keyLight.shadow.camera.near = 0.5
    keyLight.shadow.camera.far = 24
    keyLight.shadow.camera.left = -8
    keyLight.shadow.camera.right = 8
    keyLight.shadow.camera.top = 8
    keyLight.shadow.camera.bottom = -8
    const underGlowLight = new THREE.PointLight(
      new THREE.Color(isStudioLook ? '#72f6ff' : '#ffffff'),
      isStudioLook ? 0 : 0,
      10,
      2
    )
    underGlowLight.position.set(0.2, -0.55, 1.1)
    scene.add(ambientLight, keyLight, underGlowLight)

    if (waterSurface) {
      waterRoot.add(waterSurface.mesh)
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#010203', 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = isStudioLook ? 0.92 : 0.94
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const pmremGenerator = new THREE.PMREMGenerator(renderer)
    const reflectionEnvironment = createReflectionEnvironmentScene()
    const environmentTexture = pmremGenerator.fromScene(reflectionEnvironment.scene, 0.02).texture
    scene.environment = environmentTexture

    const controls = new OrbitControls(exteriorCamera, canvas)
    controls.enableDamping = true
    controls.enablePan = false
    controls.enableZoom = false
    controls.target.set(0, exteriorCameraPreset.targetY, 0)
    controls.update()
    controlsRef.current = controls

    const interiorPose = {
      position: new THREE.Vector3(...(interiorDeckPresetConfig['1']?.position ?? [0, 0.68, -0.82])),
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

    const interiorDeckPresets = Object.fromEntries(
      Object.entries(interiorDeckPresetConfig).map(([deck, preset]) => [
        deck,
        {
          position: new THREE.Vector3(...preset.position),
          yaw: preset.yaw,
          pitch: preset.pitch
        }
      ])
    )

    const updatePresentationOffset = (mode) => {
      presentationRoot.position.y = mode === 'exterior' ? exteriorCameraPreset.stageOffsetY : 0
      modelRoot.position.y = mode === 'exterior' && shouldShowWaterSurface ? waterTuning.exteriorModelLiftY : 0
    }

    const applyExteriorCameraPreset = (preset) => {
      const safePreset = preset ?? {}
      const nextPosition = safePreset.position ?? exteriorCameraPreset.position
      const nextZoom = safePreset.zoom ?? exteriorCameraPreset.zoom
      const nextTarget = safePreset.target ?? [0, exteriorCameraPreset.targetY, 0]

      exteriorCamera.position.set(...nextPosition)
      exteriorCamera.zoom = nextZoom
      controls.target.set(...nextTarget)
      exteriorCamera.updateProjectionMatrix()
      controls.update()
    }

    setViewPresetRef.current = (mode, deck = interiorDeckRef.current, preset = null) => {
      modeRef.current = mode
      const effectiveDeck = isTwoLayerBoat ? deck : '1'

      updatePresentationOffset(mode)

      if (waterSurface) {
        waterSurface.mesh.visible = mode === 'exterior'
      }

      if (mode === 'interior') {
        activeCamera = interiorCamera
        cameraRef.current = interiorCamera
        controls.enabled = false

        const deckPreset = interiorDeckPresets[effectiveDeck] ?? interiorDeckPresets['1']
        const nextInteriorPosition = preset?.position
          ? new THREE.Vector3(...preset.position)
          : deckPreset.position
        interiorPose.position.copy(nextInteriorPosition)
        interiorPose.yaw = preset?.yaw ?? deckPreset.yaw
        interiorPose.pitch = preset?.pitch ?? deckPreset.pitch
        updateInteriorOrientation()
      } else {
        activeCamera = exteriorCamera
        cameraRef.current = exteriorCamera
        controls.enabled = true
        applyExteriorCameraPreset(preset)
      }
    }

    setFocusTargetRef.current = (target) => {
      const preset = orderFocusPresets[target] ?? orderFocusPresets.overview
      if (preset.type === 'interior') {
        setViewPresetRef.current('interior', preset.deck ?? '1', preset)
        return
      }

      setViewPresetRef.current('exterior', interiorDeckRef.current, preset)
    }

    setViewPresetRef.current('exterior')
    setFocusTargetRef.current(focusTarget)

    let loadedRoot = null
    const gltfLoader = new GLTFLoader()
    const fbxLoader = new FBXLoader()
    const textureLoader = new THREE.TextureLoader()
    const externalTextures = []

    const loadTextureAsync = (path) => new Promise((resolve, reject) => {
      textureLoader.load(path, resolve, undefined, reject)
    })

    const loadModelAsync = ({ format, path }) => new Promise((resolve, reject) => {
      if (format === 'fbx') {
        fbxLoader.load(path, (object3d) => resolve(object3d), undefined, reject)
        return
      }

      gltfLoader.load(
        path,
        (gltf) => {
          const object3d = gltf.scene ?? gltf.scenes?.[0]
          if (!object3d) {
            reject(new Error(`${modelId} does not contain a scene root.`))
            return
          }
          resolve(object3d)
        },
        undefined,
        reject
      )
    })

    const ensureAoUv = (mesh) => {
      const geometry = mesh.geometry
      if (!geometry?.attributes?.uv) {
        return false
      }

      if (!geometry.attributes.uv2) {
        geometry.setAttribute('uv2', geometry.attributes.uv.clone())
      }

      return true
    }

    const applyMeshShadowFlags = (rootObject) => {
      rootObject.traverse((child) => {
        if (!child.isMesh) {
          return
        }

        child.castShadow = true
        child.receiveShadow = true
      })
    }

    const createPbrMaterial = (material) => {
      const upgradedMaterial = new THREE.MeshStandardMaterial({
        name: material?.name || '',
        color: material?.color?.clone?.() ?? new THREE.Color('#ffffff'),
        emissive: material?.emissive?.clone?.() ?? new THREE.Color('#000000'),
        emissiveIntensity: material?.emissiveIntensity ?? 1,
        opacity: material?.opacity ?? 1,
        transparent: material?.transparent ?? false,
        side: material?.side ?? THREE.FrontSide,
        alphaTest: material?.alphaTest ?? 0,
        depthWrite: material?.depthWrite ?? true,
        depthTest: material?.depthTest ?? true,
        wireframe: material?.wireframe ?? false,
        flatShading: material?.flatShading ?? false,
        fog: material?.fog ?? true,
        metalness: 'metalness' in (material ?? {}) ? material.metalness : 0.22,
        roughness: 'roughness' in (material ?? {}) ? material.roughness : 0.42,
        envMapIntensity: 1.28
      })

      if (material?.map) {
        upgradedMaterial.map = material.map
      }
      if (material?.normalMap) {
        upgradedMaterial.normalMap = material.normalMap
      }
      if (material?.aoMap) {
        upgradedMaterial.aoMap = material.aoMap
      }
      if (material?.metalnessMap) {
        upgradedMaterial.metalnessMap = material.metalnessMap
      }
      if (material?.roughnessMap) {
        upgradedMaterial.roughnessMap = material.roughnessMap
      }
      if (material?.emissiveMap) {
        upgradedMaterial.emissiveMap = material.emissiveMap
      }
      if (material?.normalScale) {
        upgradedMaterial.normalScale = material.normalScale.clone()
      }

      return upgradedMaterial
    }

    const createPhysicalMaterial = (material) => {
      const upgradedMaterial = new THREE.MeshPhysicalMaterial({
        name: material?.name || '',
        color: material?.color?.clone?.() ?? new THREE.Color('#ffffff'),
        emissive: material?.emissive?.clone?.() ?? new THREE.Color('#000000'),
        emissiveIntensity: material?.emissiveIntensity ?? 1,
        opacity: material?.opacity ?? 1,
        transparent: material?.transparent ?? false,
        side: material?.side ?? THREE.FrontSide,
        alphaTest: material?.alphaTest ?? 0,
        depthWrite: material?.depthWrite ?? true,
        depthTest: material?.depthTest ?? true,
        wireframe: material?.wireframe ?? false,
        flatShading: material?.flatShading ?? false,
        fog: material?.fog ?? true,
        metalness: 'metalness' in (material ?? {}) ? material.metalness : 0.24,
        roughness: 'roughness' in (material ?? {}) ? material.roughness : 0.34,
        envMapIntensity: material?.envMapIntensity ?? 1.52,
        clearcoat: material?.clearcoat ?? 0,
        clearcoatRoughness: material?.clearcoatRoughness ?? 0.08
      })

      if (material?.map) {
        upgradedMaterial.map = material.map
      }
      if (material?.normalMap) {
        upgradedMaterial.normalMap = material.normalMap
      }
      if (material?.aoMap) {
        upgradedMaterial.aoMap = material.aoMap
      }
      if (material?.metalnessMap) {
        upgradedMaterial.metalnessMap = material.metalnessMap
      }
      if (material?.roughnessMap) {
        upgradedMaterial.roughnessMap = material.roughnessMap
      }
      if (material?.emissiveMap) {
        upgradedMaterial.emissiveMap = material.emissiveMap
      }
      if (material?.normalScale) {
        upgradedMaterial.normalScale = material.normalScale.clone()
      }
      if (material?.aoMapIntensity !== undefined) {
        upgradedMaterial.aoMapIntensity = material.aoMapIntensity
      }

      return upgradedMaterial
    }

    const getMaterialForUvMaps = (material, options = {}) => {
      const { preferPbrFinish = false } = options

      if (preferPbrFinish && !material?.isMeshStandardMaterial) {
        return createPbrMaterial(material)
      }

      if (preferPbrFinish && material?.isMeshStandardMaterial) {
        material.envMapIntensity = Math.max(material.envMapIntensity ?? 0, 1.28)
      }

      return material
    }

    const applyMapsToMaterial = (material, maps, options = {}) => {
      const { canUseUvMaps = true } = options

      if (maps.baseColor && canUseUvMaps) {
        if (material.color) {
          material.color.set('#ffffff')
        }
        material.map = maps.baseColor
      }
      if (maps.emissive && canUseUvMaps) {
        material.emissive = new THREE.Color('#ffffff')
        material.emissiveMap = maps.emissive
      }
      if (maps.normal && canUseUvMaps) {
        material.normalMap = maps.normal
        material.normalScale = new THREE.Vector2(1, -1)
      }
      if (maps.ao && canUseUvMaps) {
        material.aoMap = maps.ao
        material.aoMapIntensity = 0.72
      }
      if (maps.metalness && canUseUvMaps) {
        material.metalnessMap = maps.metalness
        material.metalness = 1
      }
      if (maps.roughness && canUseUvMaps) {
        material.roughnessMap = maps.roughness
        material.roughness = 1
      }
      if ('envMapIntensity' in material) {
        material.envMapIntensity = Math.max(material.envMapIntensity ?? 0, 1.28)
      }
      material.needsUpdate = true
    }

    const applyFireFightingCcClearcoat = (material) => {
      const targetMaterial = material?.isMeshPhysicalMaterial ? material : createPhysicalMaterial(material)

      targetMaterial.metalness = targetMaterial.metalnessMap ? 0.26 : 0.1
      targetMaterial.roughness = targetMaterial.roughnessMap ? 1 : 0.56
      targetMaterial.clearcoat = 0.22
      targetMaterial.clearcoatRoughness = 0.34
      targetMaterial.envMapIntensity = Math.max(targetMaterial.envMapIntensity ?? 0, 0.92)
      if ('specularIntensity' in targetMaterial) {
        targetMaterial.specularIntensity = 0.42
      }
      if ('specularColor' in targetMaterial && targetMaterial.specularColor?.set) {
        targetMaterial.specularColor.set('#d86f72')
      }
      targetMaterial.needsUpdate = true

      return targetMaterial
    }

    const applyFireFightingRailingTransparency = (material) => {
      const targetMaterial = material?.isMeshPhysicalMaterial ? material : createPhysicalMaterial(material)

      targetMaterial.transparent = true
      targetMaterial.alphaTest = 0.18
      targetMaterial.depthWrite = false
      targetMaterial.side = THREE.DoubleSide
      targetMaterial.metalness = 1
      targetMaterial.roughness = targetMaterial.roughnessMap ? 0.42 : 0.18
      targetMaterial.envMapIntensity = Math.max(targetMaterial.envMapIntensity ?? 0, 1.92)
      targetMaterial.clearcoat = 0.24
      targetMaterial.clearcoatRoughness = 0.14
      if (targetMaterial.emissiveMap) {
        targetMaterial.emissive = new THREE.Color('#dfe5ee')
        targetMaterial.emissiveIntensity = 0.42
      }
      if ('specularIntensity' in targetMaterial) {
        targetMaterial.specularIntensity = 1
      }
      targetMaterial.needsUpdate = true

      return targetMaterial
    }

    const applyUvSetMaps = (rootObject, uvSet, maps, options = {}) => {
      const hint = uvSet.materialNameHint
      const normalizedHint = normalizeMaterialName(hint)
      const { materialTransform = null } = options
      let appliedCount = 0
      let skippedMeshCount = 0

      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        const hasUv = ensureAoUv(child)
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        const updatedMaterials = materials.map((material) => {
          let targetMaterial = getMaterialForUvMaps(material, options)
          const normalizedMaterialName = normalizeMaterialName(material?.name)
          if (hint && normalizedMaterialName !== normalizedHint) {
            return targetMaterial
          }

          if (!hasUv) {
            skippedMeshCount += 1
            applyMapsToMaterial(targetMaterial, maps, { canUseUvMaps: false })
            if (materialTransform) {
              targetMaterial = materialTransform(targetMaterial, { uvSet, normalizedMaterialName })
            }
            return targetMaterial
          }

          applyMapsToMaterial(targetMaterial, maps, { canUseUvMaps: true })
          if (materialTransform) {
            targetMaterial = materialTransform(targetMaterial, { uvSet, normalizedMaterialName })
          }
          appliedCount += 1
          return targetMaterial
        })

        if (Array.isArray(child.material)) {
          materials.forEach((material, index) => {
            if (updatedMaterials[index] !== material) {
              material?.dispose?.()
            }
          })
          child.material = updatedMaterials
        } else if (updatedMaterials[0] !== child.material) {
          child.material?.dispose?.()
          child.material = updatedMaterials[0]
        }
      })

      return { appliedCount, skippedMeshCount }
    }

    const applyTwoLayerMaterialMaps = (rootObject, materialName, maps, withEmissive) => {
      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          if (material?.name !== materialName) {
            return
          }

          ensureAoUv(child)
          if (withEmissive && maps.emissive) {
            material.emissive = new THREE.Color('#ffffff')
            material.emissiveMap = maps.emissive
          }
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

    // ===== TwoLayerBoat Locked Block START =====
    // TwoLayerBoat 贴图保持回滚后的定向挂载策略（M_01/M_02），请勿替换为通用自动映射。
    const loadAndApplyTwoLayerMaps = async (rootObject) => {
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

      applyTwoLayerMaterialMaps(
        rootObject,
        'M_01___Default',
        { emissive, normal, ao, metalness, roughness },
        true
      )
      applyTwoLayerMaterialMaps(
        rootObject,
        'M_02___Default',
        { normal: normal2, ao: ao2, metalness: metalness2, roughness: roughness2 },
        false
      )
    }
    // ===== TwoLayerBoat Locked Block END =====

    const loadAndApplyUvMaps = async (rootObject, targetUvSets, targetModelFormat, targetLabel) => {
      const shouldFlipY = targetModelFormat !== 'fbx'

      for (const uvSet of targetUvSets) {
        const textureEntries = Object.entries(uvSet.textures ?? {}).filter(([, path]) => Boolean(path))
        if (textureEntries.length === 0) {
          continue
        }

        const loadedTextures = await Promise.all(
          textureEntries.map(async ([type, path]) => {
            const texture = await loadTextureAsync(resolveManifestPath(path))
            texture.flipY = shouldFlipY ? false : true
            if (type === 'baseColor' || type === 'emissive') {
              texture.colorSpace = THREE.SRGBColorSpace
            }
            texture.needsUpdate = true
            externalTextures.push(texture)
            return [type, texture]
          })
        )

        const textureMap = Object.fromEntries(loadedTextures)
        const materialTransform = modelId === 'FireFighting'
          ? (
              uvSet.id === 'tt/cc'
                ? applyFireFightingCcClearcoat
                : uvSet.id === 'tt/langan'
                  ? applyFireFightingRailingTransparency
                  : null
            )
          : null
        const initialResult = applyUvSetMaps(rootObject, uvSet, textureMap, {
          preferPbrFinish: targetModelFormat === 'fbx',
          materialTransform
        })
        if (initialResult.appliedCount === 0) {
          // 当材质名提示未命中时，回退为整模型应用，避免贴图完全不生效。
          const fallbackResult = applyUvSetMaps(rootObject, { ...uvSet, materialNameHint: null }, textureMap, {
            preferPbrFinish: targetModelFormat === 'fbx',
            materialTransform
          })
          if (fallbackResult.appliedCount === 0 && fallbackResult.skippedMeshCount > 0) {
            console.warn(`Skipped UV texture application for ${targetLabel}/${uvSet.id}: model meshes do not contain UV coordinates.`)
          }
        } else if (initialResult.skippedMeshCount > 0) {
          console.warn(`Partially skipped UV texture application for ${targetLabel}/${uvSet.id}: some meshes do not contain UV coordinates.`)
        }
      }
    }

    const applyTwoLayerOverrides = (rootObject) => {
      rootObject.traverse((child) => {
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
            roughness: 0,
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
    }

    const applyTestModelOverrides = (rootObject) => {
      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => {
          material.side = THREE.DoubleSide
          material.needsUpdate = true
        })
      })
    }

    const updateMeshMaterials = (mesh, transformMaterial) => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const updatedMaterials = materials.map((material) => transformMaterial(material))

      if (Array.isArray(mesh.material)) {
        materials.forEach((material, index) => {
          if (updatedMaterials[index] !== material) {
            material?.dispose?.()
          }
        })
        mesh.material = updatedMaterials
        return
      }

      if (updatedMaterials[0] !== mesh.material) {
        mesh.material?.dispose?.()
        mesh.material = updatedMaterials[0]
      }
    }

    const applyColorConfigToObject = (rootObject, partRole) => {
      if (!shouldApplyColorway(modelId, partRole)) {
        return
      }

      const colorPreset = getColorShaderPreset(colorConfig)
      const colorOptions = partRole === 'hull'
        ? { targetWhiteSurfaces: true, allowHighMetalness: true }
        : {}
      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        updateMeshMaterials(child, (material) => applyShaderTintMaterial(material, colorPreset, colorOptions))
      })
    }

    const getTestHighPartRole = (partId, partIndex) => {
      const partLabel = `${partId ?? ''}`

      if (partLabel.includes('灯带') || partLabel.includes('控制台') || partIndex === 0) {
        return 'accent'
      }

      if (partLabel.includes('船体') || partLabel.includes('顶棚') || partIndex === 1) {
        return 'hull'
      }

      if (partLabel.includes('船舱') || partLabel.includes('栏杆') || partLabel.includes('沙发') || partIndex === 2) {
        return 'interior'
      }

      if (partLabel.includes('马达') || partIndex === 3) {
        return 'engine'
      }

      return 'default'
    }

    const applyStudioMaterialPreset = (material, preset = {}) => {
      const targetMaterial = material?.isMeshStandardMaterial ? material : createPbrMaterial(material)

      if (targetMaterial.color && preset.color) {
        targetMaterial.color.set(preset.color)
      }

      if (targetMaterial.color && preset.colorMultiply) {
        targetMaterial.color.multiplyScalar(preset.colorMultiply)
      }

      if (preset.metalness !== undefined) {
        targetMaterial.metalness = targetMaterial.metalnessMap && preset.preserveMetalnessMapRange
          ? Math.max(1, preset.metalness)
          : preset.metalness
      }

      if (preset.roughness !== undefined) {
        targetMaterial.roughness = targetMaterial.roughnessMap && preset.preserveRoughnessMapRange
          ? Math.max(1, preset.roughness)
          : preset.roughness
      }

      if (targetMaterial.aoMap && preset.aoMapIntensity !== undefined) {
        targetMaterial.aoMapIntensity = preset.aoMapIntensity
      }

      if (preset.envMapIntensity !== undefined) {
        targetMaterial.envMapIntensity = preset.envMapIntensity
      }

      if (preset.disableMetalnessMap) {
        targetMaterial.metalnessMap = null
      }

      if (preset.disableRoughnessMap) {
        targetMaterial.roughnessMap = null
      }

      if (targetMaterial.normalMap && preset.normalScale !== undefined) {
        targetMaterial.normalScale = new THREE.Vector2(preset.normalScale, -preset.normalScale)
      }

      if (targetMaterial.emissiveMap && preset.emissiveColor) {
        targetMaterial.emissive = new THREE.Color(preset.emissiveColor)
      }

      if (targetMaterial.emissiveMap && preset.emissiveIntensity !== undefined) {
        targetMaterial.emissiveIntensity = preset.emissiveIntensity
      }

      targetMaterial.side = THREE.DoubleSide
      targetMaterial.needsUpdate = true

      return targetMaterial
    }

    const applyTestHighStudioOverrides = (rootObject, partId, partIndex) => {
      const partRole = getTestHighPartRole(partId, partIndex)
      const partPresetMap = {
        default: {
          colorMultiply: 0.94,
          metalness: 0.1,
          roughness: 0.34,
          aoMapIntensity: 0.68,
          envMapIntensity: 1
        },
        accent: {
          colorMultiply: 0.68,
          metalness: 0.14,
          roughness: 0.46,
          aoMapIntensity: 0.72,
          envMapIntensity: 0.45,
          emissiveIntensity: 0.2
        },
        hull: {
          
        },
        interior: {
          colorMultiply: 0.88,
          metalness: 0.2,
          roughness: 0.72,
          aoMapIntensity: 0.7,
          envMapIntensity: 0.65,
          preserveMetalnessMapRange: true,
          preserveRoughnessMapRange: true,
          normalScale: 0.82
        },
        engine: {
          color: '#8e9db3',
          metalness: 0.92,
          roughness: 0.28,
          aoMapIntensity: 0.24,
          envMapIntensity: 2.05
        }
      }
      const partPreset = partPresetMap[partRole] ?? partPresetMap.default

      rootObject.traverse((child) => {
        if (!child.isMesh || !child.material) {
          return
        }

        ensureAoUv(child)
        updateMeshMaterials(child, (material) => applyStudioMaterialPreset(material, partPreset))
      })
    }

    const loadCompositeModelAsync = async () => {
      if (!hasCompositeParts) {
        const object3d = await loadModelAsync({
          format: effectiveModelFormat,
          path: effectiveModelPath
        })
        applyMeshShadowFlags(object3d)

        return {
          root: object3d,
          applyMaterials: async () => {
            if (isTwoLayerBoat) {
              try {
                await loadAndApplyTwoLayerMaps(object3d)
              } catch (error) {
                console.error('Failed to load fixed texture maps for TwoLayerBoat:', error)
              }
              applyTwoLayerOverrides(object3d)
              return
            }

            if (modelId === 'TestModel') {
              applyTestModelOverrides(object3d)
              return
            }

            if (uvSets.length > 0) {
              try {
                await loadAndApplyUvMaps(object3d, uvSets, effectiveModelFormat, modelId)
              } catch (error) {
                console.error(`Failed to load UV set textures for ${modelId}:`, error)
              }
            }

            if (modelId === 'TestHigh') {
              applyTestHighStudioOverrides(object3d, modelId, 0)
            }

            applyColorConfigToObject(object3d, 'full')
          }
        }
      }

      const compositeRoot = new THREE.Group()
      const loadedParts = await Promise.all(compositeParts.map(async (part) => {
        const partFormat = (part?.model?.format ?? 'glb').toLowerCase()
        const partPath = resolveManifestPath(part?.model?.path ?? '')
        const object3d = await loadModelAsync({
          format: partFormat,
          path: partPath
        })
        applyMeshShadowFlags(object3d)

        compositeRoot.add(object3d)

        return {
          id: part.id,
          format: partFormat,
          object3d,
          uvSets: part.uvSets ?? []
        }
      }))

      return {
        root: compositeRoot,
        applyMaterials: async () => {
          for (const [partIndex, part] of loadedParts.entries()) {
            if (part.uvSets.length === 0) {
              if (modelId === 'TestHigh') {
                applyTestHighStudioOverrides(part.object3d, part.id, partIndex)
              }
              continue
            }

            try {
              await loadAndApplyUvMaps(part.object3d, part.uvSets, part.format, `${modelId}/${part.id}`)
            } catch (error) {
              console.error(`Failed to load UV set textures for ${modelId}/${part.id}:`, error)
            }

            if (modelId === 'TestHigh') {
              applyTestHighStudioOverrides(part.object3d, part.id, partIndex)
            }

            applyColorConfigToObject(part.object3d, getTestHighPartRole(part.id, partIndex))
          }
        }
      }
    }

    setColorConfigRef.current = (nextColorConfig) => {
      const colorPreset = getColorShaderPreset(nextColorConfig)

      const applyLiveColorConfig = (rootObject, partRole) => {
        if (!shouldApplyColorway(modelId, partRole)) {
          return
        }

        const colorOptions = partRole === 'hull'
          ? { targetWhiteSurfaces: true, allowHighMetalness: true }
          : {}

        rootObject.traverse((child) => {
          if (!child.isMesh || !child.material) {
            return
          }

          updateMeshMaterials(child, (material) => applyShaderTintMaterial(material, colorPreset, colorOptions))
        })
      }

      if (!loadedRoot) {
        return
      }

      if (!hasCompositeParts) {
        applyLiveColorConfig(loadedRoot, 'full')
        return
      }

      compositeParts.forEach((part, partIndex) => {
        const partObject = loadedRoot.children[partIndex]
        if (!partObject) {
          return
        }

        applyLiveColorConfig(partObject, getTestHighPartRole(part.id, partIndex))
      })
    }

    loadCompositeModelAsync()
      .then(async ({ root, applyMaterials }) => {
        if (isDisposed) {
          return
        }

        loadedRoot = root
        await applyMaterials()
        if (isDisposed) {
          return
        }

        const object3d = root

        const bounds = new THREE.Box3().setFromObject(object3d)
        const size = bounds.getSize(new THREE.Vector3())
        const maxSize = Math.max(size.x, size.y, size.z)
        if (maxSize > 0) {
          object3d.scale.multiplyScalar(6 / maxSize)
        }

        bounds.setFromObject(object3d)
        const center = bounds.getCenter(new THREE.Vector3())
        object3d.position.sub(center)

        bounds.setFromObject(object3d)
        const centeredBounds = bounds.clone()
        const normalizedSize = centeredBounds.getSize(new THREE.Vector3())
        if (waterSurface) {
          const waterRadius = Math.max(Math.max(normalizedSize.x, normalizedSize.z) * waterTuning.radiusScale, 3.4)
          const waterLevel = centeredBounds.min.y + normalizedSize.y * waterTuning.levelFactor
          waterSurface.mesh.scale.setScalar(waterRadius)
          waterSurface.mesh.position.set(0, waterLevel, waterTuning.zOffset)
        }

        if (isStudioLook) {
          stageRoot.clear()

          const shadowStageSize = Math.max(normalizedSize.x, normalizedSize.z) * 1.45
          const shadowStage = new THREE.Mesh(
            new THREE.PlaneGeometry(shadowStageSize, shadowStageSize),
            new THREE.ShadowMaterial({
              opacity: 0.84
            })
          )
          shadowStage.rotation.x = -Math.PI / 2
          shadowStage.position.set(0, centeredBounds.min.y + 0.008, 0)
          shadowStage.receiveShadow = true
          stageRoot.add(shadowStage)
        }

        modelRoot.add(object3d)
        setColorConfigRef.current(colorConfig)
        setIsSceneLoading(false)
      })
      .catch((error) => {
        if (isDisposed) {
          return
        }

        console.error(`Failed to load ${modelId}:`, error)
        setSceneError('当前 3D 模型加载失败，请刷新后重试。')
        setIsSceneLoading(false)
      })

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
    const renderLoop = () => {
      if (waterSurface) {
        waterSurface.material.uniforms.uTime.value = performance.now() * 0.001
      }
      if (modeRef.current === 'exterior') {
        controls.update()
      }
      renderer.render(scene, activeCamera)
      frameId = window.requestAnimationFrame(renderLoop)
    }
    renderLoop()

    return () => {
      isDisposed = true
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)

      if (loadedRoot) {
        modelRoot.remove(loadedRoot)
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
      reflectionEnvironment.dispose()
      environmentTexture.dispose()
      pmremGenerator.dispose()
      externalTextures.forEach((texture) => texture?.dispose())
      controlsRef.current = null
      cameraRef.current = null

      if (waterSurface) {
        waterRoot.remove(waterSurface.mesh)
        waterSurface.geometry.dispose()
        waterSurface.material.dispose()
      }

      stageRoot.traverse((child) => {
        if (!child.isMesh) {
          return
        }

        child.geometry?.dispose()
        child.material?.dispose?.()
      })

      renderer.dispose()
    }
  }, [
    compositeParts,
    effectiveModelFormat,
    effectiveModelPath,
    hasCompositeParts,
    isStudioLook,
    isTwoLayerBoat,
    modelId,
    overviewZoomScale,
    shouldShowWaterSurface,
    uvSets
  ])

  useEffect(() => {
    setFocusTargetRef.current(focusTarget)
    const nextFocusPreset = orderFocusPresets[focusTarget] ?? orderFocusPresets.overview
    if (nextFocusPreset.type === 'interior') {
      setActiveView('interior')
      return
    }

    setActiveView('exterior')
  }, [focusTarget])

  useEffect(() => {
    setColorConfigRef.current(colorConfig)
  }, [colorConfig])

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
    <div className={`scene-shell ${isStudioLook ? 'scene-shell-studio' : ''}`.trim()} aria-label="3D 船舶预览">
      <canvas className="webgl" ref={canvasRef} />
      {(isSceneLoading || sceneError) && (
        <div className="scene-status-overlay" aria-live="polite">
          {sceneError ? (
            <div className="scene-status-card scene-status-card-error">
              <strong>场景未能正常加载</strong>
              <span>{sceneError}</span>
            </div>
          ) : (
            <div className="scene-status-card">
              <strong>3D 场景加载中</strong>
              <span>正在初始化模型与贴图资源…</span>
            </div>
          )}
        </div>
      )}
      <div className="canvas-view-toggle" aria-label="场景视角切换">
        <div className="interior-toggle-group">
          <button
            type="button"
            className={`switch-btn ${activeView === 'interior' ? 'active' : ''}`}
            onClick={() => handleSwitchView('interior')}
          >
            内部
          </button>
          {isTwoLayerBoat && activeView === 'interior' && (
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
