import { TEXT, CATS } from './i18n.js';
import { sfx } from './audio.js';
import { drawTask } from './tasks.js';
import { ha, cleanUrl } from './ha.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = $('#root');
const scroller = $('#scroll');
const app = $('#app');
const sheetEl = $('#sheet');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Settings ---------- */

const KEY = 'peng.settings.v1';
const ACCENTS = ['#FFD60A', '#FF5A36', '#C6FF3D', '#5CE1FF'];
const deviceLang = () => ((navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en');
const DEFAULTS = () => ({
  lang: deviceLang(), // de | en | both
  ui: deviceLang(), // UI language
  cats: { syllable: true, famous: true, question: true, compound: true, scramble: true, chain: true },
  pick: 'dice', // dice | choose
  ignite: 'auto', // auto | manual
  tmin: 10,
  tmax: 60,
  diff: 'mid',
  rounds: 10,
  sound: true,
  vib: true,
  safe: false,
  players: 4,
  names: [],
  accent: ACCENTS[0],
  theme: 'dark', // dark | light
  orient: 'auto', // auto | port | land
  ha: { mode: 'off', preset: 'pulse', lights: [] }, // light effects: off | boom | tick
});

function load() {
  const d = DEFAULTS();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      Object.assign(d, raw);
      d.cats = Object.assign(DEFAULTS().cats, raw.cats || {});
      if (!Array.isArray(d.names)) d.names = [];
      d.ha = Object.assign(DEFAULTS().ha, raw.ha || {});
      if (!Array.isArray(d.ha.lights)) d.ha.lights = [];
    }
  } catch (e) { /* fall back to defaults */ }
  if (!CATS.some((c) => d.cats[c])) d.cats.syllable = true;
  return d;
}
let wiping = false; // set while all local data is being deleted: nothing may be written back
function save() {
  if (wiping) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
}

let S = load();
let t = TEXT[S.ui];
const testFuse = Number(new URLSearchParams(location.search).get('t')) || null; // testing only: fixed fuse time in seconds

function applySettings() {
  t = TEXT[S.ui] || TEXT.de;
  document.documentElement.lang = S.ui;
  document.title = t.pageTitle;
  document.body.dataset.look = S.theme;
  document.documentElement.style.background = S.theme === 'light' ? '#FFFFFF' : '#0C0C0E';
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = S.theme === 'light' ? '#FFFFFF' : '#0C0C0E';
  document.body.style.setProperty('--accent', S.accent);
  sfx.setSound(S.sound);
  sfx.setVibration(S.vib);
}

const activeCats = () => CATS.filter((c) => S.cats[c]);
const playerName = (i) => (S.names[i] && S.names[i].trim()) || t.player(i + 1);
const namedCount = () => S.names.slice(0, S.players).filter((n) => n && n.trim()).length;
const otherLang = () => (S.ui === 'de' ? 'en' : 'de');
const lightsOn = () => ha.linked && S.ha.mode !== 'off' && S.ha.lights.length > 0;

/* ---------- Orientation and sizing ---------- */

// The page works with its own dimensions (--W, --H) so that landscape also works
// with rotation lock on: the content is then rotated by 90 degrees.
let isLand = false;
function layout() {
  const pw = window.innerWidth;
  const ph = window.innerHeight;
  const physLand = pw > ph;
  isLand = S.orient === 'auto' ? physLand : S.orient === 'land';
  const rot = isLand !== physLand;
  const W = rot ? ph : pw;
  const H = rot ? pw : ph;
  const b = document.body;
  b.classList.toggle('land', isLand);
  b.classList.toggle('rot', rot);
  b.classList.toggle('short', !isLand && H < 700);
  b.classList.toggle('tiny', !isLand && H < 600);
  root.style.setProperty('--W', `${W}px`);
  root.style.setProperty('--H', `${H}px`);
  root.style.setProperty('--S', String(Math.max(W, H)));
  fitAll();
}

// Type as large as possible: fits the block into its parent's box
function fitBox(main) {
  const area = main.parentElement;
  const maxW = area.clientWidth;
  const maxH = area.clientHeight;
  if (!maxW || !maxH) return;
  // Scramble: pick the column count that makes the tiles largest
  const tiles = main.querySelector('.tiles');
  if (tiles) {
    const n = tiles.children.length;
    let best = n;
    let bestSize = 0;
    for (let cols = 2; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const size = Math.min(maxW / (cols * 1.43), maxH / (rows * 1.43));
      if (size > bestSize + 0.5) { bestSize = size; best = cols; }
    }
    tiles.style.setProperty('--cols', best);
  }
  let lo = 12;
  let hi = Math.max(lo, Math.min(Number(main.dataset.fit) || 400, maxH));
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    main.style.fontSize = `${mid}px`;
    if (main.scrollWidth <= maxW + 1 && main.offsetHeight <= maxH + 1) lo = mid;
    else hi = mid;
  }
  main.style.fontSize = `${Math.floor(lo)}px`;
}
function fitAll() {
  $$('[data-fit]', app).forEach(fitBox);
}

/* ---------- Icons ---------- */

const svg = (d) => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  sliders: svg('<path d="M3 6h8M15 6h2M3 14h2M9 14h8"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="14" r="2"/>'),
  back: svg('<path d="M12 4l-6 6 6 6"/>'),
  close: svg('<path d="M5 5l10 10M15 5L5 15"/>'),
  info: svg('<circle cx="10" cy="10" r="7.5"/><path d="M10 9v5"/><circle cx="10" cy="6.2" r="0.6" fill="currentColor"/>'),
  help: svg('<circle cx="10" cy="10" r="7.5"/><path d="M7.8 7.8a2.3 2.3 0 114 1.6c-.9.8-1.8 1.2-1.8 2.4"/><circle cx="10" cy="14.3" r="0.6" fill="currentColor"/>'),
  lock: svg('<rect x="4.5" y="9" width="11" height="7.5" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>'),
  expand: svg('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'),
  compress: svg('<path d="M7 3v4H3M17 7h-4V3M13 17v-4h4M3 13h4v4"/>'),
  refresh: svg('<path d="M16 10a6 6 0 11-1.8-4.3"/><path d="M16.2 2.8v3.4h-3.4"/>'),
};

/* ---------- Fullscreen ---------- */

// Not every browser offers this (iPhone Safari does not); the button is hidden there.
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fsAvailable = () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsButton = () => (fsAvailable()
  ? `<button class="icon" data-a="fullscreen" aria-pressed="${Boolean(fsElement())}" aria-label="${fsElement() ? t.fullscreenOff : t.fullscreenOn}">${fsElement() ? ICON.compress : ICON.expand}</button>`
  : '');
function toggleFullscreen() {
  try {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      const done = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      if (done && done.catch) done.catch(() => {});
    }
  } catch (e) { /* ignore */ }
}
// Update the buttons in place so a running animation or roll is not interrupted
function syncFullscreen() {
  const on = Boolean(fsElement());
  $$('[data-a="fullscreen"]').forEach((b) => {
    b.innerHTML = on ? ICON.compress : ICON.expand;
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? t.fullscreenOff : t.fullscreenOn);
  });
}
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('webkitfullscreenchange', syncFullscreen);

