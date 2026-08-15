/* ============================================================
   KD VISUAL CONFIGURATOR — app
   ============================================================ */

import { Stage } from './scene.js';
import { drawOverlay, loadMark } from './overlay.js';
import { buildPanel, toast } from './ui.js';
import {
  COLOURWAYS, SCENES, SURFACES, OBJECTS, MATERIALS, MOODS, CAMERAS,
  FORMATS, LAYOUTS, SIZES, RECIPES, DEFAULT_STATE, LIGHT_COLOURS, QUALITY,
  byId, encodeState, decodeState, shuffle,
} from './brand.js';

/* ---------- state ---------- */

let state = { ...DEFAULT_STATE, ...(decodeState(location.hash.slice(1)) || {}) };
let prevState = null;
let guides = false;

const listeners = [];
const onState = (fn) => listeners.push(fn);

function set(patch) {
  prevState = state;
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state, prevState));
}

/* ---------- elements ---------- */

const gl = document.getElementById('gl');
const overlayCanvas = document.getElementById('overlay');
const frame = document.getElementById('frame');
const octx = overlayCanvas.getContext('2d');

const stage = new Stage(gl);
stage.update(state, null);
stage.setCamera(state.camera, false);

/* ---------- panels ---------- */

const pct = (v) => Math.round(v * 100) + '%';
const deg = (v) => Math.round((v * 180) / Math.PI) + '°';

const leftGroups = [
  {
    title: 'Landscape',
    hint: 'The base terrain. Seed keeps a look reproducible.',
    controls: [
      { type: 'chips', key: 'scene', options: SCENES },
      { type: 'range', key: 'amplitude', label: 'Relief', min: 0, max: 1, step: 0.01, format: pct },
      { type: 'range', key: 'detail', label: 'Detail', min: 0, max: 1, step: 0.01, format: pct },
      { type: 'seed' },
    ],
  },
  {
    title: 'Surface',
    hint: 'How the field is drawn.',
    controls: [{ type: 'chips', key: 'surface', options: SURFACES }],
  },
  {
    title: 'Subject',
    hint: 'The hero form sitting in the scene.',
    controls: [
      { type: 'chips', key: 'object', options: OBJECTS },
      { type: 'chips', key: 'material', label: 'Material', options: MATERIALS },
    ],
  },
];

const rightGroups = [
  {
    title: 'Colourway',
    hint: 'Locked to the KD palette — every option is on-brand.',
    controls: [{ type: 'swatches', key: 'colourway', options: COLOURWAYS }],
  },
  {
    title: 'Light',
    hint: 'Auto follows the colourway.',
    controls: [
      { type: 'chips', key: 'mood', options: MOODS },
      { type: 'colourchips', key: 'keyColour', label: 'Key colour', options: LIGHT_COLOURS },
      { type: 'colourchips', key: 'rimColour', label: 'Rim colour', options: LIGHT_COLOURS },
      { type: 'range', key: 'lightAz', label: 'Direction', min: -3.14159, max: 3.14159, step: 0.01, format: deg },
      { type: 'range', key: 'lightEl', label: 'Height', min: 0, max: 1, step: 0.01, format: pct },
      { type: 'range', key: 'lightPower', label: 'Power', min: 0, max: 1, step: 0.01, format: pct },
    ],
  },
  {
    title: 'Camera',
    hint: 'Drag the canvas to nudge. Scroll to dolly.',
    controls: [
      { type: 'chips', key: 'camera', options: CAMERAS },
      { type: 'range', key: 'focus', label: 'Depth of field', min: 0, max: 1, step: 0.01, format: pct },
      { type: 'switches', options: [{ key: 'motion', name: 'Subject motion' }] },
    ],
  },
  {
    title: 'Type layer',
    hint: 'Drawn at export resolution — the preview is the artwork.',
    controls: [
      { type: 'chips', key: 'layout', options: LAYOUTS },
      { type: 'text', key: 'eyebrow', label: 'Eyebrow', placeholder: 'Kicker' },
      { type: 'textarea', key: 'headline', label: 'Headline', rows: 2, placeholder: 'Headline' },
      { type: 'textarea', key: 'subhead', label: 'Subhead', rows: 3, placeholder: 'Supporting line' },
      { type: 'switches', options: [{ key: 'logo', name: 'KD mark' }, { key: 'scrim', name: 'Legibility scrim' }] },
    ],
  },
];

const syncLeft = buildPanel(document.getElementById('rail-left'), leftGroups, () => state, set);
const syncRight = buildPanel(document.getElementById('rail-right'), rightGroups, () => state, set);

