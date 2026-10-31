// Nextcloud-Sync gegen den WebDAV-Nachbau (Browser-Variante der App)
import { test, expect } from '@playwright/test';
import { startDav, USER } from './helpers/mock-webdav.mjs';
import { openApp, configureSync, syncNow, lastError, names, addTask, task } from './helpers/app.mjs';

let dav;
test.afterEach(async () => { await dav?.close(); dav = null; });

test('Einrichtung über den Dialog: falsches Passwort, dann Datei und Ordner anlegen', async ({ browser }) => {
  dav = await startDav();
  const { page, errors } = await openApp(browser, { data: { tasks: [task('a1', 'Bier austrinken')], projects: ['Allgemein'], tags: [] } });
  const setup = async pass => {
    await page.click('#settingsBtn'); await page.click('#syncSetupBtn');
    await page.fill('#syncUrl', dav.url); await page.fill('#syncUser', USER); await page.fill('#syncPass', pass);
    await page.click('#syncTest');
    await expect(page.locator('#syncInfo')).not.toContainText('Teste');
  };
  await setup('falsch');
  await expect(page.locator('#syncInfo')).toContainText('Anmeldung fehlgeschlagen');
  await page.keyboard.press('Escape');
  await setup('app-pass');
  await expect(page.locator('#syncInfo')).toContainText('wird beim ersten Sync angelegt');
  await page.click('#syncSave');
  await expect(page.locator('#syncStatus')).toHaveText(/☁️ \d/);
  expect(dav.log.map(l => l.method)).toContain('MKCOL');
  expect(dav.names()).toEqual(['Bier austrinken']);
  expect(errors).toEqual([]);
});

test('Zwei Geräte: Altdaten, Löschen, Tag löschen und gleichzeitige Änderungen', async ({ browser }) => {
  dav = await startDav();
  const legacy = { projects: ['Allgemein', 'Büro'], tags: ['wichtig', 'privat'], tasks: [   // altes Format ohne updatedAt
    task('a1', 'Steuer', { prio: 'Hoch', project: 'Büro', tags: ['wichtig'] }),
    task('a2', 'Einkaufen', { project: 'Allgemein', tags: ['privat'], created: 2 })] };
  const A = await openApp(browser, { data: legacy });
  const B = await openApp(browser);
  await configureSync(A.page, dav); await configureSync(B.page, dav);
  await syncNow(A.page); await syncNow(B.page);
  expect(await names(B.page)).toEqual(['Einkaufen', 'Steuer']);

  // B: neue Aufgabe, eine löschen, Tag „privat“ löschen – A ändert gleichzeitig etwas anderes
  await addTask(B.page, 'Zahnarzt anrufen', { tags: ['telefon'] });
  await B.page.evaluate(() => { delTask('a2'); deleteTag('privat'); });
  await A.page.evaluate(() => { data.tags.push('neuA'); save(); });
  await syncNow(B.page); await syncNow(A.page); await syncNow(B.page);

  for (const { page } of [A, B]) {
    expect(await names(page)).toEqual(['Steuer', 'Zahnarzt anrufen']);
    const tags = await page.evaluate(() => data.tags.slice().sort());
    expect(tags).toEqual(['neuA', 'telefon', 'wichtig']);
  }
  expect(dav.names()).toEqual(['Steuer', 'Zahnarzt anrufen']);
  expect([...A.errors, ...B.errors]).toEqual([]);
});

test('412: Änderung eines anderen Geräts zwischen Laden und Speichern wird zusammengeführt', async ({ browser }) => {
  dav = await startDav();
  const A = await openApp(browser), B = await openApp(browser);
  await configureSync(A.page, dav); await configureSync(B.page, dav);
  await addTask(A.page, 'Erste'); await syncNow(A.page); await syncNow(B.page);
  await addTask(A.page, 'Von A'); await addTask(B.page, 'Von B');
  let held = false;
  await A.page.route('**/aufgaben.json', async route => {
    if (route.request().method() === 'PUT' && !held) { held = true; await syncNow(B.page); }   // B schreibt dazwischen
    await route.continue();
  });
  await syncNow(A.page); await syncNow(B.page);
  expect(dav.log.some(l => l.method === 'PUT' && l.ifMatch)).toBe(true);
  expect(dav.names()).toEqual(['Erste', 'Von A', 'Von B']);
  expect(await names(A.page)).toEqual(['Erste', 'Von A', 'Von B']);
  expect(await names(B.page)).toEqual(['Erste', 'Von A', 'Von B']);
});

// protected: Upload läuft weiterhin mit Konfliktschutz (If-Match) und ohne einen einzigen 412
for (const [title, opts, protectedPut] of [
  ['komprimierter (schwacher) ETag wie bei nginx', { gzip: true }, true],
  ['ETag nicht lesbar und If-Match nicht erlaubt', { exposeEtag: false, allowIfMatch: false }, false],
  ['ETag passt nie zu If-Match', { badEtag: true }, false],
]) {
  test(`Server-Eigenheit: ${title} – zweiter Sync klappt trotzdem`, async ({ browser }) => {
    dav = await startDav(opts);
    const { page, errors } = await openApp(browser);
    await configureSync(page, dav);
    await addTask(page, 'Bier austrinken'); await syncNow(page);
    await addTask(page, 'Zweite Aufgabe'); await syncNow(page);
    expect(await lastError(page)).toBeNull();
    await expect(page.locator('#syncStatus')).toHaveText(/☁️ \d/);
    expect(dav.names()).toEqual(['Bier austrinken', 'Zweite Aufgabe']);
    if (protectedPut) {
      expect(dav.log.filter(l => l.status === 412)).toEqual([]);
      expect(dav.log.filter(l => l.method === 'PUT').at(-1).ifMatch).toBe('"1"');
    }
    expect(errors).toEqual([]);
  });
}

test('423: gesperrte Datei wird verständlich gemeldet und später erneut versucht', async ({ browser }) => {
  dav = await startDav({ lock: true });
  const { page } = await openApp(browser);
  await configureSync(page, dav, { auto: true });
  await addTask(page, 'Erste'); await syncNow(page);          // Datei existiert noch nicht → wird angelegt
  await addTask(page, 'Zweite'); await syncNow(page);
  await expect(page.locator('#syncStatus')).toHaveText('🔒 gesperrt');
  expect(await lastError(page)).toContain('gesperrt');
  expect(await page.evaluate(() => !!syncState.timer)).toBe(true);
  expect(dav.names()).toEqual(['Erste']);
});

test('Optionale todo.txt wird neben der JSON-Datei abgelegt', async ({ browser }) => {
  dav = await startDav();
  const { page } = await openApp(browser);
  await configureSync(page, dav, { todoTxt: true });
  await addTask(page, 'Steuer', { prio: 'Hoch', project: 'Büro', tags: ['wichtig'] });
  await syncNow(page);
  expect(dav.files.get('Aufgaben/todo.txt').body).toMatch(/^\(A\) \d{4}-\d{2}-\d{2} Steuer \+Büro @wichtig\n$/);
});

test('Import „Zusammenführen“ überspringt doppelte Aufgaben', async ({ browser }) => {
  const { page } = await openApp(browser);
  const count = await page.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      pendingImport = parseTodoTxtFile('(A) Neu importiert +Büro @wichtig\n');
      $('importMode').value = 'merge'; confirmImport();
    }
    return data.tasks.filter(t => t.name === 'Neu importiert').length;
  });
  expect(count).toBe(1);
});