/* ---------- Game state ---------- */

let screen = 'start';
let G = null; // current game
let B = null; // ticking bomb
let rolling = false;
let lastElapsed = 0;

/* ---------- Building blocks ---------- */

const sw = (key, on, label) => `<button class="sw" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-a="toggle" data-k="${key}" data-s="none"><span></span></button>`;

const seg = (key, options, value) => `<div class="seg" style="--n:${options.length}">${options
  .map(([v, label]) => `<button aria-pressed="${v === value}" data-a="set" data-k="${key}" data-v="${v}">${esc(label)}</button>`)
  .join('')}</div>`;

const letters = (word) => [...word].map((ch, i) => `<span style="--i:${i}">${esc(ch)}</span>`).join('');

const blank = '<i class="blank"></i>';
function pattern(text, pos) {
  const x = `<span>${esc(text)}</span>`;
  if (pos === 'start') return x + blank + blank;
  if (pos === 'end') return blank + blank + x;
  if (pos === 'mid') return blank + blank + x + blank + blank;
  return x;
}

const SAMPLE = {
  de: { syllable: 'SCH__', famous: 'P · C', question: 'Was …?', compound: 'KOPF', scramble: 'T R S A E N', chain: 'Haus › Tür › Schloss' },
  en: { syllable: 'SH__', famous: 'P · C', question: 'What …?', compound: 'HEAD', scramble: 'T R S A E N', chain: 'house › door › key' },
};

function gameHeader() {
  const starter = G.scoring ? `<span class="starter"><span class="muted">${t.startsWith}</span> <strong>${esc(playerName(G.starter))}</strong></span>` : '';
  return `<header class="top">
    <span class="col"><span class="mono muted">${t.round(G.round, G.total)}</span>${starter}</span>
    <span class="row">${fsButton()}<button class="icon" data-a="quit" aria-label="${t.quit}">${ICON.close}</button></span>
  </header>`;
}

/* ---------- Rendering tasks ---------- */

function words(task) {
  // Order: UI language first, both in bilingual mode
  if (S.lang === 'both') return [task[S.ui], task[otherLang()]];
  return [task[S.lang]];
}

// The task itself, fitted to fill the task screen and the bomb screen
function taskMain(task) {
  switch (task.cat) {
    case 'syllable':
      return `<div class="main" data-fit="460"><div class="line syl" id="syl">${pattern(task.text, task.pos)}</div></div>`;
    case 'famous':
      return `<div class="main" data-fit="460"><div class="line"><span>${task.a}</span><i class="dot"></i><span>${task.b}</span></div></div>`;
    case 'question': {
      const [a, b] = words(task);
      return `<div class="main" data-fit="150"><p class="q">${esc(a)}</p>${b ? `<p class="q second">${esc(b)}</p>` : ''}</div>`;
    }
    case 'scramble': {
      const n = task.letters.length;
      return `<div class="main" data-fit="240"><div class="tiles" style="--n:${n};--half:${Math.ceil(n / 2)}">${task.letters.map((l, i) => `<span style="--i:${i}">${l}</span>`).join('')}</div></div>`;
    }
    default: {
      const [a, b] = words(task);
      return `<div class="main" data-fit="340"><div class="line upper">${esc(a)}</div>${b ? `<div class="line upper second">${esc(b)}</div>` : ''}</div>`;
    }
  }
}

function taskRule(task) {
  switch (task.cat) {
    case 'syllable': return t.pos[task.pos];
    case 'famous': return t.ruleFamous;
    case 'question': return t.ruleQuestion;
    case 'compound': return t.ruleCompound;
    case 'scramble': return t.ruleScramble;
    case 'chain': return t.ruleChain[task.rule];
    default: return '';
  }
}

/* ---------- Light effects (Home Assistant) ---------- */

const PRESETS = ['pulse', 'siren', 'fire', 'disco', 'dim'];
const haForm = { url: '', token: '', useToken: false, error: '', busy: false, testing: false };

function lightsSection() {
  if (!ha.linked) {
    return `<section class="block" id="haBlock">
      <span class="mono muted">${t.haTitle}</span>
      <p class="small muted">${t.haIntro}</p>
      <input class="field" type="url" id="haUrl" inputmode="url" autocomplete="url" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="https://" value="${esc(haForm.url)}" aria-label="${t.haUrl}">
      ${haForm.useToken ? `<input class="field" type="password" id="haToken" autocomplete="off" enterkeyhint="go" placeholder="${t.haToken}" value="${esc(haForm.token)}" aria-label="${t.haToken}">` : ''}
      ${haForm.error ? `<p class="small warn" role="alert">${haForm.error}</p>` : ''}
      <button class="btn ghost" data-a="haConnect" ${haForm.busy ? 'disabled' : ''}>${haForm.useToken ? t.haConnectToken : t.haConnect}</button>
      <p class="small muted">${haForm.useToken ? t.haTokenHint : t.haLoginHint}</p>
      <button class="btn textbtn" data-a="haTokenMode">${haForm.useToken ? t.haUseLogin : t.haUseToken}</button>
    </section>`;
  }
  const n = S.ha.lights.length;
  const mode = S.ha.mode;
  const presets = mode === 'tick'
    ? `<span class="mono muted">${t.haPreset}</span>
      <div class="chips">${PRESETS.map((p) => `<button class="chip" aria-pressed="${S.ha.preset === p}" data-a="set" data-k="ha.preset" data-v="${p}">${t.haPresets[p]}</button>`).join('')}</div>
      <p class="small muted">${t.haPresetHint[S.ha.preset]}</p>`
    : '';
  const test = mode !== 'off'
    ? `<button class="btn ghost" data-a="haTest" ${n && !haForm.testing ? '' : 'disabled'}>${t.haTest}</button>
      ${haForm.error ? `<p class="small warn" role="alert">${haForm.error}</p>` : `<p class="small muted">${t.haTestHint}</p>`}`
    : '';
  return `<section class="block" id="haBlock">
    <span class="mono muted">${t.haTitle}</span>
    <div class="spread linked">
      <span class="col"><strong class="clip">${esc(ha.host)}</strong><span class="small muted"><i class="led" id="haLed" data-s="${ha.status}"></i><span id="haStatus">${t.haStatus[ha.status]}</span></span></span>
      <button class="btn textbtn fit" data-a="haUnlink">${t.haUnlink}</button>
    </div>
    ${seg('ha.mode', [['off', t.haOff], ['boom', t.haBoom], ['tick', t.haTick]], mode)}
    <p class="small muted">${t.haModeHint[mode]}</p>
    <button class="rowbtn framed" data-a="haPick"><span class="mono muted">${t.haLights}</span><span>${n ? t.haChosen(n) : t.haNone}</span></button>
    ${presets}
    ${test}
  </section>`;
}