const syncFormat = buildPanel(document.getElementById('format-row'), [{
  title: 'Format',
  controls: [{ type: 'chips', key: 'format', options: FORMATS }],
}], () => state, set);

const syncSize = buildPanel(document.getElementById('size-row'), [{
  title: 'Export width',
  controls: [{ type: 'chips', key: 'size', options: SIZES }],
}], () => state, set);

const syncQuality = buildPanel(document.getElementById('quality-row'), [{
  title: 'Quality',
  controls: [{ type: 'chips', key: 'quality', options: QUALITY }],
}], () => state, set);

/* ---------- recipes ---------- */

const recipeRow = document.getElementById('recipes');
RECIPES.forEach((r) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip chip--recipe';
  b.textContent = r.name;
  b.addEventListener('click', () => set({ ...r.state }));
  recipeRow.append(b);
});

/* ---------- layout / sizing ---------- */

const canvasBox = document.querySelector('.stage__canvas');

/* The frame is sized in JS: aspect-ratio alone can't fit a box to
   both axes of its container without distorting one of them. */
function applyFormat() {
  const cs = getComputedStyle(canvasBox);
  const availW = canvasBox.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = canvasBox.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (availW <= 0 || availH <= 0) return;

  const f = byId(FORMATS, state.format);
  const ratio = f.w / f.h;
  let w = availW;
  let h = w / ratio;
  if (h > availH) { h = availH; w = h * ratio; }

  frame.style.width = Math.floor(w) + 'px';
  frame.style.height = Math.floor(h) + 'px';
  resize();
}

function resize() {
  const w = Math.round(frame.clientWidth);
  const h = Math.round(frame.clientHeight);
  if (w < 2 || h < 2) return;   // frame hidden or not laid out yet
  stage.resize(w, h);
  invalidate();
  const dpr = Math.min(devicePixelRatio, 2);
  overlayCanvas.width = Math.round(w * dpr);
  overlayCanvas.height = Math.round(h * dpr);
  overlayCanvas.style.width = w + 'px';
  overlayCanvas.style.height = h + 'px';
  paintOverlay();
}

new ResizeObserver(() => applyFormat()).observe(canvasBox);

function paintOverlay() {
  octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  drawOverlay(octx, overlayCanvas.width, overlayCanvas.height, state, guides);
}

/* ---------- reactions ---------- */

onState((s, prev) => {
  stage.update(s, prev);
  if (s.format !== prev.format) applyFormat();
  syncLeft(); syncRight(); syncFormat(); syncSize(); syncQuality();
  if (s.camera !== prev.camera) {
    const note = document.getElementById('cam-note');
    note.textContent = '';
    note.classList.remove('is-on');
  }
  paintOverlay();
  writeHash();
  updateSummary();
  invalidate();
});

stage.onOrbit = () => {
  invalidate();
  const marker = document.getElementById('cam-note');
  marker.textContent = 'Custom angle';
  marker.classList.add('is-on');
};

/* ---------- summary strip ---------- */

function updateSummary() {
  const f = byId(FORMATS, state.format);
  const px = exportSize();
  document.getElementById('summary').textContent =
    `${byId(COLOURWAYS, state.colourway).name} · ${byId(SCENES, state.scene).name} · ${f.name} ${f.w}:${f.h} · ${px.w}×${px.h}px`;
}

function exportSize() {
  const f = byId(FORMATS, state.format);
  const long = state.size;
  if (f.w >= f.h) {
    return { w: long, h: Math.round((long * f.h) / f.w) };
  }
  return { w: Math.round((long * f.w) / f.h), h: long };
}

/* ---------- render loop ----------

   Real time while you're working, then — once the scene has been still for
   a moment — it keeps accumulating jittered samples into the same frame.
   The preview converges on exactly what the export will produce, depth of
   field and soft shadows included. Any input drops straight back to real
   time. */

const PREVIEW_SAMPLES = 20;
const IDLE_BEFORE_REFINE = 0.7;

let idle = 0;
let refining = false;
let settled = false;
let exporting = false;

const refineBar = document.getElementById('refine-bar');

/* Lens radius in world units. Roughly a 35mm-lens look at full tilt. */
const focusRadius = () => state.focus * 0.6;
const shadowSoftness = () => byId(MOODS, state.mood).soft;

function showRefine(fraction) {
  refineBar.style.transform = `scaleX(${fraction})`;
  refineBar.classList.toggle('is-on', fraction > 0 && fraction < 1);
}

