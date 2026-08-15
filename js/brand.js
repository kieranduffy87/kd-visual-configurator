/* ============================================================
   KD VISUAL CONFIGURATOR — brand guardrails
   Everything a user can choose lives here. If it isn't in this
   file it can't be selected, so every export stays on-brand.
   Palette values mirror kd-design-system/css/tokens.css.
   ============================================================ */

export const COLOURWAYS = [
  {
    id: 'electric',
    name: 'Electric',
    note: 'Blue on ink — the default key visual',
    bgTop: '#020e3e', bgBottom: '#06070c',
    low: '#01145a', high: '#0339f8', slope: '#6f8dff',
    accent: '#0339f8', rim: '#3f6bff', typeAccent: '#93aeff',
    fog: '#050a24', line: '#7fa0ff',
    text: 'light', exposure: 1.06,
  },
  {
    id: 'paper',
    name: 'Paper',
    note: 'Warm paper — light decks and docs',
    bgTop: '#ffffff', bgBottom: '#e6e4dc',
    low: '#cfccc2', high: '#f8f7f4', slope: '#b5b1a6',
    accent: '#0339f8', rim: '#0339f8', typeAccent: '#0339f8',
    fog: '#eceae4', line: '#0339f8',
    text: 'dark', exposure: 1.0,
  },
  {
    id: 'signal',
    name: 'Signal',
    note: 'Full blue field — campaign covers',
    bgTop: '#0339f8', bgBottom: '#01145a',
    low: '#0432d6', high: '#e8edff', slope: '#9fb6ff',
    accent: '#f4f4f6', rim: '#ffffff', typeAccent: '#ffffff',
    fog: '#022089', line: '#ffffff',
    text: 'light', exposure: 1.02,
  },
  {
    id: 'ink',
    name: 'Ink',
    note: 'Monochrome with a blue subject',
    bgTop: '#181a20', bgBottom: '#08090b',
    low: '#0a0b0e', high: '#6a707c', slope: '#9aa2b0',
    accent: '#0339f8', rim: '#0339f8', typeAccent: '#6f95ff',
    fog: '#0d0f14', line: '#0339f8',
    text: 'light', exposure: 1.04,
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    note: 'Technical drawing — white lines on deep blue',
    bgTop: '#01145a', bgBottom: '#020e3e',
    low: '#011a6e', high: '#2a56ff', slope: '#6f8dff',
    accent: '#ffffff', rim: '#8fb0ff', typeAccent: '#ffffff',
    fog: '#01123f', line: '#ffffff',
    text: 'light', exposure: 1.02,
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    note: 'Near-black with a single blue crest',
    bgTop: '#0a0a0c', bgBottom: '#000000',
    low: '#04050a', high: '#1f45d6', slope: '#4f74ff',
    accent: '#0339f8', rim: '#3f6bff', typeAccent: '#7f9dff',
    fog: '#05060a', line: '#4f74ff',
    text: 'light', exposure: 1.08,
  },
  {
    id: 'mono',
    name: 'Mono',
    note: 'Neutral greys — blue only in the type',
    bgTop: '#f4f4f6', bgBottom: '#dcdbde',
    low: '#b7b9bf', high: '#ffffff', slope: '#9a9da4',
    accent: '#0339f8', rim: '#c8cad0', typeAccent: '#0339f8',
    fog: '#e4e3e6', line: '#0339f8',
    text: 'dark', exposure: 1.0,
  },
  {
    id: 'arctic',
    name: 'Arctic',
    note: 'Pale blue daylight — light and airy',
    bgTop: '#dfeaff', bgBottom: '#ffffff',
    low: '#9fb8e4', high: '#ffffff', slope: '#7f9dd4',
    accent: '#0339f8', rim: '#0339f8', typeAccent: '#0339f8',
    fog: '#e8f0ff', line: '#0339f8',
    text: 'dark', exposure: 1.0,
  },
  {
    id: 'coral',
    name: 'Coral',
    note: 'Expressive accent — playground only',
    bgTop: '#0a0b0e', bgBottom: '#05060a',
    low: '#01145a', high: '#ff7a59', slope: '#ffd0c2',
    accent: '#ff7a59', rim: '#ff7a59', typeAccent: '#ffb49f',
    fog: '#0a0b12', line: '#ffb49f',
    text: 'light', exposure: 1.05,
  },
  {
    id: 'teal',
    name: 'Teal',
    note: 'Expressive accent — playground only',
    bgTop: '#05060a', bgBottom: '#0a0b0e',
    low: '#01145a', high: '#21d4b4', slope: '#9df0e2',
    accent: '#21d4b4', rim: '#21d4b4', typeAccent: '#8ff0de',
    fog: '#040a12', line: '#8ff0de',
    text: 'light', exposure: 1.05,
  },
];

