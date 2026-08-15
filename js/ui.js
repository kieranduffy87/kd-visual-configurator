/* ============================================================
   KD VISUAL CONFIGURATOR — control builder
   Panels are described as data so every control looks and
   behaves the same, and adding one is a single line.
   ============================================================ */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {HTMLElement} host
 * @param {Array} groups  [{ title, hint, controls: [...] }]
 * @param {Function} get  () => state
 * @param {Function} set  (patch) => void
 * @returns {Function} sync — refresh every control from state
 */
export function buildPanel(host, groups, get, set) {
  const syncers = [];

  for (const group of groups) {
    const section = el('section', 'grp');
    const head = el('div', 'grp__head');
    head.append(el('h2', 'grp__title kd-label', group.title));
    if (group.hint) head.append(el('p', 'grp__hint', group.hint));
    section.append(head);

    for (const c of group.controls) {
      section.append(buildControl(c, get, set, syncers));
    }
    host.append(section);
  }

  const sync = () => syncers.forEach((fn) => fn(get()));
  sync();
  return sync;
}

function buildControl(c, get, set, syncers) {
  switch (c.type) {
    case 'chips': return chips(c, get, set, syncers);
    case 'colourchips': return chips(c, get, set, syncers, true);
    case 'swatches': return swatches(c, get, set, syncers);
    case 'range': return range(c, get, set, syncers);
    case 'text': return textField(c, get, set, syncers, false);
    case 'textarea': return textField(c, get, set, syncers, true);
    case 'switches': return switches(c, get, set, syncers);
    case 'seed': return seed(c, get, set, syncers);
    default: return el('div');
  }
}

function chips(c, get, set, syncers, withDot = false) {
  const wrap = el('div', 'ctl');
  if (c.label) wrap.append(el('span', 'ctl__label', c.label));
  const row = el('div', 'chiprow');
  const buttons = c.options.map((o) => {
    const b = el('button', withDot ? 'chip chip--dot' : 'chip');
    b.type = 'button';
    if (withDot) {
      const dot = el('span', 'chip__dot');
      /* `auto` has no colour of its own — show it as a split swatch. */
      dot.style.background = o.hex
        || 'conic-gradient(var(--kd-blue) 0 50%, var(--kd-muted) 50% 100%)';
      b.append(dot);
    }
    b.append(document.createTextNode(o.name));
    b.dataset.id = o.id;
    b.addEventListener('click', () => set({ [c.key]: o.id }));
    row.append(b);
    return b;
  });
  wrap.append(row);
  syncers.push((s) => buttons.forEach((b) => {
    b.classList.toggle('is-active', String(s[c.key]) === String(b.dataset.id));
  }));
  return wrap;
}

function swatches(c, get, set, syncers) {
  const wrap = el('div', 'ctl');
  const row = el('div', 'swatchrow');
  const buttons = c.options.map((o) => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.dataset.id = o.id;
    b.title = `${o.name} — ${o.note}`;
    b.setAttribute('aria-label', `${o.name}. ${o.note}`);
    const chipEl = el('span', 'swatch__chip');
    chipEl.style.background = `linear-gradient(140deg, ${o.bgTop} 0%, ${o.low} 52%, ${o.high} 100%)`;
    const dot = el('span', 'swatch__dot');
    dot.style.background = o.accent;
    chipEl.append(dot);
    b.append(chipEl, el('span', 'swatch__name', o.name));
    b.addEventListener('click', () => set({ [c.key]: o.id }));
    row.append(b);
    return b;
  });
  wrap.append(row);
  const note = el('p', 'ctl__note');
  wrap.append(note);
  syncers.push((s) => {
    buttons.forEach((b) => b.classList.toggle('is-active', s[c.key] === b.dataset.id));
    const active = c.options.find((o) => o.id === s[c.key]);
    note.textContent = active ? active.note : '';
  });
  return wrap;
}

function range(c, get, set, syncers) {
  const wrap = el('div', 'ctl');
  const head = el('div', 'ctl__row');
  head.append(el('span', 'ctl__label', c.label));
  const val = el('span', 'ctl__value');
  head.append(val);
  const input = el('input', 'slider');
  input.type = 'range';
  input.min = c.min; input.max = c.max; input.step = c.step;
  input.setAttribute('aria-label', c.label);
  input.addEventListener('input', () => set({ [c.key]: parseFloat(input.value) }));
  wrap.append(head, input);
  syncers.push((s) => {
    const v = s[c.key];
    if (document.activeElement !== input) input.value = v;
    val.textContent = c.format ? c.format(v) : Math.round(v * 100) + '%';
    input.style.setProperty('--fill', ((v - c.min) / (c.max - c.min)) * 100 + '%');
  });
  return wrap;
}

function textField(c, get, set, syncers, multiline) {
  const wrap = el('label', 'ctl');
  wrap.append(el('span', 'ctl__label', c.label));
  const input = el(multiline ? 'textarea' : 'input', 'field');
  if (multiline) input.rows = c.rows || 3;
  input.placeholder = c.placeholder || '';
  input.addEventListener('input', () => set({ [c.key]: input.value }));
  wrap.append(input);
  syncers.push((s) => {
    if (document.activeElement !== input) input.value = s[c.key] ?? '';
  });
  return wrap;
}

function switches(c, get, set, syncers) {
  const wrap = el('div', 'ctl switchset');
  const items = c.options.map((o) => {
    const label = el('label', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => set({ [o.key]: input.checked }));
    label.append(input, el('span', 'switch__track'), el('span', 'switch__label', o.name));
    wrap.append(label);
    return { input, key: o.key };
  });
  syncers.push((s) => items.forEach((i) => { i.input.checked = !!s[i.key]; }));
  return wrap;
}

function seed(c, get, set, syncers) {
  const wrap = el('div', 'ctl');
  const head = el('div', 'ctl__row');
  head.append(el('span', 'ctl__label', 'Seed'));
  wrap.append(head);
  const row = el('div', 'seedrow');
  const input = el('input', 'field field--num');
  input.type = 'number';
  input.min = 0; input.max = 9999;
  input.setAttribute('aria-label', 'Landscape seed');
  input.addEventListener('input', () => {
    const v = parseInt(input.value, 10);
    if (!Number.isNaN(v)) set({ seed: v });
  });
  const btn = el('button', 'ghostbtn', 'New landscape');
  btn.type = 'button';
  btn.addEventListener('click', () => set({ seed: Math.floor(Math.random() * 9999) }));
  row.append(input, btn);
  wrap.append(row);
  syncers.push((s) => {
    if (document.activeElement !== input) input.value = s.seed;
  });
  return wrap;
}

/* Toast — quiet confirmation for copy/export actions. */
let toastTimer = null;
export function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', 'toast');
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), 2200);
}
