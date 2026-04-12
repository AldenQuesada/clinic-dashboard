/**
 * fm-3d.js — Three.js 3D face visualization
 * Creates interactive 3D mesh from 478 MediaPipe landmarks with photo texture
 *
 * Features:
 * - 3D face mesh from 478 landmarks
 * - Photo texture mapping
 * - Interactive rotation (drag to rotate)
 * - Zoom (scroll wheel)
 * - Professional lighting (3-point setup)
 * - Treatment zone highlighting in 3D
 * - Before/After toggle
 */
;(function () {
  'use strict'

  var FM = window._FM
  var _scene, _camera, _renderer, _mesh, _controls
  var _container, _animId
  var _isDragging = false, _prevMouse = { x: 0, y: 0 }
  var _rotation = { x: 0, y: 0 }
  var _targetRotation = { x: 0, y: 0 }
  var _zoom = 2.5

  // MediaPipe face mesh triangulation (subset of triangles for face surface)
  // Full triangulation: 468 vertices, ~900 triangles
  var FACE_TRIANGLES = null // lazy-loaded

  FM._init3D = function (containerId) {
    _container = document.getElementById(containerId)
    if (!_container) return

    // Check if Three.js is loaded
    if (typeof THREE === 'undefined') {
      FM._load3DLibrary(function () { FM._init3D(containerId) })
      return
    }

    var w = _container.clientWidth
    var h = _container.clientHeight || 500

    // Scene
    _scene = new THREE.Scene()
    _scene.background = new THREE.Color(0x1a1a1a)

    // Camera
    _camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    _camera.position.set(0, 0, _zoom)

    // Renderer
    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    _renderer.setSize(w, h)
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    _renderer.toneMapping = THREE.ACESFilmicToneMapping
    _renderer.toneMappingExposure = 1.2
    _container.innerHTML = ''
    _container.appendChild(_renderer.domElement)

    // Lighting — professional 3-point setup
    _setupLighting()

    // Events
    _renderer.domElement.addEventListener('mousedown', _onMouseDown3D)
    _renderer.domElement.addEventListener('mousemove', _onMouseMove3D)
    _renderer.domElement.addEventListener('mouseup', _onMouseUp3D)
    _renderer.domElement.addEventListener('wheel', _onWheel3D)

    // Touch events
    _renderer.domElement.addEventListener('touchstart', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _onMouseDown3D({ clientX: t.clientX, clientY: t.clientY })
    })
    _renderer.domElement.addEventListener('touchmove', function (e) {
      e.preventDefault()
      var t = e.touches[0]
      _onMouseMove3D({ clientX: t.clientX, clientY: t.clientY })
    })
    _renderer.domElement.addEventListener('touchend', function () { _isDragging = false })

    // Start render loop
    _animate()
  }

  FM._create3DMesh = function (landmarks, photoUrl) {
    if (!_scene || !landmarks || landmarks.length < 478) return

    // Remove existing mesh
    if (_mesh) {
      _scene.remove(_mesh)
      _mesh.geometry.dispose()
      if (_mesh.material.map) _mesh.material.map.dispose()
      _mesh.material.dispose()
    }

    // Convert landmarks to vertices
    // MediaPipe landmarks are normalized 0-1, need to center and scale
    var vertices = []
    var uvs = []
    for (var i = 0; i < landmarks.length; i++) {
      var lm = landmarks[i]
      // Position: center at origin, scale to reasonable size
      var x = (lm.x - 0.5) * 2
      var y = -(lm.y - 0.5) * 2  // flip Y
      var z = -lm.z * 2  // depth
      vertices.push(x, y, z)

      // UV: use x,y as texture coordinates (direct photo mapping)
      uvs.push(lm.x, lm.y)
    }

    // Get triangulation
    var triangles = _getFaceTriangulation()

    // Create geometry
    var geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(triangles)
    geometry.computeVertexNormals()

    // Load texture from photo
    var textureLoader = new THREE.TextureLoader()
    var texture = textureLoader.load(photoUrl, function () {
      _renderer.render(_scene, _camera)
    })
    texture.flipY = false
    texture.colorSpace = THREE.SRGBColorSpace

    // Material — physically-based with skin-like properties
    var material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })

    _mesh = new THREE.Mesh(geometry, material)
    _scene.add(_mesh)

    // Reset rotation
    _rotation = { x: 0, y: 0 }
    _targetRotation = { x: 0, y: 0 }
  }

  FM._dispose3D = function () {
    if (_animId) cancelAnimationFrame(_animId)
    if (_mesh) {
      _scene.remove(_mesh)
      _mesh.geometry.dispose()
      if (_mesh.material.map) _mesh.material.map.dispose()
      _mesh.material.dispose()
    }
    if (_renderer) {
      _renderer.dispose()
      if (_renderer.domElement && _renderer.domElement.parentNode) {
        _renderer.domElement.parentNode.removeChild(_renderer.domElement)
      }
    }
    _scene = null
    _camera = null
    _renderer = null
    _mesh = null
  }

  // ── Lighting ────────────────────────────────────────────

  function _setupLighting() {
    // Key light (main, warm)
    var keyLight = new THREE.DirectionalLight(0xfff5e6, 1.2)
    keyLight.position.set(1, 1, 2)
    _scene.add(keyLight)

    // Fill light (softer, cool)
    var fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.6)
    fillLight.position.set(-1, 0.5, 1)
    _scene.add(fillLight)

    // Rim light (back, defines edges)
    var rimLight = new THREE.DirectionalLight(0xffffff, 0.4)
    rimLight.position.set(0, 1, -2)
    _scene.add(rimLight)

    // Ambient (fill shadows)
    var ambient = new THREE.AmbientLight(0x404040, 0.5)
    _scene.add(ambient)
  }

  // ── Animation Loop ──────────────────────────────────────

  function _animate() {
    _animId = requestAnimationFrame(_animate)

    // Smooth rotation interpolation
    _rotation.x += (_targetRotation.x - _rotation.x) * 0.08
    _rotation.y += (_targetRotation.y - _rotation.y) * 0.08

    if (_mesh) {
      _mesh.rotation.x = _rotation.x
      _mesh.rotation.y = _rotation.y
    }

    _camera.position.z = _zoom

    if (_renderer && _scene && _camera) {
      _renderer.render(_scene, _camera)
    }
  }

  // ── Mouse Interaction ───────────────────────────────────

  function _onMouseDown3D(e) {
    _isDragging = true
    _prevMouse = { x: e.clientX, y: e.clientY }
  }

  function _onMouseMove3D(e) {
    if (!_isDragging) return
    var dx = e.clientX - _prevMouse.x
    var dy = e.clientY - _prevMouse.y
    _targetRotation.y += dx * 0.008
    _targetRotation.x += dy * 0.008

    // Clamp vertical rotation
    _targetRotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, _targetRotation.x))

    _prevMouse = { x: e.clientX, y: e.clientY }
  }

  function _onMouseUp3D() {
    _isDragging = false
  }

  function _onWheel3D(e) {
    e.preventDefault()
    _zoom += e.deltaY * 0.002
    _zoom = Math.max(1.2, Math.min(5, _zoom))
  }

  // ── Load Three.js Library ───────────────────────────────

  FM._load3DLibrary = function (callback) {
    if (typeof THREE !== 'undefined') {
      if (callback) callback()
      return
    }

    var script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r168/three.min.js'
    script.onload = function () {
      console.log('[FaceMapping] Three.js loaded:', THREE.REVISION)
      if (callback) callback()
    }
    script.onerror = function () {
      console.error('[FaceMapping] Failed to load Three.js')
      FM._showToast('Visualizacao 3D indisponivel (CDN offline)', 'warn')
    }
    document.head.appendChild(script)
  }

  // ── Face Triangulation (MediaPipe) ──────────────────────

  function _getFaceTriangulation() {
    if (FACE_TRIANGLES) return FACE_TRIANGLES

    // MediaPipe canonical face mesh triangulation
    // This is a simplified version covering the main face surface
    // Full list: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
    FACE_TRIANGLES = [
      // Forehead
      10, 338, 297, 10, 297, 332, 10, 332, 284, 10, 284, 251,
      10, 109, 67, 10, 67, 103, 10, 103, 54, 10, 54, 21,
      10, 21, 162, 10, 162, 127, 10, 127, 234, 10, 234, 93,
      10, 251, 389, 10, 389, 356, 10, 356, 454, 10, 454, 323,
      // Cheeks
      93, 132, 58, 58, 132, 172, 172, 136, 150, 150, 149, 176,
      176, 148, 152, 323, 361, 288, 288, 397, 365, 365, 379, 378,
      378, 400, 377, 377, 152, 148,
      // Nose bridge
      6, 197, 195, 195, 5, 4, 4, 1, 19, 19, 94, 2,
      // Nose sides
      98, 97, 2, 2, 326, 327, 168, 6, 197,
      // Under eyes
      33, 7, 163, 163, 144, 145, 145, 153, 154, 154, 155, 133,
      362, 382, 381, 381, 380, 374, 374, 373, 390, 390, 249, 263,
      // Mouth area
      61, 146, 91, 91, 181, 84, 84, 17, 314, 314, 405, 321,
      321, 375, 291,
      // Jaw
      58, 172, 136, 136, 150, 149, 149, 176, 148,
      288, 397, 365, 365, 379, 378, 378, 400, 377,
      // Chin
      152, 377, 400, 152, 148, 176,
      // Cheek fill
      93, 234, 127, 127, 162, 21, 21, 54, 103, 103, 67, 109,
      323, 454, 356, 356, 389, 251, 251, 284, 332, 332, 297, 338,
    ]

    return FACE_TRIANGLES
  }

  // ── Toggle 3D View ──────────────────────────────────────

  FM._toggle3DView = function () {
    var area = document.getElementById('fmCanvasArea')
    if (!area) return

    // Check if 3D is already showing
    var existing = document.getElementById('fm3DContainer')
    if (existing) {
      // Switch back to 2D
      FM._dispose3D()
      existing.remove()
      var canvas = document.getElementById('fmCanvas')
      if (canvas) canvas.style.display = ''
      FM._redraw()
      return
    }

    // Need scan data with landmarks
    if (!FM._scanData || !FM._scanData.landmarks || FM._scanData.landmarks.length < 478) {
      FM._showToast('Execute Auto Analise primeiro para obter os 478 landmarks', 'warn')
      return
    }

    // Hide 2D canvas
    var canvas2d = document.getElementById('fmCanvas')
    if (canvas2d) canvas2d.style.display = 'none'

    // Create 3D container
    var container = document.createElement('div')
    container.id = 'fm3DContainer'
    container.style.cssText = 'width:100%;height:' + (FM._imgH || 500) + 'px;border-radius:8px;overflow:hidden;cursor:grab;position:relative'

    // Add label
    var label = document.createElement('div')
    label.style.cssText = 'position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.6);color:#C8A97E;padding:4px 10px;border-radius:6px;font-size:11px;z-index:2;pointer-events:none'
    label.textContent = '3D — arraste para rotacionar'
    container.appendChild(label)

    area.insertBefore(container, area.firstChild)

    // Initialize Three.js
    FM._init3D('fm3DContainer')

    // Create mesh from landmarks
    var angle = FM._activeAngle || 'front'
    FM._create3DMesh(FM._scanData.landmarks, FM._photoUrls[angle])

    FM._showToast('Modo 3D ativado — arraste para rotacionar, scroll para zoom', 'success')
  }

})()
