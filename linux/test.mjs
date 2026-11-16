// Prüft die Linux-Anwendung Ende-zu-Ende gegen den Nextcloud-Nachbau der Playwright-Tests:
// Sync-Datei (WebDAV) und Nextcloud Tasks (CalDAV), zwei „Rechner“, Speichern über Neustarts,
// Schnelleingabe per Kommandozeile, Dateizugriffe.
// Aufruf:  node linux/test.mjs          (braucht xvfb-run; AUFGABEN_CMD="aufgaben" testet das installierte Paket)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { startDav, USER, PASS } from '../tests/helpers/mock-webdav.mjs';

const CMD = (process.env.AUFGABEN_CMD || `python3 ${new URL('aufgaben.py', import.meta.url).pathname}`).split(' ');
const tmp = mkdtempSync(join(tmpdir(), 'aufgaben-test-'));
const dav = await startDav();

/** Startet die App mit eigenem Benutzerordner, führt js in der Seite aus und liefert dessen Rückgabewert */
async function run(home, js, args = []) {
  const script = join(tmp, 'test.js');
  writeFileSync(script, js);
  // asynchron starten: der Nextcloud-Nachbau läuft in diesem Prozess und muss währenddessen antworten
  const child = spawn('xvfb-run', ['-a', ...CMD, ...args], { stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: join(tmp, home), XDG_DATA_HOME: '', XDG_CACHE_HOME: '', XDG_CONFIG_HOME: '', AUFGABEN_TEST_JS: script } });
  let out = '', err = '';
  child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  await new Promise(r => child.on('close', r));
  clearTimeout(timer);
  const line = out.split('\n').find(l => l.startsWith('TEST '));
  assert.ok(line, `keine Antwort der App:\n${out}\n${err}`);
  const res = JSON.parse(line.slice(5));
  assert.ok(!res.error, res.error);
  return res.ok;
}
const cfg = JSON.stringify({ url: dav.url, user: USER, pass: PASS, path: 'Aufgaben/aufgaben.json', auto: false, file: true, tasks: true });
const names = `data.tasks.map(t=>t.name).sort()`;
const step = async (name, fn) => { await fn(); console.log('✓', name); };

try {
  await step('Start: native Plugins, Version, sicherer Kontext', async () => {
    const r = await run('a', `const info=await Native.App.getInfo();
      return { linux:IS_LINUX, cls:document.documentElement.className, info, secure:isSecureContext, sw:!!navigator.serviceWorker?.controller };`);
    assert.equal(r.linux, true); assert.equal(r.cls, 'native'); assert.equal(r.secure, true);
    assert.match(r.info.version, /^\d+\.\d+/);
  });

  await step('Rechner A: Aufgabe anlegen, Sync-Datei und Nextcloud Tasks abgleichen', async () => {
    const r = await run('a', `setSyncCfg(${cfg}); addFromText('Steuer machen #büro morgen (A)'); await syncNow();
      return { err:getSyncCfg().lastError||null, names:${names} };`);
    assert.equal(r.err, null);
    assert.deepEqual(r.names, ['Steuer machen']);
    assert.deepEqual(dav.json().data.tasks.map(t => t.name), ['Steuer machen']);
    assert.deepEqual(dav.list().names(), ['Steuer machen']);
    assert.equal(dav.list().field('Steuer machen', 'CATEGORIES'), 'büro');
  });

  await step('Daten und Zugangsdaten bleiben über einen Neustart erhalten', async () => {
    const r = await run('a', `return { names:${names}, user:getSyncCfg()?.user };`);
    assert.deepEqual(r.names, ['Steuer machen']); assert.equal(r.user, USER);
  });

  await step('Rechner B: holt die Aufgabe, hakt sie ab', async () => {
    const r = await run('b', `setSyncCfg(${cfg}); await syncNow(); const t=data.tasks.find(t=>t.name==='Steuer machen');
      if(t){ setDone(t, true); save(); await syncNow(); }
      return { err:getSyncCfg().lastError||null, found:!!t };`);
    assert.equal(r.err, null); assert.equal(r.found, true);
    assert.deepEqual(dav.list().names(), ['Steuer machen ✓']);
  });

  await step('Rechner A: sieht die Aufgabe als erledigt', async () => {
    const r = await run('a', `await syncNow(); return { err:getSyncCfg().lastError||null, done:data.tasks.map(t=>t.done) };`);
    assert.equal(r.err, null); assert.deepEqual(r.done, [true]);
  });

  await step('aufgaben --neu TEXT legt eine Aufgabe an', async () => {
    const r = await run('c', `await new Promise(r=>setTimeout(r, 1500)); return ${names};`, ['--neu', 'Brot', 'kaufen']);
    assert.deepEqual(r, ['Brot kaufen']);
  });

  await step('Nicht erreichbarer Server wird als Netzwerkfehler gemeldet', async () => {
    const r = await run('d', `setSyncCfg({ ...${cfg}, url:'http://127.0.0.1:9' }); await syncNow(); return getSyncCfg().lastError||null;`);
    assert.match(String(r), /nicht erreichbar/);
  });

  await step('Tages-Backup unter Dokumente/Aufgaben; kein Zugriff außerhalb', async () => {
    const r = await run('e', `const F=Native.Filesystem;
      await F.writeFile({ path:'Aufgaben/todo_2026-01-01.txt', data:'x äöü', directory:'DOCUMENTS', recursive:true });
      const files=(await F.readdir({ path:'Aufgaben', directory:'DOCUMENTS' })).files.map(f=>f.name);
      let outside='erlaubt'; try{ await F.writeFile({ path:'../../boese.txt', data:'x', directory:'DOCUMENTS' }); }catch(e){ outside=e.message; }
      let scheme='erlaubt'; try{ await Native.WebDav.request({ url:'file:///etc/passwd', method:'GET', headers:{} }); }catch(e){ scheme=e.message; }
      return { files, outside, scheme };`);
    assert.deepEqual(r.files, ['todo_2026-01-01.txt']);
    assert.match(r.outside, /außerhalb/); assert.match(r.scheme, /Ungültige Adresse/);
    const docs = readdirSync(join(tmp, 'e')).filter(d => !d.startsWith('.'));
    assert.equal(docs.length, 1, 'genau ein Ordner (Dokumente) im Benutzerordner: ' + docs);
    assert.ok(existsSync(join(tmp, 'e', docs[0], 'Aufgaben', 'todo_2026-01-01.txt')));
  });
  console.log('Alle Linux-Tests bestanden.');
} finally {
  await dav.close();
  rmSync(tmp, { recursive: true, force: true });
}
