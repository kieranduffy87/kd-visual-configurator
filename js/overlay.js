/* ============================================================
   KD VISUAL CONFIGURATOR — type layer
   Drawn with canvas 2D so the preview and the export run the
   exact same code. What you see is what downloads.
   ============================================================ */

import { byId, COLOURWAYS } from './brand.js';

let markImage = null;
let markReady = false;

export function loadMark(src = 'assets/kd-mark.svg') {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { markImage = img; markReady = true; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const supportsTracking = (() => {
  const c = document.createElement('canvas').getContext('2d');
  return 'letterSpacing' in c;
})();

function setFont(ctx, weight, size, tracking) {
  ctx.font = `${weight} ${size}px "Instrument Sans", "Helvetica Neue", Arial, sans-serif`;
  if (supportsTracking) ctx.letterSpacing = tracking ? `${tracking}em` : '0em';
}

/* Manual tracking fallback for browsers without ctx.letterSpacing. */
function drawTracked(ctx, text, x, y, size, tracking, align = 'left') {
  if (supportsTracking || !tracking) {
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }
  const gap = size * tracking;
  const chars = [...text];
  const total = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + gap, 0) - gap;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + gap;
  }
}

function wrap(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

function palette(cw) {
  /* typeAccent is the readable sibling of the brand accent — the raw
     blue on a dark blue scrim fails contrast at eyebrow size. */
  const accent = cw.typeAccent || cw.accent;
  return cw.text === 'dark'
    ? { text: '#0e0f12', muted: 'rgba(14,15,18,0.62)', accent, mark: '#0e0f12' }
    : { text: '#f4f4f6', muted: 'rgba(244,244,246,0.66)', accent, mark: '#f4f4f6' };
}

function drawScrim(ctx, w, h, layout, dark) {
  const a = dark ? [0.72, 0.0] : [0.62, 0.0];
  let g;
  if (layout === 'centre') {
    g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.05, w / 2, h / 2, Math.max(w, h) * 0.8);
    g.addColorStop(0, tint(dark, a[0] * 0.5));
    g.addColorStop(0.55, tint(dark, a[0] * 0.28));
    g.addColorStop(1, tint(dark, 0));
  } else if (layout === 'split') {
    g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, tint(dark, a[0]));
    g.addColorStop(0.7, tint(dark, 0));
  } else {
    g = ctx.createLinearGradient(0, h, 0, h * 0.28);
    g.addColorStop(0, tint(dark, a[0]));
    g.addColorStop(1, tint(dark, 0));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const tint = (dark, alpha) => dark
  ? `rgba(10,11,14,${alpha})`
  : `rgba(246,245,241,${alpha})`;

function drawMark(ctx, x, y, height, colour, align = 'left') {
  if (!markReady) return { w: 0, h: 0 };
  const ratio = markImage.naturalWidth / markImage.naturalHeight || 18.62 / 11.73;
  const w = height * ratio;
  const dx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;

  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.ceil(w));
  off.height = Math.max(1, Math.ceil(height));
  const octx = off.getContext('2d');
  octx.drawImage(markImage, 0, 0, off.width, off.height);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = colour;
  octx.fillRect(0, 0, off.width, off.height);

  ctx.drawImage(off, dx, y, w, height);
  return { w, h: height };
}

/**
 * Draws the whole type layer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  pixel width of the target
 * @param {number} h  pixel height of the target
 * @param {object} state
 * @param {boolean} guides  draw safe-area guides (preview only, never exported)
 */