ha.onStatus((s) => {
  const led = $('#haLed');
  const label = $('#haStatus');
  if (led) led.dataset.s = s;
  if (label) label.textContent = t.haStatus[s];
});

function showLightsBlock() {
  const block = $('#haBlock');
  if (block) block.scrollIntoView({ block: 'start' });
}

async function haConnect() {
  if (haForm.busy) return;
  const url = cleanUrl(haForm.url);
  haForm.error = '';
  if (!url) haForm.error = t.haBadUrl;
  else if (haForm.useToken && !haForm.token.trim()) haForm.error = t.haNoToken;
  if (haForm.error) { sfx.deny(); render({ keepScroll: true }); return; }
  if (!haForm.useToken) { ha.login(url); return; }
  haForm.busy = true;
  render({ keepScroll: true });
  try {
    await ha.linkToken(url, haForm.token.trim());
    haForm.token = '';
    if (S.ha.mode === 'off') S.ha.mode = 'boom';
    save();
    sfx.on();
  } catch (e) {
    haForm.error = t.haTokenFailed;
    sfx.deny();
  }
  haForm.busy = false;
  if (screen === 'settings') render({ keepScroll: true });
}

async function haTest() {
  if (haForm.testing || !lightsOn()) return;
  haForm.testing = true;
  haForm.error = '';
  render({ keepScroll: true });
  try {
    await ha.test(S.ha.mode, S.ha.preset, S.ha.lights);
  } catch (e) {
    haForm.error = t.haTestFailed;
    sfx.deny();
  }
  haForm.testing = false;
  if (screen === 'settings') render({ keepScroll: true });
}

// Light picker. Built for long lists: the list is cached, filtering runs on a
// prepared lower-case key, and rows are added in pages while scrolling.
const PAGE = 60;
let pick = null;

function lightRow(l) {
  return `<button class="lightrow" role="checkbox" aria-checked="${pick.sel.has(l.id)}" data-a="pickLight" data-id="${esc(l.id)}" data-s="none"><span class="check" aria-hidden="true"></span><span class="col"><span class="clip">${esc(l.name)}</span><span class="small muted clip">${esc(l.area || l.id)}</span></span>${l.color ? '' : `<span class="tag mono">${t.haNoColor}</span>`}</button>`;
}

function lightCount() {
  const el = $('#lightCount');
  if (!el || !pick) return;
  el.textContent = pick.all.length ? t.haCount(pick.sel.size, pick.view.length, pick.all.length) : '';
}

function showLights(reset) {
  const list = $('#lightList');
  if (!list || !pick) return;
  if (reset) {
    pick.shown = 0;
    list.scrollTop = 0;
    if (!pick.view.length) {
      const note = pick.state === 'loading' ? t.haLoading : pick.state === 'error' ? t.haLoadFailed : pick.all.length ? t.haNoMatch : t.haEmpty;
      list.innerHTML = `<p class="small muted empty">${note}</p>`;
      lightCount();
      return;
    }
    list.innerHTML = '';
  }
  const next = pick.view.slice(pick.shown, pick.shown + PAGE);
  if (next.length) list.insertAdjacentHTML('beforeend', next.map(lightRow).join(''));
  pick.shown += next.length;
  lightCount();
}

function filterLights(q) {
  if (!pick) return;
  pick.q = q;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  pick.view = terms.length ? pick.all.filter((l) => terms.every((w) => l.key.includes(w))) : pick.all;
  showLights(true);
}

function setLightList(list) {
  // Chosen lights first, then by room and name (the order the list arrives in)
  const chosen = new Set(S.ha.lights);
  const keyed = list.map((l) => ({ ...l, key: `${l.name} ${l.area} ${l.id}`.toLowerCase() }));
  pick.all = keyed.filter((l) => chosen.has(l.id)).concat(keyed.filter((l) => !chosen.has(l.id)));
  pick.state = 'ready';
  filterLights(pick.q);
}

async function loadLights() {
  const mine = pick;
  const btn = $('[data-a="haRefresh"]');
  if (btn) btn.classList.add('spin');
  try {
    const list = await ha.fetchLights();
    if (pick !== mine) return;
    // Forget chosen lights that no longer exist
    const known = new Set(list.map((l) => l.id));
    [...pick.sel].forEach((id) => { if (!known.has(id)) pick.sel.delete(id); });
    S.ha.lights = [...pick.sel];
    save();
    setLightList(list);
  } catch (e) {
    if (pick !== mine) return;
    if (!pick.all.length) { pick.state = 'error'; showLights(true); }
  }
  const now = $('[data-a="haRefresh"]');
  if (now) now.classList.remove('spin');
}

function lightsSheet() {
  const cached = ha.cachedLights();
  pick = { all: [], view: [], shown: 0, q: '', sel: new Set(S.ha.lights), state: 'loading' };
  openSheet(`<div class="spread"><h2 class="title">${t.haPickTitle}</h2><span class="row"><button class="icon" data-a="haRefresh" aria-label="${t.haRefresh}">${ICON.refresh}</button><button class="icon" data-a="closeLights" aria-label="${t.close}">${ICON.close}</button></span></div>
    <input class="field" type="search" id="lightSearch" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search" placeholder="${t.haSearch}" aria-label="${t.haSearch}">
    <p class="small muted" id="lightCount" aria-live="polite"></p>
    <div class="lightlist" id="lightList"></div>
    <button class="btn primary portonly" data-a="closeLights">${t.done}</button>`, { modal: true });
  const list = $('#lightList');
  list.addEventListener('scroll', () => {
    if (pick && pick.shown < pick.view.length && list.scrollTop + list.clientHeight > list.scrollHeight - 400) showLights(false);
  }, { passive: true });
  if (cached) setLightList(cached.list);
  else showLights(true);
  if (!cached || Date.now() - cached.at > 10 * 60 * 1000) loadLights();
}

/* ---------- Screens ---------- */

