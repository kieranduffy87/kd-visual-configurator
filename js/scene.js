/* ============================================================
   KD VISUAL CONFIGURATOR — the 3D stage
   A terrain field, an optional subject, one key light and a
   procedural studio environment. Everything is driven by state.
   ============================================================ */

import * as THREE from 'three';
import { FIELDS, shoreFalloff, FLAT_SHADED } from './noise.js';
import { byId, COLOURWAYS, MOODS, CAMERAS, LIGHT_COLOURS } from './brand.js';

const PLANE = 96;          // world size of the terrain field
const HALF = PLANE / 2;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Low-discrepancy sequence — spreads the jitter far more evenly than
   Math.random, so a 24-sample draft already looks clean. */
function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}

const UP = new THREE.Vector3(0, 1, 0);
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();

/* KD mark outlines, straight from assets/kd-mark.svg (y flipped, centred). */
const MARK_PATHS = [
  [[18.62, 0], [12, 0], [6, 5.86], [12, 11.73], [18.62, 11.73], [12.62, 5.86]],
  [[0, 0], [0, 11.72], [6, 5.86]],
];

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#06070c', 0.026);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600);
    this.orbit = { az: 0.62, pol: 1.26, dist: 13.5, ty: 1.5 };
    this.tween = null;

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();

    this._buildBackdrop();
    this._buildLights();

    this.terrain = null;
    this.points = null;
    this.subject = null;
    this.state = null;
    this.elapsed = 0;
    this.subjectY = 2.9;

    this._bindPointer();
  }

  /* ---------- backdrop ---------- */

  _buildBackdrop() {
    this.bgUniforms = {
      uTop: { value: new THREE.Color('#020e3e') },
      uBottom: { value: new THREE.Color('#06070c') },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.bgUniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop; uniform vec3 uBottom;
        varying vec3 vDir;
        #include <common>
        void main(){
          float t = smoothstep(-0.45, 0.75, vDir.y);
          vec3 col = mix(uBottom, uTop, t);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.backdrop = new THREE.Mesh(new THREE.SphereGeometry(300, 40, 28), mat);
    this.backdrop.frustumCulled = false;
    this.scene.add(this.backdrop);
  }

  /* Procedural studio environment: a soft sky plus one bright softbox. */
  _buildEnvironment(cw) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, cw.bgTop);
    grad.addColorStop(0.55, cw.fog);
    grad.addColorStop(1, cw.bgBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    const box = g.createRadialGradient(150, 62, 4, 150, 62, 120);
    box.addColorStop(0, 'rgba(255,255,255,0.95)');
    box.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = box;
    g.fillRect(0, 0, 512, 256);
    const fill = g.createRadialGradient(390, 110, 4, 390, 110, 150);
    fill.addColorStop(0, cw.rim + 'cc');
    fill.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fill;
    g.fillRect(0, 0, 512, 256);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const env = this.pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = env;
  }

  /* ---------- lights ---------- */

  _buildLights() {
    this.key = new THREE.DirectionalLight('#ffffff', 2.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.blurSamples = 12;
    const s = this.key.shadow.camera;
    s.left = -22; s.right = 22; s.top = 22; s.bottom = -22; s.near = 1; s.far = 96;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.01;
    this.scene.add(this.key, this.key.target);

    this.rim = new THREE.DirectionalLight('#0339f8', 1.2);
    this.scene.add(this.rim);

    this.ambient = new THREE.HemisphereLight('#ffffff', '#0a0b0e', 0.6);
    this.scene.add(this.ambient);
  }

  /* ---------- terrain ---------- */

  _terrainMaterial(cw, style) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: style === 'grid' ? 0.9 : 0.56,
      metalness: 0.12,
      flatShading: false,
    });
    const u = {
      uContour: { value: style === 'contour' ? 1 : 0 },
      uGrid: { value: style === 'grid' ? 1 : 0 },
      uLine: { value: new THREE.Color(cw.line) },
      uContourFreq: { value: 3.2 },
      uGridFreq: { value: 34.0 },
      uGrain: { value: style === 'grid' ? 0.0 : 1.0 },
    };
    mat.userData.u = u;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec2 vGridUv;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vGridUv = uv;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos; varying vec2 vGridUv;
          uniform float uContour; uniform float uGrid;
          uniform vec3 uLine; uniform float uContourFreq; uniform float uGridFreq;
          uniform float uGrain;
          float kdLine(float v){
            float f = fract(v);
            float w = fwidth(v) * 1.25;
            return 1.0 - smoothstep(0.0, max(w, 0.0008), min(f, 1.0 - f));
          }
          float kdHash(vec2 p){
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (uGrain > 0.0) {
            // Fine surface break-up so large faces don't read as flat plastic.
            float g = kdHash(floor(vWPos.xz * 26.0)) - 0.5;
            float gFar = kdHash(floor(vWPos.xz * 3.5)) - 0.5;
            diffuseColor.rgb *= 1.0 + (g * 0.075 + gFar * 0.05) * uGrain;
          }
          float kdMask = 0.0;
          if (uContour > 0.0) kdMask = max(kdMask, kdLine(vWPos.y * uContourFreq) * uContour);
          if (uGrid > 0.0) kdMask = max(kdMask,
            max(kdLine(vGridUv.x * uGridFreq), kdLine(vGridUv.y * uGridFreq)) * uGrid);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLine, clamp(kdMask, 0.0, 1.0));`);
    };
    return mat;
  }

  _buildTerrain(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const segs = Math.round(140 + state.detail * 300);
    const amp = 0.6 + state.amplitude * 6.5;
    const field = FIELDS[state.scene] || FIELDS.dunes;
    const row = segs + 1;

    const geo = new THREE.PlaneGeometry(PLANE, PLANE, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(cw.low);
    const hi = new THREE.Color(state.surface === 'grid' ? cw.low : cw.high);
    const slopeCol = new THREE.Color(cw.slope || cw.high);
    const tmp = new THREE.Color();
    let peak = 0.0001;
    let trough = 1e9;
    const heights = new Float32Array(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = field(x, z, state.seed) * shoreFalloff(x, z, HALF);
      heights[i] = h;
      if (h > peak) peak = h;
      if (h < trough) trough = h;
    }
    const span = Math.max(0.001, peak - trough);
    const centre = field(0, 0, state.seed) * shoreFalloff(0, 0, HALF) * amp;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heights[i] * amp - centre);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;

    /* Cheap ambient occlusion: how far a vertex sits below the average of a
       ring of neighbours. Valleys darken, crests stay open. Costs one pass. */
    const reach = Math.max(2, Math.round(segs / 40));
    const at = (ix, iy) => heights[
      Math.min(segs, Math.max(0, iy)) * row + Math.min(segs, Math.max(0, ix))
    ];

    for (let i = 0; i < pos.count; i++) {
      const ix = i % row;
      const iy = (i / row) | 0;
      const h = heights[i];

      const around = (
        at(ix - reach, iy) + at(ix + reach, iy) + at(ix, iy - reach) + at(ix, iy + reach) +
        at(ix - reach, iy - reach) + at(ix + reach, iy + reach) +
        at(ix - reach, iy + reach) + at(ix + reach, iy - reach)
      ) / 8;
      const ao = 0.62 + 0.38 * Math.min(1, Math.max(0, 0.5 + (h - around) / (span * 0.55)));

      /* 0 on flat ground, 1 on a vertical face. */
      const steep = Math.min(1, Math.max(0, (1 - nrm.getY(i)) * 2.6));

      tmp.copy(lo).lerp(hi, Math.pow((h - trough) / span, 0.65));
      tmp.lerp(slopeCol, steep * 0.72);
      tmp.multiplyScalar(ao);

      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this._disposeTerrain();

    if (state.surface === 'points') {
      const mat = new THREE.PointsMaterial({
        size: 0.055 + (1 - state.detail) * 0.06,
        vertexColors: true, sizeAttenuation: true,
        map: this._dotTexture(), transparent: true, alphaTest: 0.4, fog: true,
      });
      this.points = new THREE.Points(geo, mat);
      this.scene.add(this.points);
    } else {
      const mat = this._terrainMaterial(cw, state.surface);
      mat.flatShading = FLAT_SHADED.has(state.scene);
      this.terrain = new THREE.Mesh(geo, mat);
      this.terrain.receiveShadow = true;
      this.terrain.castShadow = true;
      this.scene.add(this.terrain);
    }
    this.peakHeight = peak * amp - centre;
  }

  _dotTexture() {
    if (this._dotTex) return this._dotTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(32, 32, 28, 0, Math.PI * 2);
    g.fill();
    this._dotTex = new THREE.CanvasTexture(c);
    return this._dotTex;
  }

  _disposeTerrain() {
    for (const obj of [this.terrain, this.points]) {
      if (!obj) continue;
      this.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }
    this.terrain = null;
    this.points = null;
  }

  /* ---------- subject ---------- */

  _markGeometry() {
    const shapes = MARK_PATHS.map((pts) => {
      const s = new THREE.Shape();
      pts.forEach(([x, y], i) => {
        const px = x - 9.31;
        const py = (11.73 - y) - 5.865;
        if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
      });
      s.closePath();
      return s;
    });
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: 3.4, bevelEnabled: true, bevelThickness: 0.28,
      bevelSize: 0.24, bevelSegments: 4, curveSegments: 4,
    });
    geo.center();
    geo.scale(0.30, 0.30, 0.30);
    return geo;
  }

  _subjectGeometry(id) {
    switch (id) {
      case 'mark': return this._markGeometry();
      case 'sphere': return new THREE.IcosahedronGeometry(1.65, 24);
      case 'torus': return new THREE.TorusGeometry(1.6, 0.5, 48, 160);
      case 'monolith': {
        const g = new THREE.BoxGeometry(1.2, 3.6, 1.2, 4, 8, 4);
        return g;
      }
      default: return null;
    }
  }

  _subjectMaterial(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const accent = new THREE.Color(cw.accent);
    switch (state.material) {
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: '#ffffff', transmission: 1, thickness: 1.6, roughness: 0.06,
          ior: 1.5, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
          attenuationColor: accent, attenuationDistance: 2.4, specularIntensity: 1,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({ color: '#dfe2e8', metalness: 1, roughness: 0.17 });
      case 'matte':
        return new THREE.MeshStandardMaterial({
          color: accent, metalness: 0, roughness: 0.92, envMapIntensity: 0.5,
        });
      default:
        /* Brand: the accent has to survive the environment, so the env
           contribution is dialled back rather than left at full strength. */
        return new THREE.MeshPhysicalMaterial({
          color: accent, metalness: 0.12, roughness: 0.3,
          clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: 0.55,
        });
    }
  }

  _buildSubject(state) {
    if (this.subject) {
      this.scene.remove(this.subject);
      this.subject.geometry.dispose();
      this.subject.material.dispose();
      this.subject = null;
    }
    const geo = this._subjectGeometry(state.object);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this._subjectMaterial(state));
    mesh.castShadow = state.material !== 'glass';
    mesh.position.set(0, this.subjectY, 0);
    mesh.rotation.set(0, -0.35, 0);
    this.subject = mesh;
    this.scene.add(mesh);
  }

  /* ---------- look ---------- */

  _applyColourway(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    this.bgUniforms.uTop.value.set(cw.bgTop);
    this.bgUniforms.uBottom.value.set(cw.bgBottom);
    this.scene.fog.color.set(cw.fog);
    this.rim.color.set(cw.rim);
    this.renderer.toneMappingExposure = cw.exposure;
    this.ambient.color.set(cw.text === 'dark' ? '#ffffff' : '#c7d2ff');
    this.ambient.groundColor.set(cw.low);
    this._buildEnvironment(cw);
  }

  _applyLight(state) {
    const mood = byId(MOODS, state.mood);
    const cw = byId(COLOURWAYS, state.colourway);

    /* 'auto' hands the choice back to the colourway. */
    const keyHex = byId(LIGHT_COLOURS, state.keyColour).hex || '#ffffff';
    const rimHex = byId(LIGHT_COLOURS, state.rimColour).hex || cw.rim;
    this.key.color.set(keyHex);
    this.rim.color.set(rimHex);

    const el = state.lightEl * (Math.PI / 2 - 0.12) + 0.06;
    const r = 26;
    this.key.position.set(
      Math.cos(state.lightAz) * Math.cos(el) * r,
      Math.sin(el) * r,
      Math.sin(state.lightAz) * Math.cos(el) * r,
    );
    this.key.target.position.set(0, 0.8, 0);
    this.key.target.updateMatrixWorld();
    this.key.intensity = 0.6 + state.lightPower * 4.2;
    this.key.shadow.radius = mood.soft;
    this.rim.position.set(
      -Math.cos(state.lightAz) * 20, 6, -Math.sin(state.lightAz) * 20,
    );
    this.rim.intensity = mood.rim * (0.5 + state.lightPower);
    this.ambient.intensity = mood.ambient;
    this.scene.fog.density = mood.fog;
  }

  /* ---------- camera ---------- */

  setCamera(id, animate = true) {
    const c = byId(CAMERAS, id);
    const to = { az: c.az, pol: c.pol, dist: c.dist, ty: c.ty };
    this.targetFov = c.fov;
    if (!animate) {
      Object.assign(this.orbit, to);
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
      return;
    }
    this.tween = { from: { ...this.orbit, fov: this.camera.fov }, to: { ...to, fov: c.fov }, t: 0 };
  }

  _bindPointer() {
    const el = this.canvas;
    let dragging = false, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      el.setPointerCapture(e.pointerId);
      this.tween = null;
      el.classList.add('is-dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.orbit.az -= dx * 0.005;
      this.orbit.pol = Math.min(1.56, Math.max(0.08, this.orbit.pol - dy * 0.004));
      this.onOrbit && this.onOrbit();
    });
    const stop = (e) => {
      dragging = false;
      el.classList.remove('is-dragging');
      if (e.pointerId != null && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.tween = null;
      this.orbit.dist = Math.min(34, Math.max(4, this.orbit.dist * (1 + e.deltaY * 0.0011)));
      this.onOrbit && this.onOrbit();
    }, { passive: false });
  }

  /* ---------- public ---------- */

  update(state, prev) {
    const changed = (...keys) => !prev || keys.some((k) => state[k] !== prev[k]);

    if (changed('colourway')) this._applyColourway(state);
    if (changed('scene', 'detail', 'amplitude', 'seed', 'surface', 'colourway')) this._buildTerrain(state);
    if (changed('object', 'material', 'colourway')) this._buildSubject(state);
    if (changed('mood', 'lightAz', 'lightEl', 'lightPower', 'keyColour', 'rimColour', 'colourway')) {
      this._applyLight(state);
    }
    if (changed('camera')) this.setCamera(state.camera, !!prev);
    this.state = state;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    this.elapsed += dt;
    if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt / 0.75);
      const e = easeInOut(this.tween.t);
      const { from, to } = this.tween;
      this.orbit.az = from.az + (to.az - from.az) * e;
      this.orbit.pol = from.pol + (to.pol - from.pol) * e;
      this.orbit.dist = from.dist + (to.dist - from.dist) * e;
      this.orbit.ty = from.ty + (to.ty - from.ty) * e;
      this.camera.fov = from.fov + (to.fov - from.fov) * e;
      this.camera.updateProjectionMatrix();
      if (this.tween.t >= 1) this.tween = null;
    }

    const { az, pol, dist, ty } = this.orbit;
    this.camera.position.set(
      Math.sin(pol) * Math.cos(az) * dist,
      Math.cos(pol) * dist + ty,
      Math.sin(pol) * Math.sin(az) * dist,
    );
    this.camera.lookAt(0, ty, 0);

    if (this.subject) {
      const t = this.elapsed;
      const drift = this.state && this.state.motion ? 1 : 0;
      this.subject.position.y = this.subjectY + Math.sin(t * 0.5) * 0.16 * drift;
      this.subject.rotation.y = -0.35 + t * 0.14 * drift;
      this.subject.rotation.x = Math.sin(t * 0.33) * 0.1 * drift;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /* ============================================================
     Progressive accumulation

     One jittered sample per pass, averaged in linear light. The
     jitter does three jobs at once: sub-pixel camera offsets give
     true supersampling, offsetting the key light across a small
     disc turns its hard edge into a real penumbra, and offsetting
     the eye across a lens disc while holding the focal plane gives
     depth of field. Sixty-four passes of that is what separates a
     WebGL frame from something that reads as a render.
     ============================================================ */

  _ensureAccum(w, h) {
    if (this.rtScene && this.rtScene.width === w && this.rtScene.height === h) return;
    this._disposeAccum();
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    const flat = {
      type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    };
    this.rtA = new THREE.WebGLRenderTarget(w, h, flat);
    this.rtB = new THREE.WebGLRenderTarget(w, h, flat);
  }

  _disposeAccum() {
    for (const rt of [this.rtScene, this.rtA, this.rtB]) if (rt) rt.dispose();
    this.rtScene = this.rtA = this.rtB = null;
  }

  _ensureQuad() {
    if (this.quadMesh) return;
    const vert = /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

    this.blendMat = new THREE.ShaderMaterial({
      uniforms: { tNew: { value: null }, tPrev: { value: null }, uWeight: { value: 1 } },
      vertexShader: vert,
      fragmentShader: /* glsl */`
        uniform sampler2D tNew; uniform sampler2D tPrev; uniform float uWeight;
        varying vec2 vUv;
        void main(){
          gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tNew, vUv), uWeight);
        }`,
      depthTest: false, depthWrite: false,
    });

    /* The accumulation buffers hold linear light; the canvas wants sRGB. */
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: { tAccum: { value: null } },
      vertexShader: vert,
      fragmentShader: /* glsl */`
        uniform sampler2D tAccum;
        varying vec2 vUv;
        void main(){
          vec3 c = max(texture2D(tAccum, vUv).rgb, vec3(0.0));
          vec3 s = mix(c * 12.92,
                       1.055 * pow(c, vec3(0.4166666)) - 0.055,
                       step(vec3(0.0031308), c));
          gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMat);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  /**
   * @param {object} opts
   *   w, h      target pixels — omit to accumulate at the current buffer size
   *   focus     0..1 depth of field
   *   soft      shadow softness multiplier (mood.soft)
   */
  beginAccumulation(opts = {}) {
    this._ensureQuad();

    const buf = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(buf);
    const resize = opts.w != null && opts.h != null;
    const w = resize ? opts.w : buf.x;
    const h = resize ? opts.h : buf.y;

    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);

    this.acc = {
      w, h, i: 0, resize,
      focus: opts.focus || 0,
      soft: opts.soft || 1,
      basePos: this.camera.position.clone(),
      baseTarget: new THREE.Vector3(0, this.orbit.ty, 0),
      lightPos: this.key.position.clone(),
      prevSize, prevRatio: this.renderer.getPixelRatio(),
      prevAspect: this.camera.aspect,
    };

    if (resize) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this._ensureAccum(w, h);

    /* Focal plane sits on the subject when there is one, otherwise on the
       camera target — measured along the view axis so the centre stays put. */
    const dir = this.acc.baseTarget.clone().sub(this.acc.basePos).normalize();
    const focusOn = this.subject ? this.subject.position : this.acc.baseTarget;
    this.acc.dir = dir;
    this.acc.focalDist = focusOn.clone().sub(this.acc.basePos).dot(dir);
  }

  accumulateSample() {
    const a = this.acc;
    if (!a) return 0;
    const i = a.i + 1;

    /* Sub-pixel offset — supersampling. */
    this.camera.setViewOffset(a.w, a.h, halton(i, 2) - 0.5, halton(i, 3) - 0.5, a.w, a.h);

    /* Lens offset — depth of field. */
    if (a.focus > 0) {
      const radius = Math.sqrt(halton(i, 5)) * a.focus;
      const theta = halton(i, 7) * Math.PI * 2;
      const right = TMP_A.crossVectors(a.dir, UP).normalize();
      const up = TMP_B.crossVectors(right, a.dir).normalize();
      this.camera.position.copy(a.basePos)
        .addScaledVector(right, Math.cos(theta) * radius)
        .addScaledVector(up, Math.sin(theta) * radius);
      this.camera.lookAt(TMP_C.copy(a.basePos).addScaledVector(a.dir, a.focalDist));
    }

    /* Light offset — soft shadows. */
    const lightRadius = a.soft * 0.45;
    const ld = TMP_C.copy(a.lightPos).normalize();
    const lRight = TMP_A.crossVectors(ld, UP).normalize();
    const lUp = TMP_B.crossVectors(lRight, ld).normalize();
    const lr = Math.sqrt(halton(i, 11)) * lightRadius;
    const lt = halton(i, 13) * Math.PI * 2;
    this.key.position.copy(a.lightPos)
      .addScaledVector(lRight, Math.cos(lt) * lr)
      .addScaledVector(lUp, Math.sin(lt) * lr);

    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.render(this.scene, this.camera);

    this.quadMesh.material = this.blendMat;
    this.blendMat.uniforms.tNew.value = this.rtScene.texture;
    this.blendMat.uniforms.tPrev.value = this.rtA.texture;
    this.blendMat.uniforms.uWeight.value = 1 / i;   // i = 1 ignores the empty buffer
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.render(this.quadScene, this.quadCamera);

    const swap = this.rtA; this.rtA = this.rtB; this.rtB = swap;
    this.renderer.setRenderTarget(null);

    a.i = i;
    return i;
  }

  /* Paints the accumulated result onto the canvas. */
  blitAccumulation() {
    if (!this.acc) return;
    this._ensureQuad();
    this.quadMesh.material = this.blitMat;
    this.blitMat.uniforms.tAccum.value = this.rtA.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  endAccumulation() {
    const a = this.acc;
    if (!a) return;
    this.camera.clearViewOffset();
    this.camera.position.copy(a.basePos);
    this.camera.lookAt(a.baseTarget);
    this.key.position.copy(a.lightPos);

    /* Only touch the size if we changed it — assigning canvas.width wipes
       the drawing buffer, which would erase the frame we just blitted. */
    if (a.resize) {
      this.renderer.setPixelRatio(a.prevRatio);
      this.renderer.setSize(a.prevSize.x, a.prevSize.y, false);
      this.camera.aspect = a.prevAspect;
      this.camera.updateProjectionMatrix();
    }
    this.acc = null;
  }

  cancelAccumulation() {
    if (this.acc) this.endAccumulation();
  }

  /**
   * Full-quality export. Yields to the event loop between batches so the
   * progress indicator can paint.
   * @returns {Promise<HTMLCanvasElement>}
   */
  async renderAccumulated(w, h, samples, opts = {}, onProgress) {
    this.beginAccumulation({ w, h, focus: opts.focus, soft: opts.soft });
    for (let i = 0; i < samples; i++) {
      this.accumulateSample();
      if (i % 6 === 5 || i === samples - 1) {
        onProgress && onProgress((i + 1) / samples);
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    this.blitAccumulation();

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(this.renderer.domElement, 0, 0, w, h);

    this.endAccumulation();

    /* Transmission materials cache a render target sized to the buffer they
       were first drawn into. Rebuilding the subject drops that cache so the
       preview doesn't go dark after an export. */
    if (this.state && this.state.material === 'glass') this._buildSubject(this.state);

    return out;
  }
}
