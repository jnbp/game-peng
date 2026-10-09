// Home Assistant link: sign-in, the list of lights and the light effects for the bomb.
// Everything goes straight from this device to the Home Assistant instance over its
// WebSocket API. Tokens are kept in this browser's local storage and nowhere else.

const AUTH_KEY = 'peng.ha.auth.v1';
const LIGHTS_KEY = 'peng.ha.lights.v1';
const PENDING_KEY = 'peng.ha.pending';
const HELD_KEY = 'peng.ha.held';
const CLIENT_ID = `${location.origin}/`;
const REDIRECT = `${location.origin}${location.pathname}`;
const COLOR_MODES = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

// One round trip that returns only the lights: [entity_id, name, area, has colour]
const LIGHTS_TEMPLATE = "{% set ns = namespace(l=[]) %}{% for s in states.light %}{% set ns.l = ns.l + [[s.entity_id, s.name, area_name(s.entity_id) or '', 1 if (s.attributes.supported_color_modes or []) | select('in', ['hs','rgb','rgbw','rgbww','xy']) | list | count > 0 else 0]] %}{% endfor %}{{ ns.l | tojson }}";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);
const read = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { /* private mode */ }
};
const randomId = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

let auth = read(AUTH_KEY); // { url, scene, refresh, access, expires } or { url, scene, token }
let status = auth ? 'idle' : 'off'; // off | idle | connecting | online | offline | denied
const listeners = new Set();
function setStatus(s) {
  if (s === status) return;
  status = s;
  listeners.forEach((fn) => fn(s));
}

// Accepts "ha.example.org" as well as a full address; only https is allowed
// (plain http only while the game itself is served over http for local testing).
export function cleanUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const dev = location.protocol === 'http:';
    if (u.protocol !== 'https:' && !(dev && u.protocol === 'http:')) return null;
    return u.origin;
  } catch (e) {
    return null;
  }
}

/* ---------- Sign-in ---------- */

async function tokenRequest(url, fields) {
  const res = await fetch(`${url}/auth/token`, { method: 'POST', body: new URLSearchParams({ ...fields, client_id: CLIENT_ID }) });
  if (!res.ok) {
    const err = new Error('token');
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Sends the browser to the Home Assistant login page; it comes back with ?code=…
function login(url) {
  const state = randomId(12);
  write(PENDING_KEY, { state, url });
  const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT, state });
  location.assign(`${url}/auth/authorize?${q}`);
}

// Call once on start-up. Returns null when this page load is not a sign-in return.
async function finishLogin() {
  const p = new URLSearchParams(location.search);
  const code = p.get('code');
  const state = p.get('state');
  if (!code || !state) return null;
  const pending = read(PENDING_KEY);
  write(PENDING_KEY, null);
  try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* ignore */ }
  if (!pending || pending.state !== state) return { ok: false, url: '' };
  try {
    const tok = await tokenRequest(pending.url, { grant_type: 'authorization_code', code });
    auth = {
      url: pending.url,
      scene: `peng_restore_${randomId(3)}`,
      refresh: tok.refresh_token,
      access: tok.access_token,
      expires: Date.now() + tok.expires_in * 1000,
    };
    write(AUTH_KEY, auth);
    setStatus('idle');
    return { ok: true, url: pending.url };
  } catch (e) {
    return { ok: false, url: pending.url };
  }
}

// Alternative to the login page: a long-lived access token from the Home Assistant profile
async function linkToken(url, token) {
  dropSocket();
  auth = { url, scene: `peng_restore_${randomId(3)}`, token };
  try {
    await connect();
  } catch (e) {
    auth = null;
    setStatus('off');
    throw e;
  }
  write(AUTH_KEY, auth);
}

function unlink() {
  const old = auth;
  if (held && dirty) putBack(0.3);
  clearEffects();
  held = false;
  armed = false;
  write(HELD_KEY, null);
  auth = null;
  write(AUTH_KEY, null);
  write(LIGHTS_KEY, null);
  // Give a pending restore a moment to leave before the socket closes
  setTimeout(() => { if (!auth) dropSocket(); }, 600);
  if (old && old.refresh) {
    fetch(`${old.url}/auth/token`, { method: 'POST', body: new URLSearchParams({ action: 'revoke', token: old.refresh }) }).catch(() => {});
  }
  setStatus('off');
}