export function drawOverlay(ctx, w, h, state, guides = false) {
  /* Deliberately does NOT clear — the export composites this straight on top
     of the rendered 3D. The preview's own canvas is cleared by its caller. */
  if (state.layout === 'none' && !guides && !state.logo) return;

  const cw = byId(COLOURWAYS, state.colourway);
  const pal = palette(cw);
  const dark = cw.text !== 'dark';
  const k = Math.sqrt(w * h) / 1200;
  const pad = Math.max(w, h) * 0.055;

  if (state.scrim && state.layout !== 'none') drawScrim(ctx, w, h, state.layout, dark);

  ctx.textBaseline = 'alphabetic';
  const eyebrowSize = 16 * k;
  const subSize = 26 * k;
  const markH = 26 * k;

  const line = (x, y, len, thickness = 2 * k, colour = pal.accent) => {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, len, Math.max(1, thickness));
  };

  const eyebrow = (x, y, align = 'left') => {
    if (!state.eyebrow) return 0;
    setFont(ctx, 600, eyebrowSize, 0.14);
    ctx.fillStyle = pal.accent;
    drawTracked(ctx, state.eyebrow.toUpperCase(), x, y, eyebrowSize, 0.14, align);
    return eyebrowSize;
  };

  const headlineBlock = (x, y, maxW, size, align = 'left') => {
    setFont(ctx, 500, size, -0.02);
    const lines = wrap(ctx, state.headline, maxW);
    const lh = size * 1.02;
    ctx.fillStyle = pal.text;
    ctx.textAlign = align;
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
    return { height: (lines.length - 1) * lh, lines: lines.length, lh };
  };

  const subBlock = (x, y, maxW, align = 'left') => {
    if (!state.subhead) return 0;
    setFont(ctx, 400, subSize, 0);
    const lines = wrap(ctx, state.subhead, maxW);
    const lh = subSize * 1.45;
    ctx.fillStyle = pal.muted;
    ctx.textAlign = align;
    lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lh));
    return (lines.length - 1) * lh;
  };

  const measureHeadline = (maxW, size) => {
    setFont(ctx, 500, size, -0.02);
    const lines = wrap(ctx, state.headline, maxW);
    return { lines, lh: size * 1.02, height: (lines.length - 1) * size * 1.02 };
  };

  const measureSub = (maxW) => {
    if (!state.subhead) return { lines: [], lh: 0, height: 0 };
    setFont(ctx, 400, subSize, 0);
    const lines = wrap(ctx, state.subhead, maxW);
    return { lines, lh: subSize * 1.45, height: (lines.length - 1) * subSize * 1.45 };
  };

  switch (state.layout) {
    case 'stack': {
      const maxW = Math.min(w - pad * 2, w * 0.74);
      const size = 92 * k;
      const hl = measureHeadline(maxW, size);
      const sub = measureSub(Math.min(maxW * 0.66, 640 * k));
      const gap1 = 26 * k, gap2 = 30 * k;
      const totalH = eyebrowSize + gap1 + hl.height + size * 0.78 + (state.subhead ? gap2 + sub.height + subSize : 0);
      let y = h - pad - totalH + eyebrowSize;
      eyebrow(pad, y);
      y += gap1 + size * 0.78;
      headlineBlock(pad, y, maxW, size);
      y += hl.height;
      if (state.subhead) {
        y += gap2 + subSize * 0.8;
        subBlock(pad, y, Math.min(maxW * 0.66, 640 * k));
      }
      if (state.logo) drawMark(ctx, w - pad, h - pad - markH, markH, pal.mark, 'right');
      break;
    }

    case 'centre': {
      const maxW = Math.min(w - pad * 2, w * 0.78);
      const size = 84 * k;
      const hl = measureHeadline(maxW, size);
      const sub = measureSub(Math.min(maxW * 0.72, 620 * k));
      const gap1 = 24 * k, gap2 = 30 * k, ruleGap = 26 * k;
      const total = 3 * k + ruleGap + eyebrowSize + gap1 + hl.height + size * 0.78
        + (state.subhead ? gap2 + sub.height + subSize : 0);
      let y = (h - total) / 2;
      line(w / 2 - 28 * k, y, 56 * k, 3 * k);
      y += 3 * k + ruleGap + eyebrowSize;
      eyebrow(w / 2, y, 'center');
      y += gap1 + size * 0.78;
      headlineBlock(w / 2, y, maxW, size, 'center');
      y += hl.height;
      if (state.subhead) {
        y += gap2 + subSize * 0.8;
        subBlock(w / 2, y, Math.min(maxW * 0.72, 620 * k), 'center');
      }
      if (state.logo) drawMark(ctx, w / 2, h - pad - markH, markH, pal.mark, 'center');
      break;
    }

    case 'cover': {
      const contentW = w - pad * 2;
      eyebrow(pad, pad + eyebrowSize);
      if (state.logo) drawMark(ctx, w - pad, pad, markH, pal.mark, 'right');

      const size = 78 * k;
      const hl = measureHeadline(Math.min(contentW, w * 0.8), size);
      const sub = measureSub(Math.min(contentW * 0.52, 620 * k));
      const ruleGap = 34 * k;
      const totalBottom = hl.height + size * 0.78 + ruleGap + 1
        + (state.subhead ? ruleGap * 0.7 + sub.height + subSize : 0);
      let y = h - pad - totalBottom + size * 0.78;
      headlineBlock(pad, y, Math.min(contentW, w * 0.8), size);
      y += hl.height + ruleGap;
      line(pad, y, contentW, 1.5 * k, pal.accent);
      if (state.subhead) {
        y += ruleGap * 0.7 + subSize * 0.8;
        subBlock(pad, y, Math.min(contentW * 0.52, 620 * k));
      }
      break;
    }

    case 'split': {
      const leftW = Math.min(w * 0.5 - pad, 720 * k);
      const size = 76 * k;
      const hl = measureHeadline(leftW, size);
      const total = eyebrowSize + 24 * k + hl.height + size * 0.78;
      let y = (h - total) / 2 + eyebrowSize;
      eyebrow(pad, y);
      y += 24 * k + size * 0.78;
      headlineBlock(pad, y, leftW, size);
      if (state.subhead) {
        const subW = Math.min(w * 0.3, 460 * k);
        const sub = measureSub(subW);
        subBlock(w - pad, h - pad - sub.height, subW, 'right');
      }
      if (state.logo) drawMark(ctx, pad, pad, markH, pal.mark, 'left');
      break;
    }

    case 'corner': {
      const maxW = Math.min(w - pad * 2, w * 0.8);
      const size = 54 * k;
      const hl = measureHeadline(maxW, size);
      let y = pad + eyebrowSize;
      eyebrow(pad, y);
      y += 22 * k + size * 0.78;
      headlineBlock(pad, y, maxW, size);
      if (state.subhead) {
        const subW = Math.min(maxW * 0.62, 560 * k);
        const sub = measureSub(subW);
        subBlock(pad, h - pad - sub.height, subW);
      }
      if (state.logo) drawMark(ctx, w - pad, h - pad - markH, markH, pal.mark, 'right');
      break;
    }

    default: {
      if (state.logo) drawMark(ctx, w - pad, h - pad - markH, markH, pal.mark, 'right');
      break;
    }
  }

  if (supportsTracking) ctx.letterSpacing = '0em';

  if (guides) {
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(244,244,246,0.28)' : 'rgba(14,15,18,0.28)';
    ctx.lineWidth = Math.max(1, k);
    ctx.setLineDash([6 * k, 6 * k]);
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.5;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 3) * i, 0); ctx.lineTo((w / 3) * i, h);
      ctx.moveTo(0, (h / 3) * i); ctx.lineTo(w, (h / 3) * i);
      ctx.stroke();
    }
    ctx.restore();
  }
}