export const SCENES = [
  { id: 'dunes', name: 'Dunes' },
  { id: 'ridges', name: 'Ridges' },
  { id: 'canyons', name: 'Canyons' },
  { id: 'mesa', name: 'Mesa' },
  { id: 'terraces', name: 'Terraces' },
  { id: 'archipelago', name: 'Archipelago' },
  { id: 'drift', name: 'Drift' },
  { id: 'swell', name: 'Swell' },
  { id: 'crystal', name: 'Crystal' },
];

export const SURFACES = [
  { id: 'solid', name: 'Solid' },
  { id: 'contour', name: 'Contour' },
  { id: 'grid', name: 'Grid' },
  { id: 'points', name: 'Points' },
];

export const OBJECTS = [
  { id: 'none', name: 'None' },
  { id: 'mark', name: 'KD mark' },
  { id: 'sphere', name: 'Sphere' },
  { id: 'torus', name: 'Torus' },
  { id: 'monolith', name: 'Monolith' },
];

export const MATERIALS = [
  { id: 'glass', name: 'Glass' },
  { id: 'brand', name: 'Brand' },
  { id: 'matte', name: 'Matte' },
  { id: 'metal', name: 'Metal' },
];

/* Key and rim light colours. 'auto' lets the colourway decide. */
export const LIGHT_COLOURS = [
  { id: 'auto', name: 'Auto', hex: null },
  { id: 'neutral', name: 'Neutral', hex: '#ffffff' },
  { id: 'ice', name: 'Ice', hex: '#cfe0ff' },
  { id: 'electric', name: 'Electric', hex: '#3f6bff' },
  { id: 'amber', name: 'Amber', hex: '#ffc48a' },
  { id: 'coral', name: 'Coral', hex: '#ff7a59' },
  { id: 'teal', name: 'Teal', hex: '#21d4b4' },
  { id: 'violet', name: 'Violet', hex: '#8a7bff' },
];

export const MOODS = [
  { id: 'studio', name: 'Studio', ambient: 0.6, rim: 1.1, fog: 0.030, soft: 3.2 },
  { id: 'contrast', name: 'Contrast', ambient: 0.24, rim: 1.8, fog: 0.032, soft: 1.4 },
  { id: 'ambient', name: 'Ambient', ambient: 0.9, rim: 0.5, fog: 0.042, soft: 5.0 },
  { id: 'noir', name: 'Noir', ambient: 0.12, rim: 2.6, fog: 0.048, soft: 1.0 },
];

/* az / pol are spherical radians, dist in world units, ty = target height */
export const CAMERAS = [
  { id: 'hero', name: 'Hero', az: 0.62, pol: 1.06, dist: 18, fov: 34, ty: 2.6 },
  { id: 'low', name: 'Low', az: -0.5, pol: 1.34, dist: 13, fov: 40, ty: 2.0 },
  { id: 'aerial', name: 'Aerial', az: 0.9, pol: 0.58, dist: 20, fov: 32, ty: 0.6 },
  { id: 'horizon', name: 'Horizon', az: 2.3, pol: 1.28, dist: 26, fov: 26, ty: 2.6 },
  { id: 'detail', name: 'Detail', az: -1.15, pol: 1.12, dist: 9, fov: 44, ty: 2.4 },
  { id: 'plan', name: 'Plan', az: 0.0, pol: 0.16, dist: 22, fov: 30, ty: 0.0 },
];