async function accessToken(force) {
  if (auth.token) return auth.token;
  if (!force && auth.access && auth.expires - 60000 > Date.now()) return auth.access;
  const linked = auth;
  const tok = await tokenRequest(linked.url, { grant_type: 'refresh_token', refresh_token: linked.refresh });
  linked.access = tok.access_token;
  linked.expires = Date.now() + tok.expires_in * 1000;
  if (auth === linked) write(AUTH_KEY, auth);
  return linked.access;
}

/* ---------- WebSocket ---------- */

let sock = null;
let opening = null;
let nextId = 1;
const waiting = new Map(); // id -> { resolve, reject, timer }
const subs = new Map(); // id -> event handler

function dropSocket() {
  const ws = sock;
  sock = null;
  if (ws) {
    try { ws.close(); } catch (e) { /* ignore */ }
  }
}

function connect() {
  if (!auth) return Promise.reject(new Error('unlinked'));
  if (sock) return Promise.resolve();
  if (!opening) {
    setStatus('connecting');
    opening = open(false)
      .then(() => setStatus('online'), (e) => {
        if (auth) setStatus(e.message === 'denied' ? 'denied' : 'offline');
        throw e;
      })
      .finally(() => { opening = null; });
  }
  return opening;
}

async function open(retried) {
  let token;
  try {
    token = await accessToken(retried);
  } catch (e) {
    throw new Error(e.status >= 400 && e.status < 500 ? 'denied' : 'offline');
  }
  try {
    await handshake(token);
  } catch (e) {
    // The access token may have been revoked early: fetch a fresh one once
    if (e.message === 'denied' && !retried && auth && auth.refresh) return open(true);
    throw e;
  }
  return undefined;
}

function handshake(token) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`${auth.url.replace(/^http/, 'ws')}/api/websocket`);
    const fail = (why) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch (e) { /* ignore */ }
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('offline'), 8000);
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (m.type === 'auth_invalid') {
        fail('denied');
      } else if (m.type === 'auth_ok') {
        settled = true;
        clearTimeout(timer);
        sock = ws;
        resolve();
      } else if (m.type === 'result') {
        const w = waiting.get(m.id);
        if (!w) return;
        waiting.delete(m.id);
        clearTimeout(w.timer);
        if (m.success) w.resolve(m.result);
        else w.reject(new Error((m.error && m.error.message) || 'failed'));
      } else if (m.type === 'event') {
        const fn = subs.get(m.id);
        if (fn) fn(m.event);
      }
    };
    ws.onerror = () => fail('offline');
    ws.onclose = () => {
      fail('offline');
      if (sock !== ws) return;
      sock = null;
      waiting.forEach((w) => { clearTimeout(w.timer); w.reject(new Error('closed')); });
      waiting.clear();
      subs.clear();
      if (auth) setStatus('idle');
    };
  });
}

// Send a command and wait for its result
async function send(msg, wait = 8000) {
  await connect();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('timeout')); }, wait);
    waiting.set(id, { resolve, reject, timer });
    try {
      sock.send(JSON.stringify({ ...msg, id }));
    } catch (e) {
      clearTimeout(timer);
      waiting.delete(id);
      reject(e);
    }
  });
}

// Send without waiting. Effects must never queue up: if the line is down the
// command is dropped and a reconnect starts in the background.
function fire(msg) {
  if (!sock) {
    if (auth) connect().catch(() => {});
    return;
  }
  try { sock.send(JSON.stringify({ ...msg, id: nextId++ })); } catch (e) { /* ignore */ }
}

/* ---------- Lights ---------- */

// Rooms first (lights without a room last), then by name with numbers in natural order
const NATURAL = { numeric: true, sensitivity: 'base' };
const byAreaThenName = (a, b) => (!a.area - !b.area) || a.area.localeCompare(b.area, undefined, NATURAL) || a.name.localeCompare(b.name, undefined, NATURAL);