const SCREENS = {
  start() {
    const names = namedCount();
    const langLabel = S.lang === 'both' ? t.langBothLong : S.lang === 'de' ? t.langDe : t.langEn;
    return `<main class="screen start">
      <header class="top">
        <span class="mono muted">${t.tag}</span>
        <span class="row">
          ${fsButton()}
          <button class="icon" data-a="rules" aria-label="${t.howto}">${ICON.help}</button>
          <button class="icon" data-a="go" data-to="settings" data-s="nav" aria-label="${t.settings}">${ICON.sliders}</button>
        </span>
      </header>
      <section class="hero">
        <h1 class="logo" aria-label="Peng">${letters('PENG')}</h1>
        <div class="fuse" aria-hidden="true"><i></i><b></b></div>
        <p class="lead">${t.intro}</p>
      </section>
      <nav class="rows stagger">
        <button class="rowbtn" data-a="players"><span class="mono muted">${t.rowPlayers}</span><span>${t.nPlayers(S.players)} · ${names ? t.namesSet(names) : t.noNames}</span></button>
        <button class="rowbtn" data-a="go" data-to="cats" data-s="nav"><span class="mono muted">${t.rowCats}</span><span>${t.catsOf(activeCats().length, CATS.length)} · ${S.pick === 'dice' ? t.pickDice : t.pickChoose}</span></button>
        <button class="rowbtn" data-a="go" data-to="settings" data-s="nav"><span class="mono muted">${t.rowLang}</span><span>${langLabel}</span></button>
      </nav>
      <footer class="actions">
        <button class="btn primary" data-a="startGame" data-score="1" data-s="nav">${t.start}</button>
        <button class="btn ghost" data-a="startGame" data-score="0" data-s="nav">${t.quick}</button>
      </footer>
    </main>`;
  },

  cats() {
    const rows = CATS.map((c) => {
      const on = S.cats[c];
      return `<div class="catrow">
        <div class="cattext">
          <div class="catname"><strong>${t.cat[c].name}</strong><span class="mono ${on ? 'accent' : 'muted'}">${SAMPLE[S.ui][c]}</span></div>
          <span class="small muted">${t.cat[c].short}</span>
        </div>
        <button class="icon ghosticon" data-a="info" data-cat="${c}" aria-label="${t.info}: ${t.cat[c].name}">${ICON.info}</button>
        ${sw(`cat.${c}`, on, t.cat[c].name)}
      </div>`;
    }).join('');
    return `<main class="screen cats">
      <header class="top left">
        <button class="icon" data-a="go" data-to="start" data-s="back" aria-label="${t.back}">${ICON.back}</button>
        <h1 class="title">${t.catsTitle}</h1>
      </header>
      <section class="list stagger">${rows}</section>
      <section class="block">
        <span class="mono muted">${t.whoPicks}</span>
        ${seg('pick', [['dice', t.pickDice], ['choose', t.pickChoose]], S.pick)}
        <p class="small muted">${S.pick === 'dice' ? t.pickDiceHint : t.pickChooseHint}</p>
      </section>
    </main>`;
  },

  settings() {
    const a = (S.tmin - 5) / 115;
    const b = (S.tmax - 5) / 115;
    const preset = (lo, hi, label) => `<button class="chip" aria-pressed="${S.tmin === lo && S.tmax === hi}" data-a="preset" data-lo="${lo}" data-hi="${hi}">${label} ${lo}–${hi}</button>`;
    const canVib = sfx.canVibrate();
    return `<main class="screen settings">
      <header class="top left">
        <button class="icon" data-a="go" data-to="start" data-s="back" aria-label="${t.back}">${ICON.back}</button>
        <h1 class="title">${t.setTitle}</h1>
      </header>
      <section class="block">
        <span class="mono muted">${t.setLang}</span>
        ${seg('lang', [['de', t.langDe], ['en', t.langEn], ['both', t.langBoth]], S.lang)}
        <p class="small muted">${t.setLangHint[S.lang]}</p>
      </section>
      <section class="block">
        <div class="spread"><span class="mono muted">${t.setFuse}</span><span class="value" id="fuseVal">${S.tmin} – ${S.tmax} s</span></div>
        <div class="dual" id="dual" style="--a:${a};--b:${b}">
          <div class="track"></div><div class="fill"></div>
          <input type="range" id="tmin" min="5" max="120" step="5" value="${S.tmin}" data-k="tmin" aria-label="${t.fuseMin}">
          <input type="range" id="tmax" min="5" max="120" step="5" value="${S.tmax}" data-k="tmax" aria-label="${t.fuseMax}">
        </div>
        <div class="chips">${preset(5, 30, t.presetShort)}${preset(10, 60, t.presetStd)}${preset(20, 90, t.presetLong)}</div>
        <p class="small muted">${t.setFuseHint}</p>
      </section>
      <section class="block">
        <span class="mono muted">${t.setIgnite}</span>
        ${seg('ignite', [['auto', t.igniteAuto], ['manual', t.igniteManual]], S.ignite)}
        <p class="small muted">${t.setIgniteHint[S.ignite]}</p>
      </section>
      <section class="block">
        <span class="mono muted">${t.setDiff}</span>
        ${seg('diff', [['easy', t.diffEasy], ['mid', t.diffMid], ['hard', t.diffHard]], S.diff)}
      </section>
      <section class="list">
        <div class="setrow"><span>${t.setRounds}</span>
          <span class="stepper"><button class="icon" data-a="step" data-k="rounds" data-d="-1" data-s="none" aria-label="${t.less}">−</button><span class="value" data-val="rounds" aria-live="polite">${S.rounds}</span><button class="icon" data-a="step" data-k="rounds" data-d="1" data-s="none" aria-label="${t.more}">+</button></span>
        </div>
        <div class="setrow"><span>${t.setSound}</span>${sw('sound', S.sound, t.setSound)}</div>
        <div class="setrow"><span class="col"><span>${t.setVib}</span><span class="small muted">${canVib ? t.vibYes : t.vibNo}</span></span>${sw('vib', S.vib && canVib, t.setVib)}</div>
        <div class="setrow"><span class="col"><span>${t.setSafe}</span><span class="small muted">${t.setSafeHint}</span></span>${sw('safe', S.safe, t.setSafe)}</div>
      </section>
      <section class="block">
        <span class="mono muted">${t.setTheme}</span>
        ${seg('theme', [['dark', t.themeDark], ['light', t.themeLight]], S.theme)}
      </section>
      <section class="block">
        <span class="mono muted">${t.setOrient}</span>
        ${seg('orient', [['auto', t.orientAuto], ['port', t.orientPort], ['land', t.orientLand]], S.orient)}
        <p class="small muted">${t.setOrientHint[S.orient]}</p>
      </section>
      <section class="block">
        <span class="mono muted">${t.setColor}</span>
        <div class="swatches">${ACCENTS.map((c, i) => `<button class="swatch" style="--c:${c}" aria-pressed="${S.accent === c}" aria-label="${t.color} ${i + 1}" data-a="set" data-k="accent" data-v="${c}"></button>`).join('')}</div>
      </section>
      ${lightsSection()}
      <section class="block">
        <span class="mono muted">${t.dataTitle}</span>
        <button class="btn ghost warn" data-a="wipeAsk">${t.wipe}</button>
        <p class="small muted">${t.wipeHint}</p>
      </section>
    </main>`;
  },

  roll() {
    const act = activeCats();
    if (S.pick === 'choose') {
      return `<main class="screen g roll choose">
        ${gameHeader()}
        <section class="stage top-align">
          <h2 class="title">${t.chooseTitle}</h2>
          <div class="choosegrid stagger">${act.map((c) => `<button class="choice" data-a="choose" data-cat="${c}" data-s="none"><strong>${t.cat[c].name}</strong><span class="mono muted">${SAMPLE[S.ui][c]}</span></button>`).join('')}</div>
        </section>
      </main>`;
    }
    return `<main class="screen g roll">
      ${gameHeader()}
      <section class="stage">
        <div class="diewrap" id="diewrap"><button class="die" id="die" data-a="roll" data-s="none" aria-label="${t.roll}"><span id="dieLabel">?</span></button></div>
        <p class="small muted center" id="rollHint">${t.rollHint}</p>
      </section>
      <footer class="actions">
        <button class="btn primary big" data-a="roll" data-s="none">${t.roll}</button>
      </footer>
    </main>`;
  },

  // Short explanation of the rolled category, then "Ready"
  intro() {
    const c = G.cat;
    const name = t.cat[c].name.toUpperCase();
    const multi = activeCats().length > 1;
    const how = c === 'chain' ? `${t.how.chain} ${t.ruleChain[G.task.rule]}.` : t.how[c];
    const again = multi ? `<button class="btn ghost" data-a="reroll" data-s="none">${S.pick === 'dice' ? t.reroll : t.otherCat}</button>` : '';
    return `<main class="screen g intro">
      ${gameHeader()}
      <section class="stage introstage">
        <div class="spread">
          <span class="mono accent">${t.category}</span>
          <button class="icon ghosticon" data-a="info" data-cat="${c}" aria-label="${t.moreInfo}">${ICON.info}</button>
        </div>
        <div class="fitarea namearea"><div class="main" data-fit="220"><div class="line slam" aria-label="${name}">${letters(name)}</div></div></div>
        <p class="lead how">${how}</p>
        <p class="mono sample">${SAMPLE[S.ui][c]}</p>
      </section>
      <footer class="actions">
        <p class="small muted center">${t.readyHint[S.ignite]}</p>
        <button class="btn primary big glow" data-a="ready" data-s="none">${t.ready}</button>
        ${again}
      </footer>
    </main>`;
  },

  // Manual ignition only: look at the task, then light it
  task() {
    const c = G.cat;
    const safe = S.safe && t.safeNote[c] ? `<p class="small muted">${t.safeNote[c]}</p>` : '';
    return `<main class="screen g task">
      ${gameHeader()}
      <section class="stage taskstage">
        <div class="spread">
          <span class="mono accent">${t.category} · ${t.cat[c].name.toUpperCase()}</span>
          <span class="row">${S.lang === 'both' ? '<span class="tag mono">DE + EN</span>' : ''}<button class="icon ghosticon" data-a="info" data-cat="${c}" aria-label="${t.info}">${ICON.info}</button></span>
        </div>
        <div class="fitarea">${taskMain(G.task)}</div>
        <p class="rule" id="posLabel">${taskRule(G.task)}</p>
        ${safe}
      </section>
      <footer class="actions">
        <p class="small muted center">${t.igniteHint}</p>
        <button class="btn primary big" data-a="ignite" data-s="none">${t.ignite}</button>
        <button class="btn ghost" data-a="otherTask" data-s="none">${t.otherTask}</button>
      </footer>
    </main>`;
  },

  bomb() {
    return `<main class="screen g bomb" id="bombScreen">
      <header class="top center">
        <span class="live" aria-hidden="true"></span>
        <span class="mono muted">${t.ticking(G.round, t.cat[G.cat].name.toUpperCase())}</span>
      </header>
      <section class="stage bombstage" id="bombStage">
        <div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="fitarea mid">${taskMain(G.task)}</div>
        <p class="rule" id="posLabel">${taskRule(G.task)}</p>
      </section>
      <footer class="actions">
        <button class="hold" id="hold" data-s="none"><span class="holdfill"></span><span class="holdlabel">${ICON.lock}<span>${t.hold}</span></span></button>
        <p class="small muted center lockhint">${t.locked}</p>
      </footer>
    </main>`;
  },

  boom() {
    const last = G.scoring && G.round >= G.total;
    const many = S.players > 5;
    const players = G.scoring
      ? `<div class="who stagger ${many ? 'grid' : ''}"${S.players > 12 ? ' style="grid-template-columns:repeat(3,minmax(0,1fr))"' : ''}>${G.scores.map((p, i) => `<button class="player" aria-pressed="false" data-a="blame" data-i="${i}" data-s="none"><span>${esc(playerName(i))}</span><span class="mono pts">${many ? p : t.points(p)}</span></button>`).join('')}</div>`
      : '';
    const debris = Array.from({ length: 22 }, () => `<i class="p" style="--a:${rnd(360)}deg;--d:${120 + rnd(420)}px;--s:${5 + rnd(13)}px;--t:${600 + rnd(700)}ms"></i>`).join('');
    return `<main class="screen boom">
      <div class="fx" aria-hidden="true"><i class="flash"></i><i class="shock"></i><i class="shock two"></i>${debris}</div>
      <header class="top">
        <span class="mono">${t.round(G.round, G.total)}</span>
        <span class="mono">${t.after(lastElapsed)}</span>
      </header>
      <section class="hero">
        <h1 class="logo bang" aria-label="${t.boom}">${letters(t.boom)}</h1>
        <p class="lead strong">${G.scoring ? t.whoHad : t.quickNote}</p>
      </section>
      <div class="side">
        ${players}
        <footer class="actions cool" id="boomActions">
          <button class="btn dark" data-a="next" data-s="none" ${G.scoring ? 'disabled' : ''}>${last ? t.finish : t.next}</button>
          ${G.scoring
    ? `<button class="btn textbtn" data-a="nocount">${t.noCount}</button><p class="small center">${t.loserNote(G.total)}</p>`
    : `<button class="btn textbtn" data-a="home" data-s="back">${t.end}</button>`}
        </footer>
      </div>
    </main>`;
  },

  end() {
    const max = Math.max(...G.scores);
    const order = G.scores.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p || x.i - y.i);
    return `<main class="screen end">
      <header class="top"><span class="mono muted">PENG</span><span class="mono muted">${t.round(G.total, G.total)}</span></header>
      <h1 class="title xl">${t.final}</h1>
      <section class="list scores stagger">${order.map(({ p, i }) => `<div class="scorerow ${p === max && max > 0 ? 'loser' : ''}">
        <span class="name">${esc(playerName(i))}</span>
        ${p === max && max > 0 ? `<span class="tag mono">${t.loses}</span>` : ''}
        <span class="value" data-count="${p}">0</span>
      </div>`).join('')}</section>
      <p class="small muted">${t.finalHint}</p>
      <footer class="actions">
        <button class="btn primary" data-a="again" data-s="nav">${t.again}</button>
        <button class="btn ghost" data-a="home" data-s="back">${t.home}</button>
      </footer>
    </main>`;
  },
};

