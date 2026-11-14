// Abgleich mit Nextcloud Tasks (CalDAV) gegen den Nachbau in helpers/mock-webdav.mjs
import { test, expect } from '@playwright/test';
import { startDav, USER } from './helpers/mock-webdav.mjs';
import { openApp, configureSync, syncNow, lastError, names, addTask, task } from './helpers/app.mjs';

let dav;
test.afterEach(async () => { await dav?.close(); dav = null; });

// Nur Nextcloud Tasks, ohne Sync-Datei
const tasksOnly = (page, extra = {}) => configureSync(page, dav, { file: false, tasks: true, ...extra });
const get = (page, name) => page.evaluate(n => data.tasks.find(t => t.name === n) || null, name);
const stamp = d => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
/** Aufgabe, wie sie die Tasks-App der Nextcloud anlegt */
const ncTodo = (uid, summary, lines = []) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nextcloud Tasks v0.16.1', 'BEGIN:VTODO',
  `UID:${uid}`, `CREATED:${stamp(new Date())}`, `LAST-MODIFIED:${stamp(new Date())}`, `DTSTAMP:${stamp(new Date())}`,
  `SUMMARY:${summary}`, ...lines, 'END:VTODO', 'END:VCALENDAR', ''].join('\r\n');

test('Erster Abgleich legt die Liste „Aufgaben“ an und lädt alle Felder hoch', async ({ browser }) => {
  dav = await startDav({ lists: { personal: { name: 'Persönlich', comps: ['VEVENT'] } } });
  const { page, errors } = await openApp(browser, { data: { tags: ['büro', 'wichtig'], projects: [], tasks: [
    task('a1', 'Steuer; Belege, Quittungen', { due: '2026-11-20', prio: 'Hoch', tags: ['büro', 'wichtig'], note: 'Zeile 1\nZeile 2', rec: '+1y' }),
    task('a2', 'Milch', { quick: true }),
    task('a3', 'Rasen mähen', { prio: 'Niedrig', done: true, doneAt: Date.now() - 3600e3 }),
    task('a4', 'Uralt erledigt', { done: true, doneAt: Date.now() - 90 * 86400e3 }),
    task('a5', 'Ein sehr langer Titel mit Umlauten äöüß und Emoji 🚲, der in der Datei umbrochen werden muss, weil er zu lang ist'),
  ] } });
  await tasksOnly(page);
  await syncNow(page);
  expect(await lastError(page)).toBeNull();
  const l = dav.list();
  expect(l.name).toBe('Aufgaben');
  expect(l.comps).toEqual(['VTODO']);
  // längst Erledigtes bleibt lokal und wird nicht hochgeladen
  expect(l.names()).toEqual(['Ein sehr langer Titel mit Umlauten äöüß und Emoji 🚲\\, der in der Datei umbrochen werden muss\\, weil er zu lang ist',
    'Milch', 'Rasen mähen ✓', 'Steuer\\; Belege\\, Quittungen']);
  const steuer = 'Steuer\\; Belege\\, Quittungen';
  expect(l.field(steuer, 'UID')).toBe('a1');
  expect(l.ics(steuer)).toContain('DUE;VALUE=DATE:20261120');
  expect(l.field(steuer, 'PRIORITY')).toBe('1');
  expect(l.field(steuer, 'CATEGORIES')).toBe('büro,wichtig');
  expect(l.field(steuer, 'DESCRIPTION')).toBe('Zeile 1\\nZeile 2');
  expect(l.field(steuer, 'X-AUFGABEN-REC')).toBe('+1y');
  expect(l.field('Milch', 'X-AUFGABEN-QUICK')).toBe('1');
  expect(l.field('Milch', 'PRIORITY')).toBeNull();                    // „Mittel“ = keine Priorität in der Nextcloud
  expect(l.field('Rasen mähen', 'PRIORITY')).toBe('9');
  expect(l.field('Rasen mähen', 'COMPLETED')).toMatch(/^\d{8}T\d{6}Z$/);
  for (const line of l.ics(steuer).split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  for (const line of l.ics(l.names()[0]).split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);

  // zweiter Abgleich ohne Änderungen: nur die Abfrage der Liste, kein Schreiben
  dav.log.length = 0;
  await syncNow(page);
  expect(dav.log.map(e => e.method)).toEqual(['REPORT']);
  expect(await names(page)).toHaveLength(5);
  expect(errors).toEqual([]);
});

test('Änderungen aus der Nextcloud kommen an: bearbeiten, abhaken, neu anlegen, löschen', async ({ browser }) => {
  dav = await startDav();
  const { page, errors } = await openApp(browser, { data: { tags: [], projects: [], tasks: [
    task('a1', 'Steuer', { due: '2026-11-20' }), task('a2', 'Einkaufen'), task('a3', 'Zahnarzt') ] } });
  await tasksOnly(page);
  await syncNow(page);
  const l = dav.list();
  l.edit('Steuer', { SUMMARY: 'Steuererklärung', 'DUE;VALUE=DATE': '20261201', PRIORITY: '3', CATEGORIES: 'finanzen,büro', DESCRIPTION: 'Elster\\, Belege' });
  l.edit('Einkaufen', { STATUS: 'COMPLETED', COMPLETED: '20261114T101500Z', 'PERCENT-COMPLETE': '100' });
  l.remove('Zahnarzt');
  // Uhrzeit in UTC: 23:30 UTC am 30.11. ist in Berlin schon der 1.12.
  l.add('7f0c2f0e-uuid.ics', ncTodo('7f0c2f0e-uuid', 'Aus der Tasks-App', ['DUE:20261130T233000Z', 'PRIORITY:7', 'CATEGORIES:neu']));
  await syncNow(page);

  expect(await lastError(page)).toBeNull();
  expect(await names(page)).toEqual(['Aus der Tasks-App', 'Einkaufen ✓', 'Steuererklärung']);
  expect(await get(page, 'Steuererklärung')).toMatchObject({ id: 'a1', due: '2026-12-01', prio: 'Hoch', tags: ['finanzen', 'büro'], note: 'Elster, Belege' });
  expect((await get(page, 'Einkaufen')).doneAt).toBe(Date.UTC(2026, 10, 14, 10, 15));
  expect(await get(page, 'Aus der Tasks-App')).toMatchObject({ id: '7f0c2f0e-uuid', due: '2026-12-01', prio: 'Niedrig', tags: ['neu'], done: false });
  expect(await page.evaluate(() => data.tags.slice().sort())).toEqual(['büro', 'finanzen', 'neu']);
  expect(await page.evaluate(() => 'a3' in data.tombstones)).toBe(true);   // Löschung erreicht über die Sync-Datei auch andere Geräte
  await expect(page.locator('.task', { hasText: 'Steuererklärung' })).toBeVisible();

  // nichts davon wird zurückgeschrieben
  dav.log.length = 0;
  await syncNow(page);
  expect(dav.log.map(e => e.method)).toEqual(['REPORT']);
  expect(errors).toEqual([]);
});

test('Lokale Änderungen gehen in die Nextcloud; fremde Angaben (Erinnerung, Uhrzeit, Unteraufgabe) bleiben erhalten', async ({ browser }) => {
  dav = await startDav({ lists: { aufgaben: { name: 'Aufgaben' } } });
  const l = dav.list();
  l.add('n1.ics', ncTodo('n1', 'Vortrag', ['DTSTART;TZID=Europe/Berlin:20261118T090000', 'DUE;TZID=Europe/Berlin:20261120T170000', 'PRIORITY:3',
    'RELATED-TO:eltern-uid', 'X-APPLE-SORT-ORDER:42', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Erinnerung', 'TRIGGER:-PT1H', 'END:VALARM']));
  const { page, errors } = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Bleibt'), task('a2', 'Wird gelöscht')] } });
  await tasksOnly(page);
  await syncNow(page);
  expect(await get(page, 'Vortrag')).toMatchObject({ due: '2026-11-20', prio: 'Hoch' });

  await page.evaluate(() => {
    const v = data.tasks.find(t => t.name === 'Vortrag');
    Object.assign(v, { name: 'Vortrag halten', due: '2026-11-27', tags: ['arbeit'], note: 'Folien!' });
    delTask('a2');
    setDone(data.tasks.find(t => t.id === 'a1'), true);
    save();
  });
  await syncNow(page);
  expect(await lastError(page)).toBeNull();
  expect(l.names()).toEqual(['Bleibt ✓', 'Vortrag halten']);
  const ics = l.ics('Vortrag halten');
  expect(ics).toContain('DUE;TZID=Europe/Berlin:20261127T170000');     // Datum neu, Uhrzeit bleibt
  expect(ics).toContain('PRIORITY:3');                                  // unverändert, also nicht auf 1 umgeschrieben
  expect(ics).toContain('CATEGORIES:arbeit');
  expect(ics).toContain('DESCRIPTION:Folien!');
  for (const keep of ['DTSTART;TZID=Europe/Berlin:20261118T090000', 'RELATED-TO:eltern-uid', 'X-APPLE-SORT-ORDER:42', 'TRIGGER:-PT1H', 'DESCRIPTION:Erinnerung', 'PRODID:-//Nextcloud Tasks'])
    expect(ics).toContain(keep);
  expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1);

  // wieder öffnen und Datum entfernen
  await page.evaluate(() => { setDone(data.tasks.find(t => t.id === 'a1'), false); data.tasks.find(t => t.name === 'Vortrag halten').due = null; save(); });
  await syncNow(page);
  expect(l.names()).toEqual(['Bleibt', 'Vortrag halten']);
  expect(l.field('Bleibt', 'COMPLETED')).toBeNull();
  expect(l.field('Bleibt', 'STATUS')).toBe('NEEDS-ACTION');
  expect(l.field('Vortrag halten', 'DUE')).toBeNull();
  expect(errors).toEqual([]);
});

test('Auf beiden Seiten geändert: die jüngere Änderung gewinnt', async ({ browser }) => {
  dav = await startDav();
  const { page, errors } = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Eins'), task('a2', 'Zwei')] } });
  await tasksOnly(page);
  await syncNow(page);
  const l = dav.list();
  // „Eins“: erst lokal, danach in der Nextcloud geändert → Nextcloud gewinnt
  await page.evaluate(() => { data.tasks.find(t => t.id === 'a1').name = 'Eins lokal'; save(); });
  l.edit('Eins', { SUMMARY: 'Eins Nextcloud', 'LAST-MODIFIED': stamp(new Date(Date.now() + 60e3)) });
  // „Zwei“: in der Nextcloud vor einer Stunde, lokal eben geändert → lokal gewinnt
  l.edit('Zwei', { SUMMARY: 'Zwei Nextcloud', 'LAST-MODIFIED': stamp(new Date(Date.now() - 3600e3)) });
  await page.evaluate(() => { data.tasks.find(t => t.id === 'a2').name = 'Zwei lokal'; save(); });
  await syncNow(page);
  expect(await names(page)).toEqual(['Eins Nextcloud', 'Zwei lokal']);
  expect(l.names()).toEqual(['Eins Nextcloud', 'Zwei lokal']);
  expect(await lastError(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('Lokal bearbeitet, in der Nextcloud gelöscht: die Aufgabe bleibt und wird neu hochgeladen', async ({ browser }) => {
  dav = await startDav();
  const { page } = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Eins'), task('a2', 'Zwei')] } });
  await tasksOnly(page);
  await syncNow(page);
  dav.list().remove('Eins'); dav.list().remove('Zwei');
  await page.evaluate(() => { data.tasks.find(t => t.id === 'a1').name = 'Eins geändert'; save(); });
  await syncNow(page);
  expect(await names(page)).toEqual(['Eins geändert']);
  expect(dav.list().names()).toEqual(['Eins geändert']);
});

test('Wiederkehrende Aufgabe in der Nextcloud abgehakt: die App legt die nächste an', async ({ browser }) => {
  dav = await startDav();
  const { page, errors } = await openApp(browser, { now: new Date('2026-11-14T10:00:00'),
    data: { tags: [], projects: [], tasks: [task('a1', 'Blumen gießen', { due: '2026-11-14', rec: '+1w' })] } });
  await tasksOnly(page);
  await syncNow(page);
  dav.list().edit('Blumen gießen', { STATUS: 'COMPLETED', COMPLETED: '20261114T090000Z' });
  await syncNow(page);
  expect(await names(page)).toEqual(['Blumen gießen', 'Blumen gießen ✓']);
  expect((await page.evaluate(() => data.tasks.find(t => !t.done))).due).toBe('2026-11-21');
  expect(dav.list().names()).toEqual(['Blumen gießen', 'Blumen gießen ✓']);
  expect(errors).toEqual([]);
});

test('Zwei Geräte mit Sync-Datei und Nextcloud Tasks: keine Doppelten, Löschen und Änderungen wandern überallhin', async ({ browser }) => {
  dav = await startDav();
  const A = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Steuer'), task('a2', 'Einkaufen')] } });
  const B = await openApp(browser);
  for (const d of [A, B]) await configureSync(d.page, dav, { tasks: true });
  await syncNow(A.page); await syncNow(B.page); await syncNow(A.page);
  const l = dav.list();
  expect(l.names()).toEqual(['Einkaufen', 'Steuer']);
  expect(await names(B.page)).toEqual(['Einkaufen', 'Steuer']);

  // B legt an und löscht, in der Nextcloud wird „Steuer“ umbenannt
  await addTask(B.page, 'Zahnarzt');
  await B.page.evaluate(() => delTask('a2'));
  l.edit('Steuer', { SUMMARY: 'Steuer 2026' });
  for (let i = 0; i < 2; i++) { await syncNow(B.page); await syncNow(A.page); }
  for (const d of [A, B]) {
    expect(await names(d.page)).toEqual(['Steuer 2026', 'Zahnarzt']);
    expect(await lastError(d.page)).toBeNull();
  }
  expect(l.names()).toEqual(['Steuer 2026', 'Zahnarzt']);
  expect(dav.names()).toEqual(['Steuer 2026', 'Zahnarzt']);

  // danach ist Ruhe: kein Gerät schreibt mehr
  dav.log.length = 0;
  await syncNow(A.page); await syncNow(B.page);
  expect(dav.log.filter(e => e.method === 'PUT' || e.method === 'DELETE')).toEqual([]);
  expect([...A.errors, ...B.errors]).toEqual([]);
});

test('Hier gelöscht, in der Nextcloud noch vorhanden (neues Gerät ohne Abgleichsstand): wird dort gelöscht', async ({ browser }) => {
  dav = await startDav({ lists: { aufgaben: { name: 'Aufgaben' } } });
  dav.list().add('a9.ics', ncTodo('a9', 'Schon gelöscht', [`LAST-MODIFIED:${stamp(new Date(Date.now() - 86400e3))}`]).replace(/LAST-MODIFIED:.*\r\n/, ''));
  const { page } = await openApp(browser, { data: { tags: [], projects: [], tasks: [], tombstones: { a9: Date.now() } } });
  await tasksOnly(page);
  await syncNow(page);
  expect(await names(page)).toEqual([]);
  expect(dav.list().names()).toEqual([]);
});

test('Liste in der Nextcloud geleert: lokal bleibt alles und wird neu hochgeladen', async ({ browser }) => {
  dav = await startDav();
  const tasks = Array.from({ length: 6 }, (_, i) => task('a' + i, 'Aufgabe ' + i));
  const { page } = await openApp(browser, { data: { tags: [], projects: [], tasks } });
  await tasksOnly(page);
  await syncNow(page);
  dav.list().clear();
  await syncNow(page);
  expect(await names(page)).toHaveLength(6);
  expect(dav.list().names()).toHaveLength(6);
});

test('Server ohne lesbaren ETag beim Schreiben: Abgleich bleibt stabil', async ({ browser }) => {
  dav = await startDav({ putEtag: false });
  const { page } = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Eins')] } });
  await tasksOnly(page);
  await syncNow(page); await syncNow(page);
  await page.evaluate(() => { data.tasks[0].name = 'Eins neu'; save(); });
  await syncNow(page);
  dav.list().edit('Eins neu', { SUMMARY: 'Eins Nextcloud', 'LAST-MODIFIED': stamp(new Date(Date.now() + 60e3)) });
  await syncNow(page); await syncNow(page);
  expect(await names(page)).toEqual(['Eins Nextcloud']);
  expect(dav.list().names()).toEqual(['Eins Nextcloud']);
  dav.log.length = 0;
  await syncNow(page);
  expect(dav.log.filter(e => e.method === 'PUT')).toEqual([]);
  expect(await lastError(page)).toBeNull();
});

test('Einrichtung im Dialog: Listen laden, vorhandene Liste wählen, ohne Sync-Datei', async ({ browser }) => {
  dav = await startDav({ lists: { personal: { name: 'Persönlich', comps: ['VEVENT', 'VTODO'] }, termine: { name: 'Termine', comps: ['VEVENT'] }, 'haus halt': { name: 'Haushalt' } } });
  dav.list('haus halt').add('h1.ics', ncTodo('h1', 'Müll rausbringen'));
  const { page, errors } = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Fenster putzen')] } });
  await page.click('#settingsBtn'); await page.click('#syncSetupBtn');
  await page.fill('#syncUrl', dav.url); await page.fill('#syncUser', USER); await page.fill('#syncPass', 'app-pass');
  await expect(page.locator('#syncTasksBox')).toBeHidden();
  await page.locator('label.switch:has(#syncFile)').click();
  await page.click('#syncSave');
  await expect(page.locator('#syncInfo')).toContainText('mindestens eine Art');
  await page.locator('label.switch:has(#syncTasks)').click();
  await expect(page.locator('#syncPath')).toBeHidden();
  await page.click('#syncTasksLoad');
  await expect(page.locator('#syncInfo')).toContainText('2 Aufgabenliste(n) gefunden');
  await expect(page.locator('#syncTasksCal option')).toHaveText(['Liste „Aufgaben“ (wird bei Bedarf angelegt)', 'Persönlich', 'Haushalt']);
  await page.selectOption('#syncTasksCal', { label: 'Haushalt' });
  await page.click('#syncSave');
  await expect(page.locator('#syncStatus')).toHaveText(/☁️ \d/);
  expect(await names(page)).toEqual(['Fenster putzen', 'Müll rausbringen']);
  expect(dav.list('haus halt').names()).toEqual(['Fenster putzen', 'Müll rausbringen']);
  expect(dav.list().exists).toBe(false);                               // keine zusätzliche Liste angelegt
  expect(dav.files.size).toBe(0);                                      // keine Sync-Datei
  // Dialog zeigt die Auswahl beim nächsten Öffnen wieder
  await page.click('#settingsBtn'); await page.click('#syncSetupBtn');
  await expect(page.locator('#syncTasks')).toBeChecked();
  await expect(page.locator('#syncTasksCal')).toHaveValue(/haus%20halt\/$/);
  expect(errors).toEqual([]);
});

test('Android-App: Abgleich läuft über das native WebDAV-Plugin', async ({ browser }) => {
  dav = await startDav();
  const { page, errors } = await openApp(browser, { native: {}, data: { tags: [], projects: [], tasks: [task('a1', 'Eins')] } });
  await tasksOnly(page);
  await syncNow(page);
  dav.list().edit('Eins', { SUMMARY: 'Eins aus der Nextcloud' });
  await syncNow(page);
  expect(await names(page)).toEqual(['Eins aus der Nextcloud']);
  const log = await page.evaluate(() => window.__native.log.filter(l => l.startsWith('dav ')).map(l => l.split(' ')[1]));
  expect(log).toEqual(expect.arrayContaining(['PROPFIND', 'MKCALENDAR', 'REPORT', 'PUT']));
  expect(await lastError(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('Liste gibt es nicht mehr: verständliche Meldung, lokal bleibt alles', async ({ browser }) => {
  dav = await startDav();
  const { page } = await openApp(browser, { data: { tags: [], projects: [], tasks: [task('a1', 'Eins')] } });
  await tasksOnly(page);
  await syncNow(page);
  dav.cals.delete('aufgaben');
  await syncNow(page);
  expect(await lastError(page)).toContain('gibt es in der Nextcloud nicht mehr');
  expect(await names(page)).toEqual(['Eins']);
});