function cachedLights() {
  const c = read(LIGHTS_KEY);
  return c && auth && c.url === auth.url && Array.isArray(c.list) ? c : null;
}

function renderLights() {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const stop = (fn, value) => {
      clearTimeout(timer);
      subs.delete(id);
      waiting.delete(id);
      fn(value);
    };
    const timer = setTimeout(() => stop(reject, new Error('timeout')), 10000);
    subs.set(id, (ev) => {
      // The template stays subscribed on the server until we cancel it
      fire({ type: 'unsubscribe_events', subscription: id });
      if (ev.error || ev.result == null) { stop(reject, new Error('template')); return; }
      try {
        stop(resolve, typeof ev.result === 'string' ? JSON.parse(ev.result) : ev.result);
      } catch (e) {
        stop(reject, e);
      }
    });
    waiting.set(id, { resolve() {}, reject: (e) => stop(reject, e), timer: 0 });
    try {
      sock.send(JSON.stringify({ id, type: 'render_template', template: LIGHTS_TEMPLATE, timeout: 10, report_errors: true }));
    } catch (e) {
      stop(reject, e);
    }
  });
}

async function fetchLights() {
  await connect();
  let list;
  try {
    const rows = await renderLights();
    list = rows.map(([id, name, area, color]) => ({ id, name: String(name || id), area: String(area || ''), color: Boolean(color) }));
  } catch (e) {
    // Older or restricted setups: fall back to the full state dump and filter here
    const states = await send({ type: 'get_states' }, 15000);
    list = states
      .filter((s) => s.entity_id.startsWith('light.'))
      .map((s) => ({
        id: s.entity_id,
        name: String((s.attributes && s.attributes.friendly_name) || s.entity_id),
        area: '',
        color: ((s.attributes && s.attributes.supported_color_modes) || []).some((m) => COLOR_MODES.includes(m)),
      }));
  }
  list.sort(byAreaThenName);
  write(LIGHTS_KEY, { url: auth.url, at: Date.now(), list });
  return list;
}

/* ---------- Effects ---------- */

// Home Assistant itself remembers how the lights were: scene.create takes a
// snapshot before the first effect and scene.turn_on puts everything back.
const MIN_GAP = 420; // ms between tick commands: gentle on Zigbee and never a fast strobe
const RED = [255, 0, 0];

let targets = [];
let held = false; // a snapshot exists that has not been put back yet
let armed = false; // the snapshot is confirmed, effects may run
let dirty = false; // an effect has changed the lights since the snapshot
let snapshot = null;
let restoreTimer = 0;
let effectTimers = [];
let lastTick = 0;
let phase = 0;

const PRESETS = {
  pulse: (n) => ({ rgb_color: [255, 20, 0], brightness_pct: n % 2 ? 100 : 22, transition: 0.15 }),
  siren: (n) => ({ rgb_color: n % 2 ? RED : [0, 40, 255], brightness_pct: 100, transition: 0 }),
  fire: () => ({ rgb_color: [255, 60 + rnd(110), 0], brightness_pct: 30 + rnd(70), transition: 0.3 }),
  disco: (n) => ({ hs_color: [(n * 67 + rnd(30)) % 360, 100], brightness_pct: 100, transition: 0.1 }),
  dim: (n) => (n === 1 ? { rgb_color: RED, brightness_pct: 10, transition: 1 } : null),
};

const BOOM = [
  [0, { rgb_color: [255, 255, 255], brightness_pct: 100, transition: 0 }],
  [150, { rgb_color: RED, brightness_pct: 100, transition: 0 }],
  [340, { rgb_color: RED, brightness_pct: 6, transition: 0 }],
  [520, { rgb_color: [255, 80, 0], brightness_pct: 100, transition: 0 }],
  [760, { rgb_color: RED, brightness_pct: 100, transition: 0 }],
  [1100, { rgb_color: [255, 20, 0], brightness_pct: 20, transition: 1.4 }],
];
const BOOM_LENGTH = 3000;

function setLights(data) {
  dirty = true;
  fire({ type: 'call_service', domain: 'light', service: 'turn_on', service_data: data, target: { entity_id: targets } });
}

