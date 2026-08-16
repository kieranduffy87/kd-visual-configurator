/* ============================================================
   KD VISUAL CONFIGURATOR — the 3D stage
   A terrain field, an optional subject, one key light and a
   procedural studio environment. Everything is driven by state.
   ============================================================ */

import * as THREE from 'three';
import { FIELDS, shoreFalloff, FLAT_SHADED, loopNoise, fbm3 } from './noise.js';
import { byId, COLOURWAYS, MOODS, CAMERAS, LIGHT_COLOURS, WORLDS } from './brand.js';

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

  /* ============================================================
     Sky and environment

     One GLSL function describes the world: gradient, horizon glow, a
     sun disc, two softboxes and a ground bounce. The visible backdrop
     and the reflection probe both evaluate it, so what you see in the
     sky is what glass and metal reflect. The probe is rendered to a
     half-float target rather than a canvas, which lets the sun carry
     values far above 1 — that headroom is what gives specular
     highlights their punch.
     ============================================================ */

  _skyUniforms() {
    if (this.sky) return this.sky;
    this.sky = {
      uTop: { value: new THREE.Color('#020e3e') },
      uBottom: { value: new THREE.Color('#06070c') },
      uHorizon: { value: new THREE.Color('#050a24') },
      uGround: { value: new THREE.Color('#04050a') },
      uSunDir: { value: new THREE.Vector3(0, 0.4, 1).normalize() },
      uSunColor: { value: new THREE.Color('#ffffff') },
      uSunPower: { value: 24 },
      uFillDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
      uFillColor: { value: new THREE.Color('#3f6bff') },
      uFillPower: { value: 3 },
      uGlow: { value: 1 },
      uPanel: { value: 0 },
    };
    return this.sky;
  }

  static get SKY_GLSL() {
    return /* glsl */`
      uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uHorizon; uniform vec3 uGround;
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunPower;
      uniform vec3 uFillDir; uniform vec3 uFillColor; uniform float uFillPower;
      uniform float uGlow; uniform float uFillVis; uniform float uPanel;

      vec3 kdSky(vec3 dir) {
        float h = dir.y;

        // sky body, then the ground half folded under it
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.72, h));
        col = mix(col, uBottom, smoothstep(0.0, -0.35, h));
        col = mix(col, uGround, smoothstep(-0.12, -0.6, h) * 0.85);

        // horizon band — the thing that reads as atmosphere
        col += uHorizon * exp(-abs(h) * 9.0) * 0.55 * uGlow;

        // key. the tight core is the visible disc, the wide lobe is its glow
        float sd = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * pow(sd, 2200.0) * uSunPower * 14.0;
        col += uSunColor * pow(sd, 26.0) * uSunPower * 0.16 * uGlow;

        // Fill softbox. Wanted at full strength in reflections, but only
        // hinted at in the visible sky or it reads as a blotch.
        float fd = max(dot(dir, uFillDir), 0.0);
        col += uFillColor * pow(fd, 11.0) * uFillPower * 0.26 * uFillVis;

        // Broad studio panels. A tight softbox reads as a hot dot in a mirror;
        // an area light needs a wide lobe. Only the empty worlds switch these on.
        if (uPanel > 0.0) {
          float pd = max(dot(dir, uFillDir), 0.0);
          col += uFillColor * pow(pd, 2.2) * uPanel * 0.55;
          col += uSunColor * smoothstep(0.25, 1.0, h) * uPanel * 0.42;   // overhead wash
          col += uHorizon * smoothstep(0.15, -0.5, h) * uPanel * 0.12;   // floor lift

          // Strip lights. Structure is the point: a smooth environment gives
          // chrome nothing to streak and glass nothing to refract, so the
          // material studies hang their whole look on these bands.
          float strips = sin(h * 13.0 + 1.2);
          col += uSunColor * smoothstep(0.55, 0.98, strips) * uPanel * 0.62 * uFillVis;

          // and a few vertical louvres so it isn't rotationally symmetric
          float az = atan(dir.z, dir.x);
          float louvre = sin(az * 3.0 + 0.7);
          col += uFillColor * smoothstep(0.72, 1.0, louvre)
                 * smoothstep(-0.15, 0.55, h) * uPanel * 0.55 * uFillVis;
        }

        // bounce off the ground back into the lower sky
        col += uGround * max(0.0, -h) * 0.25;

        return max(col, vec3(0.0));
      }`;
  }

  _buildBackdrop() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { ...this._skyUniforms(), uFillVis: { value: 0.25 } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        #include <common>
        ${Stage.SKY_GLSL}
        void main(){
          gl_FragColor = vec4(kdSky(normalize(vDir)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.backdrop = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 40), mat);
    this.backdrop.frustumCulled = false;
    this.scene.add(this.backdrop);
  }

  /* Renders the sky into an equirect target and prefilters it for IBL. */
  _updateEnvironment() {
    if (!this.envRT) {
      this.envRT = new THREE.WebGLRenderTarget(1024, 512, {
        type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
      });
      this.envRT.texture.mapping = THREE.EquirectangularReflectionMapping;
    }
    this._ensureQuad();
    if (!this.envMat) {
      this.envMat = new THREE.ShaderMaterial({
        uniforms: { ...this._skyUniforms(), uFillVis: { value: 1.0 } },
        depthTest: false, depthWrite: false,
        vertexShader: /* glsl */`
          varying vec2 vUv;
          void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */`
          varying vec2 vUv;
          #include <common>
          ${Stage.SKY_GLSL}
          void main(){
            // three's equirect convention, inverted
            float phi = (vUv.x - 0.5) * 2.0 * PI;
            float theta = (vUv.y - 0.5) * PI;
            vec3 dir = vec3(cos(theta) * cos(phi), sin(theta), cos(theta) * sin(phi));
            gl_FragColor = vec4(kdSky(dir), 1.0);
          }`,
      });
    }

    const prevTarget = this.renderer.getRenderTarget();
    this.quadMesh.material = this.envMat;
    this.renderer.setRenderTarget(this.envRT);
    this.renderer.render(this.quadScene, this.quadCamera);
    this.renderer.setRenderTarget(prevTarget);

    const env = this.pmrem.fromEquirectangular(this.envRT.texture).texture;
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
    /* Levelling keeps framing stable across seeds, but the sea needs a fixed
       waterline, so there the raw heights are kept. */
    const centre = state.world === 'sea'
      ? 0
      : field(0, 0, state.seed) * shoreFalloff(0, 0, HALF) * amp;
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
    this.waterLevel = trough * amp - centre + span * amp * 0.12;
  }

  /* ============================================================
     Worlds

     `field` and `sea` are the terrain. `studio` is a cyclorama — the
     same heightfield trick, just with a profile that sweeps up into a
     back wall instead of noise. `void` is a polished floor and nothing
     else, which is where the environment probe does all the work.
     ============================================================ */

  _disposeWorld() {
    for (const key of ['cyc', 'floor', 'water', 'abstract']) {
      const obj = this[key];
      if (!obj) continue;
      this.scene.remove(obj);
      obj.traverse((n) => {
        if (n.geometry) n.geometry.dispose();
        if (n.material) n.material.dispose();
      });
      this[key] = null;
    }
  }

  _buildStudio(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const SIZE = 96, SEG = 240;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);

    /* A radial cove rather than a back wall: flat underfoot, then a wide
       radius sweeping up in every direction, so the seam stays invisible
       from any camera azimuth. */
    const pos = geo.attributes.position;
    const flatTo = 11, riseTo = 40, wallH = 30;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const t = Math.min(1, Math.max(0, (r - flatTo) / (riseTo - flatTo)));
      const eased = t * t * (3 - 2 * t);
      pos.setY(i, eased * eased * wallH);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: cw.text === 'dark' ? '#eceae4' : '#1c1f27',
      roughness: 0.95, metalness: 0.0, envMapIntensity: 0.6,
    });
    this.cyc = new THREE.Mesh(geo, mat);
    this.cyc.receiveShadow = true;
    this.scene.add(this.cyc);
  }

  _buildVoidFloor(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const geo = new THREE.PlaneGeometry(400, 400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshPhysicalMaterial({
      color: cw.bgBottom,
      roughness: 0.16, metalness: 0.55,
      envMapIntensity: 1.5,
      clearcoat: 1, clearcoatRoughness: 0.12,
    });
    this.floor = new THREE.Mesh(geo, mat);
    this.floor.position.y = -1.6;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  _buildWater(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const geo = new THREE.PlaneGeometry(PLANE * 1.6, PLANE * 1.6, 200, 200);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshPhysicalMaterial({
      color: cw.low,
      roughness: 0.06, metalness: 0.12,
      envMapIntensity: 2.4,
      clearcoat: 1, clearcoatRoughness: 0.04,
      transmission: 0.18, thickness: 2.0,
      ior: 1.33,
    });

    /* Ripples live in the vertex shader so there's no texture to ship. */
    const u = { uTime: { value: 0 } };
    mat.userData.u = u;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          float kdWave(vec2 p){
            return sin(p.x * 0.42 + uTime * 0.55) * cos(p.y * 0.33 - uTime * 0.4)
                 + sin((p.x + p.y) * 0.24 + uTime * 0.8) * 0.6;
          }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 wp = (modelMatrix * vec4(transformed, 1.0)).xz;
          transformed.y += kdWave(wp) * 0.06;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec2 np = (modelMatrix * vec4(position, 1.0)).xz;
          float e = 0.6;
          float hx = kdWave(np + vec2(e, 0.0)) - kdWave(np - vec2(e, 0.0));
          float hy = kdWave(np + vec2(0.0, e)) - kdWave(np - vec2(0.0, e));
          objectNormal = normalize(vec3(-hx * 0.09, 1.0, -hy * 0.09));`);
    };

    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.waterLevel || 0;
    this.scene.add(this.water);
  }

  /* ============================================================
     Abstract worlds

     No ground, no horizon — the frame is filled by one material
     study. These lean entirely on the environment probe, so they
     run with the studio panels turned up.
     ============================================================ */

  /* Metal tints derived from the colourway, so a stack still reads as KD. */
  _metalPalette(cw) {
    return [
      { color: '#e8ebf2', rough: 0.09, metal: 1.0 },
      { color: cw.accent, rough: 0.16, metal: 1.0 },
      { color: cw.slope || cw.high, rough: 0.28, metal: 0.9 },
      { color: cw.low, rough: 0.12, metal: 1.0 },
      { color: cw.high, rough: 0.22, metal: 1.0 },
    ];
  }

  /* Stacked, extruded plates — multi-layered metal. Each plate is a closed
     loop of noise sampled around a circle, so the outlines are organic and
     no two layers repeat. */
  _buildStrata(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const palette = this._metalPalette(cw);
    const layers = Math.round(18 + state.detail * 34);
    const lift = 0.075 + state.amplitude * 0.115;
    const group = new THREE.Group();

    for (let i = 0; i < layers; i++) {
      const t = i / Math.max(1, layers - 1);

      /* Radius wanders instead of tapering — a monotonic taper reads as a
         cake, this reads as a milled block that's been eroded. */
      const wander = loopNoise(t * 5.4 + 0.3, 1.9, state.seed + 401);
      const radius = 4.1 * (0.55 + wander * 0.75) * (1 - t * 0.16);

      const pts = [];
      const N = 148;
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const wob = loopNoise(a, 2.2 + t * 2.6, state.seed + i * 37);
        const r = radius * (0.8 + wob * 0.4);
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
        depth: lift * 0.78, bevelEnabled: true,
        bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1,
      });
      geo.rotateX(-Math.PI / 2);

      /* Mostly neutral steel, with the brand metal used as an occasional
         seam rather than every other plate. */
      const spec = (i % 7 === 3) ? palette[1] : palette[i % 2 === 0 ? 0 : 2];
      const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: spec.color, metalness: spec.metal, roughness: spec.rough,
        envMapIntensity: 1.9, clearcoat: 0.3, clearcoatRoughness: 0.15,
      }));
      mesh.position.y = i * lift;
      mesh.position.x = (loopNoise(t * 4.3, 1.5, state.seed + 11) - 0.5) * 3.4;
      mesh.position.z = (loopNoise(t * 4.3, 1.5, state.seed + 91) - 0.5) * 3.4;
      mesh.rotation.y = t * Math.PI * 1.4;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    group.position.y = -layers * lift * 0.5;
    this.abstract = group;
    this.scene.add(group);
  }

  /* Liquid chrome — a sphere pushed around by 3D noise. Displaced on the
     CPU so the normals can be recomputed properly; a vertex-shader version
     would need analytic derivatives to avoid faceting. */
  _buildFlux(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const geo = new THREE.IcosahedronGeometry(2.6, Math.round(28 + state.detail * 36));
    const pos = geo.attributes.position;
    const amp = 0.14 + state.amplitude * 0.5;
    const freq = 0.28 + state.detail * 0.34;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      /* Two octaves only: a mirror amplifies every wrinkle, so the fine
         octaves that read as detail on a matte surface read as crushed foil
         on chrome. */
      const n = fbm3(v.x * freq, v.y * freq, v.z * freq, state.seed, 2);
      const push = 1 + (n - 0.5) * amp;
      pos.setXYZ(i, v.x * push, v.y * push, v.z * push);
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: '#f2f4f8', metalness: 1, roughness: 0.16,
      envMapIntensity: 1.9,
      iridescence: 0.55, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 520],
    }));
    mesh.castShadow = true;
    this.abstract = mesh;
    this.scene.add(mesh);
  }

  /* Flowing refracted glass — one continuous tube following a closed noise
     curve, in dispersive glass. A single form on purpose: three's
     transmission samples the opaque buffer, so glass never refracts glass
     and a cluster would read flat where the pieces overlap. */
  _buildPrism(state) {
    const cw = byId(COLOURWAYS, state.colourway);
    const points = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 2.9 * (0.72 + loopNoise(a, 2.0, state.seed) * 0.5);
      points.push(new THREE.Vector3(
        Math.cos(a) * r,
        (loopNoise(a, 1.6, state.seed + 55) - 0.5) * (1.2 + state.amplitude * 4.0),
        Math.sin(a) * r,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.6);
    const geo = new THREE.TubeGeometry(curve, Math.round(200 + state.detail * 420), 0.55 + state.amplitude * 0.5, 36, true);

    const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transmission: 1, thickness: 2.2, ior: 1.55,
      roughness: 0.04, metalness: 0,
      dispersion: 3.4,
      clearcoat: 1, clearcoatRoughness: 0.04,
      attenuationColor: new THREE.Color(cw.accent), attenuationDistance: 6,
      envMapIntensity: 1.8,
    }));
    this.abstract = mesh;
    this.scene.add(mesh);
  }

  _buildWorld(state) {
    const world = byId(WORLDS, state.world);
    this._disposeWorld();
    if (!world.terrain) this._disposeTerrain();

    if (world.id === 'studio') this._buildStudio(state);
    else if (world.id === 'void') this._buildVoidFloor(state);
    else if (world.id === 'sea') this._buildWater(state);
    else if (world.id === 'strata') this._buildStrata(state);
    else if (world.id === 'flux') this._buildFlux(state);
    else if (world.id === 'prism') this._buildPrism(state);

    /* Empty worlds want the subject on the deck, not floating in mid air. */
    this.subjectY = world.terrain ? 2.9
      : world.id === 'studio' ? 1.9
      : world.form ? 0 : 1.2;
    if (this.subject) this.subject.position.y = this.subjectY;
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
    const sky = this._skyUniforms();
    sky.uTop.value.set(cw.bgTop);
    sky.uBottom.value.set(cw.bgBottom);
    sky.uHorizon.value.set(cw.fog);
    sky.uGround.value.set(cw.low);
    this.scene.fog.color.set(cw.fog);
    this.renderer.toneMappingExposure = cw.exposure;
    this.ambient.color.set(cw.text === 'dark' ? '#ffffff' : '#c7d2ff');
    this.ambient.groundColor.set(cw.low);
  }

  _applyLight(state) {
    const mood = byId(MOODS, state.mood);
    const cw = byId(COLOURWAYS, state.colourway);
    /* Worlds without terrain have nothing but the environment to light them,
       so the probe carries more of the load there. */
    const world = byId(WORLDS, state.world);
    this.scene.environmentIntensity = world.envIntensity;

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
    this.ambient.intensity = mood.ambient * (world.terrain ? 1 : 1.5);
    this.scene.fog.density = world.terrain ? mood.fog : mood.fog * 0.25;

    /* The sky's sun is the key light, so highlights and reflections agree. */
    const sky = this._skyUniforms();
    sky.uSunDir.value.copy(this.key.position).normalize();
    sky.uSunColor.value.set(keyHex);
    sky.uSunPower.value = (0.35 + state.lightPower * 1.9)
      * (mood.id === 'ambient' ? 0.45 : 1) * world.skyBoost;
    sky.uFillDir.value.copy(this.rim.position).normalize();
    sky.uFillColor.value.set(rimHex);
    sky.uFillPower.value = mood.rim * world.skyBoost;
    sky.uGlow.value = mood.id === 'noir' ? 0.45 : mood.id === 'contrast' ? 0.8 : 1.15;
    sky.uPanel.value = Math.max(0, world.skyBoost - 1) * (0.4 + state.lightPower * 0.9);
  }

  /* ---------- camera ---------- */

  setCamera(id, animate = true) {
    const c = byId(CAMERAS, id);
    const k = this.state ? byId(WORLDS, this.state.world).camScale : 1;
    const to = { az: c.az, pol: c.pol, dist: c.dist * k, ty: c.ty * k };
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
      if (dx === 0 && dy === 0) return;
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
      if (!e.deltaY) return;
      this.tween = null;
      this.orbit.dist = Math.min(34, Math.max(4, this.orbit.dist * (1 + e.deltaY * 0.0011)));
      this.onOrbit && this.onOrbit();
    }, { passive: false });
  }

  /* ---------- public ---------- */

  update(state, prev) {
    const changed = (...keys) => !prev || keys.some((k) => state[k] !== prev[k]);

    if (changed('colourway')) this._applyColourway(state);
    if (changed('world', 'scene', 'detail', 'amplitude', 'seed', 'surface', 'colourway')) {
      if (byId(WORLDS, state.world).terrain) this._buildTerrain(state);
      else this._disposeTerrain();
      this._buildWorld(state);          // needs waterLevel, so terrain goes first
    }
    if (changed('world', 'object', 'material', 'colourway')) this._buildSubject(state);
    if (changed('world', 'mood', 'lightAz', 'lightEl', 'lightPower', 'keyColour', 'rimColour', 'colourway')) {
      this._applyLight(state);
      this._updateEnvironment();   // the probe has to follow the sun
    }
    this.state = state;
    if (changed('camera', 'world')) this.setCamera(state.camera, !!prev);
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

    if (this.water) this.water.material.userData.u.uTime.value = this.elapsed;
    if (this.abstract && this.state && this.state.motion) {
      this.abstract.rotation.y = this.elapsed * 0.08;
    }

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
