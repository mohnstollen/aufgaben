// Hilfsfunktionen: ein „Gerät" = eigener Browser-Kontext mit eigenem Local Storage
import { USER, PASS } from './mock-webdav.mjs';

export const APP = 'http://127.0.0.1:4173/index.html';

/** Feste Testdaten im Format der App */
export const task = (id, name, extra = {}) => ({ id, name, due: null, prio: 'Mittel', project: null, tags: [],
  done: false, doneAt: null, created: 1, ...extra });

/**
 * Öffnet die App in einem neuen Kontext.
 * @param {object} o
 * @param {object} [o.data]       Startdaten (taskmanager_v1), nur beim ersten Laden
 * @param {Date}   [o.now]        feste Uhrzeit (für datumsabhängige Tests)
 * @param {object} [o.native]     simulierte Android-App (siehe nativeMock)
 * @param {string} [o.colorScheme]
 */
export async function openApp(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
    colorScheme: o.colorScheme || 'dark', locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  if (o.data) {
    await ctx.addInitScript(d => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('taskmanager_v1', d);
    }, JSON.stringify(o.data));
  }
  if (o.native) await ctx.addInitScript(nativeMock, o.native);
  const page = await ctx.newPage();
  if (o.now) await page.clock.setFixedTime(o.now);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(APP);
  return { ctx, page, errors };
}

/** Sync direkt konfigurieren (ohne Dialog) */
export const configureSync = (page, dav, extra = {}) => page.evaluate(([url, user, pass, extra]) =>
  setSyncCfg({ url, user, pass, path: 'Aufgaben/aufgaben.json', auto: false, ...extra }), [dav.url, USER, PASS, extra]);

export const syncNow = page => page.evaluate(() => syncNow());
export const lastError = page => page.evaluate(() => getSyncCfg()?.lastError || null);
export const names = page => page.evaluate(() => data.tasks.map(t => t.name + (t.done ? ' ✓' : '')).sort());
export const addTask = (page, name, extra = {}) => page.evaluate(([name, extra]) => {
  data.tasks.push({ id: uid(), name, due: null, prio: 'Mittel', project: null, tags: [], done: false, doneAt: null, created: Date.now(), ...extra });
  save();
}, [name, extra]);

/**
 * Wird im Browser ausgeführt: bildet window.Capacitor mit den genutzten Plugins nach.
 * Aufrufe landen in window.__native.log, Dateien in window.__native.fs.
 */
function nativeMock({ version = '1.1.0', files = {} } = {}) {
  const log = [], fs = { ...files }, listeners = {};
  window.__native = { log, fs, fire: (ev, arg) => listeners[ev] && listeners[ev](arg) };
  window.Capacitor = { isNativePlatform: () => true, Plugins: {
    WebDav: { request: async ({ url, method, body, headers }) => {
      log.push(`dav ${method} ${decodeURIComponent(url.replace(/^.*\/files\/[^/]+\//, ''))}`);
      const r = await fetch(url, { method, body, headers });
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      return { status: r.status, headers: h, body: await r.text() };
    } },
    Filesystem: {
      writeFile: async o => { log.push(`write ${o.directory} ${o.path}`); fs[o.path] = o.data; return { uri: 'file:///' + o.path }; },
      readdir: async o => ({ files: Object.keys(fs).filter(k => k.startsWith(o.path + '/')).map(k => ({ name: k.slice(o.path.length + 1) })) }),
      deleteFile: async o => { log.push(`delete ${o.path}`); delete fs[o.path]; },
    },
    Share: { share: async o => { log.push(`share ${o.files.join(',')}`); } },
    App: { addListener: (ev, cb) => { listeners[ev] = cb; }, minimizeApp: async () => { log.push('minimize'); },
      getInfo: async () => ({ version }) },
    SystemBars: { setStyle: async o => { log.push(`bars ${o.style}`); } },
  } };
}