/** Drops out of accumulation and back to real-time rendering. */
function invalidate() {
  idle = 0;
  if (refining || settled) {
    stage.cancelAccumulation();
    refining = false;
    settled = false;
  }
  showRefine(0);
}

/* Pointer-down alone (no drag yet) should also wake the preview. */
gl.addEventListener('pointerdown', invalidate);
gl.addEventListener('wheel', invalidate, { passive: true });

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  requestAnimationFrame(loop);

  if (exporting || settled) return;

  if (refining) {
    const n = stage.accumulateSample();
    showRefine(n / PREVIEW_SAMPLES);
    if (n >= PREVIEW_SAMPLES) {
      stage.blitAccumulation();
      stage.endAccumulation();
      refining = false;
      settled = true;
      showRefine(0);
    }
    return;
  }

  stage.render(dt);
  idle += dt;
  if (idle > IDLE_BEFORE_REFINE && !stage.tween) {
    stage.beginAccumulation({ focus: focusRadius(), soft: shadowSoftness() });
    refining = true;
  }
}

/* ---------- export ---------- */

const hud = document.getElementById('render-hud');
const hudPct = document.getElementById('render-hud-pct');
const hudBar = document.getElementById('render-hud-bar');
const exportButtons = ['btn-export', 'btn-copy-image'].map((id) => document.getElementById(id));

function setBusy(on) {
  exporting = on;
  hud.hidden = !on;
  exportButtons.forEach((b) => { b.disabled = on; });
  if (!on) invalidate();
}

async function compose() {
  const { w, h } = exportSize();
  const shot = await stage.renderAccumulated(w, h, state.quality, {
    focus: focusRadius(),
    soft: shadowSoftness(),
  }, (fraction) => {
    hudPct.textContent = Math.round(fraction * 100) + '%';
    hudBar.style.transform = `scaleX(${fraction})`;
  });

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(shot, 0, 0);
  drawOverlay(ctx, w, h, state, false);
  return out;
}

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

function fileName() {
  const bits = [
    'kd',
    state.colourway,
    state.scene,
    state.format.replace(':', 'x'),
    state.seed,
  ];
  return bits.join('-') + '.png';
}

document.getElementById('btn-export').addEventListener('click', async () => {
  if (exporting) return;
  setBusy(true);
  try {
    const blob = await toBlob(await compose());
    if (!blob) { toast('Export failed'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Saved ${fileName()}`);
  } finally {
    setBusy(false);
  }
});

document.getElementById('btn-copy-image').addEventListener('click', async () => {
  if (exporting) return;
  setBusy(true);
  try {
    const blob = await toBlob(await compose());
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Image copied to clipboard');
  } catch (err) {
    toast('Clipboard blocked — use Export PNG');
  } finally {
    setBusy(false);
  }
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Link copied — reopens this exact visual');
  } catch (err) {
    toast('Copy the address bar to share this visual');
  }
});

document.getElementById('btn-shuffle').addEventListener('click', () => set(shuffle(state)));

document.getElementById('btn-reset').addEventListener('click', () => set({ ...DEFAULT_STATE }));

const guideBtn = document.getElementById('btn-guides');
guideBtn.addEventListener('click', () => {
  guides = !guides;
  guideBtn.classList.toggle('is-active', guides);
  guideBtn.setAttribute('aria-pressed', String(guides));
  paintOverlay();
});

/* ---------- share link ---------- */

let hashTimer = null;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, '', '#' + encodeState(state));
  }, 250);
}

/* ---------- theme ---------- */

const themeBtn = document.getElementById('btn-theme');
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('kd-theme', t);
  themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light interface' : 'Switch to dark interface');
  document.getElementById('bar-mark').src =
    t === 'dark' ? 'assets/kd-icon-light.svg' : 'assets/kd-icon-dark.svg';
}
applyTheme(localStorage.getItem('kd-theme') || 'dark');
themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

/* ---------- keyboard ---------- */

addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (typing) return;
  if (e.key === 'r' || e.key === 'R') set(shuffle(state));
  if (e.key === 'g' || e.key === 'G') guideBtn.click();
  if (e.key === 'e' || e.key === 'E') document.getElementById('btn-export').click();
  if (e.key === 'n' || e.key === 'N') set({ seed: Math.floor(Math.random() * 9999) });
});

/* ---------- go ---------- */

(async () => {
  try { await document.fonts.ready; } catch (e) { /* fonts optional */ }
  await loadMark();
  applyFormat();
  updateSummary();
  paintOverlay();
  writeHash();
  document.body.classList.add('is-ready');
  requestAnimationFrame(loop);
})();