/* ---------- Rendering ---------- */

function render(opts = {}) {
  const keep = opts.keepScroll ? scroller.scrollTop : 0;
  document.body.dataset.screen = screen;
  app.innerHTML = SCREENS[screen]();
  if (!opts.keepScroll) $('.screen', app).classList.add('enter');
  fitAll();
  scroller.scrollTop = keep;
  if (screen === 'bomb') armBombScreen();
  if (screen === 'boom') {
    setTimeout(() => { const f = $('#boomActions'); if (f) f.classList.remove('cool'); }, 1300);
  }
  if (screen === 'end') countUp();
}

function go(to, opts) {
  screen = to;
  if (to !== 'settings') haForm.error = '';
  render(opts);
  if (to === 'settings' && ha.linked) ha.connect().catch(() => {});
}

function countUp() {
  $$('[data-count]').forEach((el, idx) => {
    const target = Number(el.dataset.count);
    if (calm() || !target) { el.textContent = target; return; }
    let n = 0;
    setTimeout(function step() {
      n += 1;
      el.textContent = n;
      if (n < target) setTimeout(step, 90);
    }, 350 + idx * 70);
  });
}

// Sparks around an element
function burst(host, n = 14) {
  if (!host || calm()) return;
  const box = document.createElement('div');
  box.className = 'sparks';
  box.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--a:${Math.round((360 / n) * i + rnd(18))}deg;--d:${90 + rnd(110)}px;--t:${420 + rnd(380)}ms"></i>`).join('');
  host.appendChild(box);
  setTimeout(() => box.remove(), 1000);
}