function clearEffects() {
  effectTimers.forEach(clearTimeout);
  effectTimers = [];
  clearTimeout(restoreTimer);
  restoreTimer = 0;
}

// Putting the lights back must not get lost, so this one waits for the line and retries
function putBack(transition, scene = auth && auth.scene) {
  if (!scene) return Promise.resolve(false);
  const cmd = { type: 'call_service', domain: 'scene', service: 'turn_on', service_data: { transition }, target: { entity_id: `scene.${scene}` } };
  return send(cmd)
    .catch(() => sleep(1500).then(() => send(cmd)))
    .then(() => true, () => false);
}

// Remember how the lights are right now. Call when the fuse is lit.
function arm(ids) {
  if (!auth || !ids.length) return Promise.resolve(false);
  clearEffects();
  targets = ids.slice();
  phase = 0;
  if (held) {
    // The last bang has not been put back yet: its snapshot is still the true "before"
    if (dirty) putBack(0.3);
    dirty = false;
    return Promise.resolve(snapshot).then(() => armed);
  }
  held = true;
  armed = false;
  dirty = false;
  write(HELD_KEY, auth.scene);
  const mine = send({ type: 'call_service', domain: 'scene', service: 'create', service_data: { scene_id: auth.scene, snapshot_entities: targets } })
    .then(() => true, () => false)
    .then((ok) => {
      if (snapshot !== mine) return false;
      armed = ok && held;
      if (!ok) {
        held = false;
        write(HELD_KEY, null);
      }
      return armed;
    });
  snapshot = mine;
  return mine;
}

function resetTick() {
  phase = 0;
  lastTick = 0;
}

// One step of the ticking effect; call on every tick of the bomb
function tick(preset) {
  if (!armed) return;
  const now = performance.now();
  if (now - lastTick < MIN_GAP) return;
  lastTick = now;
  phase += 1;
  const data = (PRESETS[preset] || PRESETS.pulse)(phase);
  if (data) setLights(data);
}

// Paused: show the room as it was, but keep the snapshot for the rest of the round
function pause() {
  if (!held || !dirty) return;
  clearEffects();
  dirty = false;
  putBack(0.4);
}

// The bang: white flash, red flicker, fade, then everything back to how it was
function boom() {
  if (!held) return;
  clearEffects();
  Promise.resolve(snapshot).then(() => {
    if (!armed) return;
    BOOM.forEach(([ms, data]) => effectTimers.push(setTimeout(() => setLights(data), ms)));
    restoreTimer = setTimeout(() => release(1.2), BOOM_LENGTH);
  });
}

// Put the lights back and forget the snapshot
function release(transition = 0.5) {
  clearEffects();
  if (!held) return;
  const scene = auth && auth.scene;
  const changed = dirty;
  held = false;
  armed = false;
  dirty = false;
  snapshot = null;
  if (!changed) {
    write(HELD_KEY, null);
    return;
  }
  putBack(transition, scene).then((ok) => { if (ok && !held) write(HELD_KEY, null); });
}

// If the page was closed in the middle of an effect, put the lights back on the next start
function recover() {
  const scene = read(HELD_KEY);
  if (!scene || !auth) return;
  putBack(0.5, scene).then((ok) => { if (ok && !held) write(HELD_KEY, null); });
}

// Preview from the settings screen
async function test(mode, preset, ids) {
  const ok = await arm(ids);
  if (!ok) throw new Error('failed');
  if (mode === 'tick') {
    resetTick();
    for (let i = 0; i < 6; i++) {
      tick(preset);
      await sleep(520);
    }
  }
  boom();
  await sleep(BOOM_LENGTH + 400);
}

export const ha = {
  get linked() { return Boolean(auth); },
  get status() { return status; },
  get host() { return auth ? new URL(auth.url).host : ''; },
  onStatus(fn) { listeners.add(fn); },
  login,
  finishLogin,
  linkToken,
  unlink,
  connect,
  cachedLights,
  fetchLights,
  arm,
  resetTick,
  tick,
  pause,
  boom,
  release,
  recover,
  test,
};