export const FORMATS = [
  { id: '16:9', name: 'Landscape', w: 16, h: 9 },
  { id: '3:2', name: 'Web hero', w: 3, h: 2 },
  { id: '1:1', name: 'Square', w: 1, h: 1 },
  { id: '4:5', name: 'Social', w: 4, h: 5 },
  { id: '9:16', name: 'Story', w: 9, h: 16 },
];

export const LAYOUTS = [
  { id: 'stack', name: 'Stack' },
  { id: 'centre', name: 'Centre' },
  { id: 'cover', name: 'Cover' },
  { id: 'split', name: 'Split' },
  { id: 'corner', name: 'Corner' },
  { id: 'none', name: 'Clean' },
];

/* Accumulation passes used for the export. More passes = cleaner edges,
   softer shadow penumbrae and smoother depth of field. */
export const QUALITY = [
  { id: 24, name: 'Draft' },
  { id: 64, name: 'Standard' },
  { id: 160, name: 'Fine' },
];

export const SIZES = [
  { id: 1200, name: '1200' },
  { id: 2000, name: '2000' },
  { id: 3000, name: '3000' },
];

export const DEFAULT_STATE = {
  scene: 'dunes',
  detail: 0.7,
  amplitude: 0.78,
  seed: 5487,
  surface: 'contour',
  object: 'mark',
  material: 'glass',
  colourway: 'electric',
  mood: 'contrast',
  keyColour: 'neutral',
  rimColour: 'auto',
  lightAz: 2.35,
  lightEl: 0.26,
  lightPower: 0.82,
  camera: 'hero',
  focus: 0.2,
  quality: 64,
  motion: true,
  format: '16:9',
  size: 2000,
  layout: 'stack',
  eyebrow: 'Design systems',
  headline: 'One scene.\nEvery format.',
  subhead: 'A configurator so the team can ship on-brand 3D key visuals without booking a 3D artist.',
  logo: true,
  scrim: true,
};

