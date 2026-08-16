/* ============================================================
   KD VISUAL CONFIGURATOR — terrain noise
   Value noise with analytic derivatives, so octaves can be damped
   where the surface is already steep. That damping is what turns
   generic fbm blobs into terrain with flat valley floors and
   sharp crests. Domain warping on top keeps shapes organic
   rather than obviously grid-aligned.
   Deterministic: the same seed always rebuilds the same land.
   ============================================================ */

function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const quintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const quinticD = (t) => 30 * t * t * (t * (t - 2) + 1);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/* Returns [value, d/dx, d/dy] in 0..1. */
function noised(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;

  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);

  const u = quintic(fx), v = quintic(fy);
  const du = quinticD(fx), dv = quinticD(fy);

  const k1 = b - a, k2 = c - a, k3 = a - b - c + d;
  return [
    a + k1 * u + k2 * v + k3 * u * v,
    du * (k1 + k3 * v),
    dv * (k2 + k3 * u),
  ];
}

/* Derivative-damped fbm. `damp` at 0 is plain fbm; higher values
   flatten the low ground and leave the ridges standing. */
function fbm(x, y, seed, octaves, damp = 0.85) {
  let sum = 0, norm = 0, amp = 1, freq = 1, dx = 0, dy = 0;
  for (let i = 0; i < octaves; i++) {
    const [n, nx, ny] = noised(x * freq, y * freq, seed + i * 1013);
    dx += nx * freq; dy += ny * freq;
    const k = damp > 0 ? 1 / (1 + (dx * dx + dy * dy) * damp) : 1;
    sum += amp * n * k;
    norm += amp * k;
    amp *= 0.5;
    freq *= 2.02;
  }
  return norm > 1e-6 ? sum / norm : 0;
}

/* Ridged multifractal — each octave is masked by the one above it,
   which is what builds continuous crest lines instead of noise. */
function ridged(x, y, seed, octaves, sharpen = 1) {
  let sum = 0, norm = 0, amp = 1, freq = 1, dx = 0, dy = 0, prev = 1;
  for (let i = 0; i < octaves; i++) {
    const [n, nx, ny] = noised(x * freq, y * freq, seed + i * 1013);
    dx += nx * freq; dy += ny * freq;
    let r = 1 - Math.abs(n * 2 - 1);
    r *= r;
    const k = 1 / (1 + (dx * dx + dy * dy) * 0.45);
    sum += amp * r * k * prev;
    norm += amp;
    prev = 0.55 + 0.45 * r;
    amp *= 0.5;
    freq *= 2.02;
  }
  return Math.pow(norm > 1e-6 ? clamp01(sum / norm) : 0, sharpen);
}

/* Pushes the sample point around with a second noise field. */
function warp(x, y, seed, amount, scale) {
  const wx = fbm(x * scale + 11.3, y * scale + 3.7, seed + 707, 3, 0);
  const wy = fbm(x * scale - 5.1, y * scale + 9.2, seed + 1301, 3, 0);
  return [x + (wx - 0.5) * amount, y + (wy - 0.5) * amount];
}

/* Thin, branching lines — used to incise river valleys. */
function channels(x, y, seed, freq) {
  const [n] = noised(x * freq, y * freq, seed + 4409);
  const a = 1 - Math.abs(n * 2 - 1);
  const [m] = noised(x * freq * 2.1 + 31.7, y * freq * 2.1 - 12.3, seed + 8821);
  const b = 1 - Math.abs(m * 2 - 1);
  return Math.pow(a, 9) * 0.7 + Math.pow(b, 11) * 0.3;
}

/* ============================================================
   Landscape families. Each returns a height in roughly 0..1.
   x and y arrive in world units on a 96-unit field.
   ============================================================ */