/* ---------- Sheets ---------- */

let sheetModal = false;
let sheetToken = 0;
function openSheet(html, { modal = false, quiet = false } = {}) {
  sheetToken += 1;
  sheetModal = modal;
  sheetEl.classList.remove('closing');
  sheetEl.innerHTML = `<div class="backdrop" data-a="closeSheet" data-s="none"></div><div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  sheetEl.hidden = false;
  if (!quiet) sfx.sheet();
}
function closeSheet(force = false, instant = false) {
  if (sheetEl.hidden || (sheetModal && !force)) return;
  sheetModal = false;
  const token = sheetToken;
  const finish = () => {
    if (token !== sheetToken) return;
    sheetEl.hidden = true;
    sheetEl.innerHTML = '';
    sheetEl.classList.remove('closing');
  };
  if (instant || calm()) { finish(); return; }
  sheetEl.classList.add('closing');
  setTimeout(finish, 170);
}

function infoSheet(c) {
  openSheet(`<div class="spread"><h2 class="title">${t.cat[c].name.toUpperCase()}</h2><button class="icon" data-a="closeSheet" data-force="1" aria-label="${t.close}">${ICON.close}</button></div>
    <p class="mono accent">${SAMPLE[S.ui][c]}</p>
    ${t.cat[c].long.map((p) => `<p>${p}</p>`).join('')}
    <button class="btn ghost" data-a="closeSheet" data-force="1">${t.done}</button>`);
}

function rulesSheet() {
  openSheet(`<div class="spread"><h2 class="title">${t.rulesTitle}</h2><button class="icon" data-a="closeSheet" data-force="1" aria-label="${t.close}">${ICON.close}</button></div>
    <ol class="steps">${t.rules.map((r) => `<li>${r}</li>`).join('')}</ol>
    <p class="small muted">${t.rulesTip}</p>
    <button class="btn ghost" data-a="closeSheet" data-force="1">${t.done}</button>`);
}

function playersSheet(refresh = false) {
  const inputs = Array.from({ length: S.players }, (_, i) => `<label class="namefield"><span class="mono muted">${i + 1}</span><input type="text" id="name${i}" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="${t.player(i + 1)}" value="${esc(S.names[i] || '')}" data-name="${i}"></label>`).join('');
  const html = `<div class="spread"><h2 class="title">${t.playersTitle}</h2><button class="icon" data-a="closePlayers" aria-label="${t.close}">${ICON.close}</button></div>
    <div class="setrow"><span>${t.playersCount}</span>
      <span class="stepper"><button class="icon" data-a="step" data-k="players" data-d="-1" data-s="none" aria-label="${t.less}">−</button><span class="value" data-val="players" aria-live="polite">${S.players}</span><button class="icon" data-a="step" data-k="players" data-d="1" data-s="none" aria-label="${t.more}">+</button></span>
    </div>
    <p class="small muted">${t.playersHint}</p>
    <div class="names">${inputs}</div>
    <button class="btn primary" data-a="closePlayers">${t.done}</button>`;
  if (refresh && !sheetEl.hidden) {
    const panel = $('.panel', sheetEl);
    const top = panel.scrollTop;
    panel.innerHTML = html;
    panel.scrollTop = top;
  } else {
    openSheet(html, { modal: true });
  }
}

function quitSheet() {
  openSheet(`<h2 class="title">${t.quitAsk}</h2>
    <button class="btn primary" data-a="closeSheet" data-force="1">${t.quitNo}</button>
    <button class="btn ghost" data-a="home" data-s="back">${t.quitYes}</button>`);
}

function wipeSheet() {
  openSheet(`<h2 class="title">${t.wipeAsk}</h2>
    <p class="muted">${t.wipeAskHint}</p>
    <button class="btn primary" data-a="closeSheet" data-force="1">${t.wipeNo}</button>
    <button class="btn ghost warn" data-a="wipe" data-s="none">${t.wipeYes}</button>`);
}

// Delete everything this site has stored on the device, then start over like a first visit
async function wipeData() {
  if (wiping) return;
  wiping = true;
  openSheet(`<h2 class="title">${t.wiping}</h2>`, { modal: true, quiet: true });
  const linked = ha.linked;
  if (linked) ha.unlink(); // puts lights back and withdraws the access at Home Assistant
  try { localStorage.clear(); } catch (e) { /* ignore */ }
  try { sessionStorage.clear(); } catch (e) { /* ignore */ }
  try {
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch (e) { /* ignore */ }
  try {
    if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
  } catch (e) { /* ignore */ }
  if (linked) await sleep(800); // let the sign-out reach Home Assistant before the page reloads
  location.replace(location.pathname);
}

function pauseSheet() {
  openSheet(`<h2 class="title xl">${t.paused}</h2>
    <p class="muted">${t.pausedHint}</p>
    <button class="btn primary" data-a="resume" data-s="none">${t.resume}</button>
    <button class="btn ghost" data-a="abortRound">${t.abortRound}</button>
    <button class="btn textbtn" data-a="home" data-s="back">${t.quit}</button>`, { modal: true, quiet: true });
}

/* ---------- Wake lock, back button ---------- */

let wakeLock = null;
async function wake() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* not supported or denied */ }
}
function unwake() {
  try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (B && B.running) pauseBomb();
  } else if (G) {
    wake();
  }
});

window.addEventListener('popstate', () => {
  if (G) {
    try { history.pushState({ peng: 1 }, ''); } catch (e) { /* ignore */ }
    if (B && B.running) pauseBomb();
    else if (sheetEl.hidden) quitSheet();
  } else if (screen !== 'start') {
    closeSheet(true, true);
    go('start');
  }
});

/* ---------- Game flow ---------- */

function startGame(scoring) {
  G = {
    scoring,
    round: 1,
    total: scoring ? S.rounds : 0,
    scores: Array(S.players).fill(0),
    starter: rnd(S.players),
    cat: null,
    task: null,
    pending: null,
    lastCat: null,
  };
  wake();
  if (lightsOn()) ha.connect().catch(() => {});
  try { history.pushState({ peng: 1 }, ''); } catch (e) { /* ignore */ }
  nextRound();
}

function newTask() {
  G.task = drawTask(G.cat, S.lang, S.diff);
}

function showIntro(cat) {
  G.cat = cat;
  G.lastCat = cat;
  newTask();
  go('intro');
  sfx.whoosh();
}

function nextRound() {
  G.pending = null;
  B = null;
  const act = activeCats();
  if (act.length === 1) {
    showIntro(act[0]);
  } else {
    G.cat = null;
    G.task = null;
    go('roll');
  }
}

async function doRoll() {
  if (rolling || screen !== 'roll' || S.pick !== 'dice') return;
  rolling = true;
  sfx.unlock();
  const act = activeCats();
  let pool = act;
  if (act.length > 2 && G.lastCat) pool = act.filter((c) => c !== G.lastCat); // never the same category twice in a row
  const final = pool[rnd(pool.length)];
  const die = $('#die');
  const label = $('#dieLabel');
  $$('[data-a="roll"]').forEach((b) => { b.disabled = true; });
  const hint = $('#rollHint');
  if (hint) hint.style.visibility = 'hidden';
  die.classList.add('rolling');
  const steps = calm() ? 5 : 13 + rnd(4);
  let idx = (((act.indexOf(final) - steps) % act.length) + act.length) % act.length;
  let delay = 55;
  for (let i = 0; i < steps; i++) {
    idx = (idx + 1) % act.length;
    if (screen !== 'roll') { rolling = false; return; }
    label.textContent = t.cat[act[idx]].name.toUpperCase();
    label.classList.remove('flip');
    void label.offsetWidth;
    label.classList.add('flip');
    sfx.diceTick(i);
    await sleep(delay);
    delay *= 1.15;
  }
  if (screen !== 'roll') { rolling = false; return; }
  die.classList.remove('rolling');
  die.classList.add('landed');
  burst($('#diewrap'));
  sfx.land();
  await sleep(calm() ? 400 : 900);
  rolling = false;
  if (screen !== 'roll' || !G) return;
  showIntro(final);
}

// Reveal the task; for syllables the position visibly rolls first
async function revealTask() {
  const task = G.task;
  const here = screen;
  const still = () => screen === here && G && G.task === task;
  const main = $('.main', app);
  if (main) main.classList.add('pop');
  if (task.cat !== 'syllable' || calm()) {
    sfx.reveal();
    await sleep(calm() ? 150 : 450);
    return still();
  }
  const el = $('#syl');
  const label = $('#posLabel');
  const btn = $('[data-a="ignite"]');
  const frames = ['start', 'end', 'mid', 'any'].filter((p) => p === 'any' || task.allowed.includes({ start: 's', end: 'e', mid: 'm' }[p]));
  if (frames.length < 2) {
    sfx.reveal();
    await sleep(450);
    return still();
  }
  if (btn) btn.disabled = true;
  let delay = 70;
  for (let i = 0; i < 8; i++) {
    if (!still()) return false;
    const p = frames[i % frames.length];
    el.innerHTML = pattern(task.text, p);
    label.textContent = t.pos[p];
    fitAll();
    sfx.diceTick(i + 4);
    await sleep(delay);
    delay *= 1.18;
  }
  if (!still()) return false;
  el.innerHTML = pattern(task.text, task.pos);
  label.textContent = t.pos[task.pos];
  fitAll();
  main.classList.remove('pop');
  void main.offsetWidth;
  main.classList.add('pop');
  sfx.reveal();
  if (btn) btn.disabled = false;
  await sleep(350);
  return still();
}

/* ---------- Bomb ---------- */

function newBomb() {
  const secs = testFuse || S.tmin + Math.random() * (S.tmax - S.tmin);
  B = { left: secs * 1000, total: secs * 1000, running: false, alt: false, tempo: 520, tempoUntil: 0, t0: 0, boomTimer: 0, tickTimer: 0 };
}

// "Ready": automatic ignition shows the task right on the bomb screen
async function ready() {
  if (!G || !G.task) return;
  sfx.ready();
  if (S.ignite === 'manual') {
    go('task');
    revealTask();
    return;
  }
  newBomb();
  const bomb = B;
  go('bomb');
  wake();
  const ok = await revealTask();
  if (!ok || B !== bomb) return;
  light(bomb);
}

// Manual ignition
function ignite() {
  if (!G || !G.task) return;
  newBomb();
  go('bomb');
  wake();
  light(B);
}

function light(bomb) {
  sfx.ignite();
  if (lightsOn()) ha.arm(S.ha.lights); // remember how the lights are before any effect
  const stage = $('#bombStage');
  if (stage) stage.classList.add('lit');
  setTimeout(() => { if (B === bomb && !bomb.running && screen === 'bomb' && sheetEl.hidden) startBomb(); }, 750);
}

function startBomb() {
  if (!B) return;
  B.running = true;
  B.t0 = performance.now();
  B.boomTimer = setTimeout(explode, B.left);
  ha.resetTick();
  tickLoop(0);
}

function tickLoop(delay) {
  B.tickTimer = setTimeout(() => {
    if (!B || !B.running) return;
    B.alt = !B.alt;
    sfx.tick(B.alt);
    if (S.ha.mode === 'tick') ha.tick(S.ha.preset);
    const stage = $('#bombStage');
    if (stage) {
      stage.classList.remove('pulse');
      void stage.offsetWidth;
      stage.classList.add('pulse');
    }
    // The tempo varies at random and reveals nothing about the time left
    const now = performance.now();
    if (now > B.tempoUntil) {
      B.tempo = 360 + Math.random() * 340;
      B.tempoUntil = now + 2500 + Math.random() * 5000;
    }
    tickLoop(B.tempo);
  }, delay);
}

function stopBombTimers() {
  if (!B) return;
  clearTimeout(B.boomTimer);
  clearTimeout(B.tickTimer);
}

function pauseBomb() {
  if (!B || !B.running) return;
  B.running = false;
  stopBombTimers();
  B.left = Math.max(400, B.left - (performance.now() - B.t0));
  sfx.pause();
  ha.pause();
  pauseSheet();
}

function resumeBomb() {
  closeSheet(true);
  if (!B) return;
  sfx.resume();
  wake();
  startBomb();
}

function explode() {
  if (!B) return;
  stopBombTimers();
  lastElapsed = Math.round(B.total / 1000);
  B = null;
  closeSheet(true, true);
  sfx.boom();
  ha.boom();
  go('boom');
}

function armBombScreen() {
  const scr = $('#bombScreen');
  const hold = $('#hold');
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
    hold.classList.remove('holding');
  };
  hold.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!B || !B.running) return;
    try { hold.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    hold.classList.add('holding');
    timer = setTimeout(() => { cancel(); pauseBomb(); }, 2000);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((ev) => hold.addEventListener(ev, cancel));
  // Block swiping, dragging and pull-to-refresh
  scr.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}

/* ---------- Actions ---------- */

function setValue(k, v) {
  if (k === 'lang') {
    S.lang = v;
    if (v !== 'both') S.ui = v;
  } else if (['accent', 'pick', 'diff', 'ignite', 'theme', 'orient'].includes(k)) {
    S[k] = v;
  } else if (k === 'ha.mode' || k === 'ha.preset') {
    S.ha[k.slice(3)] = v;
    haForm.error = '';
  }
  save();
  applySettings();
  if (k === 'orient') layout();
  render({ keepScroll: true });
}

const ACTIONS = {
  go(el) { closeSheet(true, true); go(el.dataset.to); },
  fullscreen() { toggleFullscreen(); },
  rules() { rulesSheet(); },
  info(el) { infoSheet(el.dataset.cat); },
  players() { playersSheet(); },
  closeSheet(el) { closeSheet(el.dataset.force === '1'); },
  closePlayers() { closeSheet(true); save(); render({ keepScroll: true }); },

  set(el) { setValue(el.dataset.k, el.dataset.v); },
  toggle(el) {
    const k = el.dataset.k;
    if (k.startsWith('cat.')) {
      const c = k.slice(4);
      if (S.cats[c] && activeCats().length === 1) { sfx.deny(); el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); return; }
      S.cats[c] = !S.cats[c];
      (S.cats[c] ? sfx.on : sfx.off)();
    } else {
      if (k === 'vib' && !sfx.canVibrate()) { sfx.deny(); return; }
      S[k] = !S[k];
      applySettings();
      (S[k] ? sfx.on : sfx.off)();
    }
    save();
    applySettings();
    render({ keepScroll: true });
  },
  step(el) {
    const k = el.dataset.k;
    const d = Number(el.dataset.d);
    const [lo, hi] = k === 'players' ? [2, 20] : [3, 30];
    const v = Math.min(hi, Math.max(lo, S[k] + d));
    if (v === S[k]) { sfx.deny(); return; }
    S[k] = v;
    sfx.step(d > 0);
    save();
    if (k === 'players') playersSheet(true); else render({ keepScroll: true });
    const val = $(`[data-val="${k}"]`);
    if (val) val.classList.add('bump');
  },
  preset(el) {
    S.tmin = Number(el.dataset.lo);
    S.tmax = Number(el.dataset.hi);
    save();
    render({ keepScroll: true });
  },

  startGame(el) { startGame(el.dataset.score === '1'); },
  roll() { doRoll(); },
  choose(el) {
    sfx.land();
    showIntro(el.dataset.cat);
  },
  reroll() {
    go('roll');
    if (S.pick === 'dice') doRoll();
  },
  ready() { ready(); },
  otherTask() { newTask(); render(); revealTask(); },
  ignite() { ignite(); },
  resume() { resumeBomb(); },
  abortRound() {
    stopBombTimers();
    B = null;
    ha.release();
    closeSheet(true, true);
    nextRound();
  },
  quit() { quitSheet(); },
  home() {
    stopBombTimers();
    B = null;
    G = null;
    ha.release();
    rolling = false;
    unwake();
    closeSheet(true, true);
    go('start');
  },

  blame(el) {
    G.pending = Number(el.dataset.i);
    $$('.player').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    const next = $('[data-a="next"]');
    if (next) next.disabled = false;
    sfx.pick();
  },
  next() {
    if (G.scoring) {
      if (G.pending == null) { sfx.deny(); return; }
      G.scores[G.pending] += 1;
      G.starter = G.pending;
      if (G.round >= G.total) {
        sfx.finale();
        go('end');
        return;
      }
    }
    G.round += 1;
    sfx.nav();
    nextRound();
  },
  nocount() { nextRound(); },
  again() { startGame(true); },

  wipeAsk() { wipeSheet(); },
  wipe() { wipeData(); },

  haConnect() { haConnect(); },
  haTokenMode() {
    haForm.useToken = !haForm.useToken;
    haForm.error = '';
    render({ keepScroll: true });
  },
  haUnlink() {
    ha.unlink();
    S.ha.lights = []; // they belong to the instance that was just disconnected
    save();
    haForm.error = '';
    render({ keepScroll: true });
  },
  haPick() { lightsSheet(); },
  haRefresh() { loadLights(); },
  haTest() { haTest(); },
  pickLight(el) {
    const id = el.dataset.id;
    const on = !pick.sel.has(id);
    if (on) pick.sel.add(id); else pick.sel.delete(id);
    el.setAttribute('aria-checked', String(on));
    (on ? sfx.on : sfx.off)();
    S.ha.lights = [...pick.sel];
    save();
    lightCount();
  },
  closeLights() {
    pick = null;
    closeSheet(true);
    render({ keepScroll: true });
  },
};

const SOUNDS = { nav: sfx.nav, back: sfx.backNav, none: null };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const s = el.dataset.s;
  if (s === undefined) sfx.tap();
  else if (SOUNDS[s]) SOUNDS[s]();
  else sfx.unlock();
  const fn = ACTIONS[el.dataset.a];
  if (fn) fn(el);
});

// Fuse sliders: update live without re-rendering
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('.dual input')) {
    const k = el.dataset.k;
    let v = Number(el.value);
    if (k === 'tmin') v = Math.min(v, S.tmax - 5);
    else v = Math.max(v, S.tmin + 5);
    el.value = v;
    if (S[k] !== v) sfx.step(v > S[k]);
    S[k] = v;
    const dual = $('#dual');
    dual.style.setProperty('--a', (S.tmin - 5) / 115);
    dual.style.setProperty('--b', (S.tmax - 5) / 115);
    $('#fuseVal').textContent = `${S.tmin} – ${S.tmax} s`;
    $$('.chip[data-lo]').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.lo) === S.tmin && Number(c.dataset.hi) === S.tmax)));
  } else if (el.matches('[data-name]')) {
    S.names[Number(el.dataset.name)] = el.value;
  } else if (el.id === 'haUrl') {
    haForm.url = el.value;
  } else if (el.id === 'haToken') {
    haForm.token = el.value;
  } else if (el.id === 'lightSearch') {
    filterLights(el.value.trim());
  }
});
document.addEventListener('change', (e) => {
  if (e.target.matches('.dual input, [data-name]')) save();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-name], #lightSearch')) e.target.blur();
  if (e.key === 'Enter' && e.target.matches('#haUrl, #haToken')) { e.target.blur(); haConnect(); }
  if (e.key === 'Escape' && !sheetEl.hidden) closeSheet();
});
document.addEventListener('contextmenu', (e) => {
  if (screen === 'bomb' || screen === 'roll') e.preventDefault();
});

let resizeTimer = 0;
const relayout = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layout, 60);
};
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', relayout);

/* ---------- Boot ---------- */

applySettings();
layout();
render();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitAll());

// Back from the Home Assistant login page, or lights left mid-effect by a closed tab
ha.finishLogin().then((back) => {
  if (!back) { ha.recover(); return; }
  if (back.ok) {
    if (S.ha.mode === 'off') S.ha.mode = 'boom';
    save();
  } else {
    haForm.url = back.url;
    haForm.error = t.haLoginFailed;
  }
  if (G) return;
  go('settings');
  showLightsBlock();
  if (back.ok && !S.ha.lights.length) lightsSheet();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