/* Named starting points — the "recipes" a marketer picks from. */
export const RECIPES = [
  {
    id: 'hero',
    name: 'Brand hero',
    state: {
      scene: 'dunes', surface: 'contour', object: 'mark', material: 'glass',
      colourway: 'electric', mood: 'contrast', camera: 'hero', format: '16:9',
      layout: 'stack', amplitude: 0.78, detail: 0.7, seed: 5487,
      lightAz: 2.35, lightEl: 0.26, lightPower: 0.82, scrim: true,
      keyColour: 'neutral', rimColour: 'auto', focus: 0.3,
    },
  },
  {
    id: 'cover',
    name: 'Report cover',
    state: {
      scene: 'mesa', surface: 'grid', object: 'monolith', material: 'brand',
      colourway: 'paper', mood: 'ambient', camera: 'aerial', format: '3:2',
      layout: 'cover', amplitude: 0.42, detail: 0.7, seed: 1177,
      lightAz: 1.6, lightEl: 0.7, lightPower: 0.5, scrim: false,
      keyColour: 'neutral', rimColour: 'auto', focus: 0.18,
    },
  },
  {
    id: 'social',
    name: 'Social square',
    state: {
      scene: 'ridges', surface: 'solid', object: 'sphere', material: 'metal',
      colourway: 'signal', mood: 'contrast', camera: 'detail', format: '1:1',
      layout: 'centre', amplitude: 0.66, detail: 0.6, seed: 9042,
      lightAz: -0.6, lightEl: 0.35, lightPower: 0.75, scrim: true,
      keyColour: 'neutral', rimColour: 'ice', focus: 0.42,
    },
  },
  {
    id: 'story',
    name: 'Story',
    state: {
      scene: 'swell', surface: 'points', object: 'torus', material: 'brand',
      colourway: 'ink', mood: 'noir', camera: 'low', format: '9:16',
      layout: 'corner', amplitude: 0.55, detail: 0.75, seed: 3310,
      lightAz: 2.2, lightEl: 0.28, lightPower: 0.8, scrim: true,
      keyColour: 'ice', rimColour: 'electric', focus: 0.5,
    },
  },
  {
    id: 'divider',
    name: 'Deck divider',
    state: {
      scene: 'terraces', surface: 'contour', object: 'none', material: 'matte',
      colourway: 'ink', mood: 'studio', camera: 'horizon', format: '16:9',
      layout: 'split', amplitude: 0.38, detail: 0.5, seed: 6612,
      lightAz: -1.4, lightEl: 0.3, lightPower: 0.55, scrim: true,
      keyColour: 'neutral', rimColour: 'electric', focus: 0.22,
    },
  },
  {
    id: 'pattern',
    name: 'Pattern plate',
    state: {
      scene: 'swell', surface: 'grid', object: 'none', material: 'matte',
      colourway: 'electric', mood: 'ambient', camera: 'plan', format: '4:5',
      layout: 'none', amplitude: 0.72, detail: 0.85, seed: 2048,
      lightAz: 0.4, lightEl: 0.9, lightPower: 0.5, scrim: false,
      keyColour: 'neutral', rimColour: 'auto', focus: 0.0,
    },
  },
  {
    id: 'ridge',
    name: 'Canyon hero',
    state: {
      scene: 'canyons', surface: 'solid', object: 'none', material: 'matte',
      colourway: 'blueprint', mood: 'contrast', camera: 'hero', format: '16:9',
      layout: 'cover', amplitude: 0.82, detail: 0.8, seed: 7314,
      lightAz: -2.0, lightEl: 0.24, lightPower: 0.85, scrim: false,
      keyColour: 'ice', rimColour: 'neutral', focus: 0.3,
    },
  },
  {
    id: 'isles',
    name: 'Archipelago',
    state: {
      scene: 'archipelago', surface: 'contour', object: 'sphere', material: 'glass',
      colourway: 'arctic', mood: 'ambient', camera: 'aerial', format: '4:5',
      layout: 'centre', amplitude: 0.6, detail: 0.85, seed: 2266,
      lightAz: 1.1, lightEl: 0.6, lightPower: 0.6, scrim: false,
      keyColour: 'neutral', rimColour: 'ice', focus: 0.35,
    },
  },
  {
    id: 'facet',
    name: 'Crystal field',
    state: {
      scene: 'crystal', surface: 'solid', object: 'mark', material: 'metal',
      colourway: 'nocturne', mood: 'noir', camera: 'detail', format: '1:1',
      layout: 'corner', amplitude: 0.7, detail: 0.6, seed: 8140,
      lightAz: 2.6, lightEl: 0.2, lightPower: 0.9, scrim: true,
      keyColour: 'electric', rimColour: 'violet', focus: 0.55,
    },
  },
];

export const byId = (list, id) => list.find((x) => x.id === id) || list[0];

/* ---------- share links ---------- */

export function encodeState(state) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/=+$/, '');
  } catch (e) {
    return '';
  }
}

export function decodeState(hash) {
  try {
    const raw = decodeURIComponent(escape(atob(hash)));
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...DEFAULT_STATE, ...parsed };
  } catch (e) {
    return null;
  }
}

/* ---------- shuffle, inside the guardrails ---------- */

const pick = (list) => list[Math.floor(Math.random() * list.length)].id;
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);

export function shuffle(state) {
  const object = pick(OBJECTS);
  return {
    ...state,
    scene: pick(SCENES),
    surface: pick(SURFACES),
    object,
    material: object === 'none' ? state.material : pick(MATERIALS),
    colourway: pick(COLOURWAYS),
    mood: pick(MOODS),
    keyColour: pick(LIGHT_COLOURS),
    rimColour: pick(LIGHT_COLOURS),
    camera: pick(CAMERAS),
    seed: Math.floor(Math.random() * 9999),
    amplitude: jitter(0.3, 0.8),
    detail: jitter(0.4, 0.85),
    lightAz: jitter(-Math.PI, Math.PI),
    lightEl: jitter(0.2, 0.95),
    lightPower: jitter(0.45, 0.85),
    focus: Math.random() < 0.35 ? 0 : jitter(0.15, 0.55),
  };
}