export const FIELDS = {
  /* Soft rolling ground. Warped so the crests meander. */
  dunes(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 4.5, 0.07);
    return fbm(wx * 0.115, wy * 0.115, seed, 5, 0.7);
  },

  /* Alpine crests with scree slopes falling away. */
  ridges(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 3, 0.08);
    const r = ridged(wx * 0.105, wy * 0.105, seed, 6, 1.25);
    return r * 0.86 + fbm(x * 0.05, y * 0.05, seed + 51, 3, 0) * 0.14;
  },

  /* High tableland cut by a river network. */
  canyons(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 3.5, 0.06);
    const base = fbm(wx * 0.09, wy * 0.09, seed, 5, 1.15);
    /* Faint horizontal strata — what makes eroded rock read as rock. */
    const strata = 6;
    const q = base * strata;
    const band = (Math.floor(q) + smooth(0.6, 1.0, q - Math.floor(q))) / strata;
    const table = 0.46 + (band * 0.7 + base * 0.3) * 0.54;
    const cut = channels(wx, wy, seed, 0.12) * 1.05;
    return clamp01(table - cut);
  },

  /* Broad flat-topped plateaus with steep shoulders. */
  mesa(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 4, 0.06);
    const base = fbm(wx * 0.075, wy * 0.075, seed, 4, 0.6);
    const steps = 3.2;
    const s = base * steps;
    const level = Math.floor(s);
    const edge = smooth(0.72, 0.98, s - level);
    return (level + edge) / steps * 0.92 + base * 0.08;
  },

  /* Fine contour steps — reads as a topographic model. */
  terraces(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 3, 0.07);
    const base = fbm(wx * 0.1, wy * 0.1, seed, 5, 0.75);
    const steps = 9;
    const s = base * steps;
    const level = Math.floor(s);
    const edge = smooth(0.55, 1.0, s - level);
    return (level + edge) / steps * 0.86 + base * 0.14;
  },

  /* Islands sitting in a flat sea. */
  archipelago(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 4, 0.06);
    const base = fbm(wx * 0.085, wy * 0.085, seed, 6, 0.8);
    const land = Math.max(0, base - 0.44) * 1.85;
    return Math.pow(clamp01(land), 0.85);
  },

  /* Long parallel dune lines, stretched along one axis. */
  drift(x, y, seed) {
    const [wx, wy] = warp(x, y, seed, 6, 0.05);
    const lines = ridged(wx * 0.035, wy * 0.22, seed, 5, 0.9);
    return lines * 0.78 + fbm(x * 0.06, y * 0.06, seed + 77, 3, 0.5) * 0.22;
  },

  /* Smooth interference pattern — the most graphic of the set. */
  swell(x, y, seed) {
    const p = (seed % 100) * 0.061;
    const [wx, wy] = warp(x, y, seed, 2.5, 0.09);
    const a = Math.sin(wx * 0.42 + p) * Math.cos(wy * 0.34 - p * 0.5);
    const b = Math.sin((wx + wy) * 0.23 + p * 1.7);
    const c = fbm(x * 0.08, y * 0.08, seed, 3, 0);
    return clamp01((a * 0.34 + b * 0.27 + 0.61) * 0.74 + c * 0.26);
  },

  /* Hard-edged facets — pair it with the low-poly shading. */
  crystal(x, y, seed) {
    const cell = 2.8;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const plate = hash2(cx, cy, seed + 99);
    const tilt = fbm(x * 0.06, y * 0.06, seed, 3, 0);
    return clamp01(plate * 0.6 + tilt * 0.4);
  },
};

/* Softens the far edge so the mesh reads as a field, not a cut plane. */
export function shoreFalloff(x, y, half) {
  const d = Math.max(Math.abs(x), Math.abs(y)) / half;
  return 1 - smooth(0.74, 1.0, d);
}

/* Scenes that want faceted, un-smoothed normals. */
export const FLAT_SHADED = new Set(['crystal']);

/* ============================================================
   Noise for the abstract worlds
   ============================================================ */

/* Smooth closed loop — 2D noise sampled around a circle, so the first
   and last sample are the same point and the outline never seams. */
export function loopNoise(theta, freq, seed) {
  const x = Math.cos(theta) * freq;
  const y = Math.sin(theta) * freq;
  return fbm(x, y, seed, 4, 0) ;
}

/* Hashes all three axes independently. Folding y and z into one integer
   (as a 2D hash forces you to) makes neighbouring cells correlate and the
   surface picks up axis-aligned blocky banding. */
function hash3(ix, iy, iz, seed) {
  let h = Math.imul(ix | 0, 374761393)
        ^ Math.imul(iy | 0, 668265263)
        ^ Math.imul(iz | 0, 1442695041)
        ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/* Value-noise fbm in three dimensions, for displacing closed forms. */
function noise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = quintic(fx), v = quintic(fy), w = quintic(fz);
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  return (x00 + (x10 - x00) * v) + ((x01 + (x11 - x01) * v) - (x00 + (x10 - x00) * v)) * w;
}

export function fbm3(x, y, z, seed, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x * freq, y * freq, z * freq, seed + i * 977) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
