// Android-App: Capacitor-Plugins werden im Browser nachgebildet (siehe helpers/app.mjs)
import { test, expect } from '@playwright/test';
import { startDav } from './helpers/mock-webdav.mjs';
import { openApp, configureSync, syncNow, addTask, task } from './helpers/app.mjs';

const nativeLog = page => page.evaluate(() => window.__native.log);

test('Sync läuft über das native WebDAV-Plugin und legt Ordner an', async ({ browser }) => {
  const dav = await startDav({ gzip: true });
  const { page, errors } = await openApp(browser, { native: {} });
  await configureSync(page, dav);
  await addTask(page, 'Erste'); await syncNow(page);
  await addTask(page, 'Zweite'); await syncNow(page);
  const log = await nativeLog(page);
  expect(log).toContain('dav MKCOL Aufgaben');
  expect(log.filter(l => l === 'dav PUT Aufgaben/aufgaben.json').length).toBeGreaterThanOrEqual(2);
  expect(dav.names()).toEqual(['Erste', 'Zweite']);
  await page.click('#settingsBtn'); await page.click('#syncSetupBtn');
  await expect(page.locator('li.web-only').first()).toBeHidden();   // CORS-Hinweise nur im Browser
  expect(errors).toEqual([]);
  await dav.close();
});

test('Zurück-Taste schließt Dialoge, sonst geht die App in den Hintergrund', async ({ browser }) => {
  const { page } = await openApp(browser, { native: {} });
  await page.click('#settingsBtn');
  await page.evaluate(() => window.__native.fire('backButton'));
  await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
  await page.evaluate(() => window.__native.fire('backButton'));
  expect(await nativeLog(page)).toContain('minimize');
});

test('Tägliches Backup unter Dokumente/Aufgaben, alte Dateien werden gelöscht', async ({ browser }) => {
  const { page } = await openApp(browser, {
    native: { files: { 'Aufgaben/todo_2020-01-01.txt': 'alt', 'Aufgaben/notiz.txt': 'fremd' } },
    data: { tasks: [task('n1', 'Nativ')], projects: ['Allgemein'], tags: [] },
  });
  await page.evaluate(() => { setAutoDl({ enabled: true, lastDate: null }); scheduleAutoDownload(); });
  await expect.poll(() => nativeLog(page)).toContain('delete Aufgaben/todo_2020-01-01.txt');
  const files = Object.keys(await page.evaluate(() => window.__native.fs));
  expect(files).toContain('Aufgaben/notiz.txt');                                   // fremde Dateien bleiben
  expect(files.some(f => /^Aufgaben\/todo_\d{4}-\d{2}-\d{2}\.txt$/.test(f))).toBe(true);
});

test('Export läuft über das Teilen-Menü', async ({ browser }) => {
  const { page } = await openApp(browser, { native: {}, data: { tasks: [task('n1', 'Nativ')], projects: [], tags: [] } });
  await page.click('#settingsBtn'); await page.click('#exportTxtBtn');
  await expect.poll(() => nativeLog(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^share file:\/\/\/todo_.*\.txt$/)]));
});

test.describe('Update-Prüfung', () => {
  async function withRelease(browser, installed, latest) {
    const app = await openApp(browser, { native: { version: installed } });
    const { ctx, page } = app;
    let downloaded = null;
    await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ tag_name: latest, assets: [{ name: 'aufgaben.apk',
        browser_download_url: `https://github.com/mohnstollen/aufgaben/releases/download/${latest}/aufgaben.apk` }] }) }));
    await ctx.route('https://github.com/**', r => { downloaded = r.request().url(); r.fulfill({ status: 200, body: '' }); });
    await page.reload();
    return { ...app, downloaded: () => downloaded };
  }

  test('neuere Version wird gemeldet und lässt sich laden', async ({ browser }) => {
    const { page, downloaded } = await withRelease(browser, '1.0.0', 'v1.1.12');
    await expect(page.locator('#toast')).toContainText('Version 1.1.12 ist verfügbar', { timeout: 8000 });
    await page.click('#settingsBtn');
    await expect(page.locator('#appVer')).toHaveText('1.0.0');
    await expect(page.locator('#updateBtn')).toHaveText('Version 1.1.12 laden');
    await page.click('#updateBtn');
    await expect.poll(downloaded).toBe('https://github.com/mohnstollen/aufgaben/releases/download/v1.1.12/aufgaben.apk');
  });

  test('aktuelle Version: „neueste Version“', async ({ browser }) => {
    const { page } = await withRelease(browser, '1.1.12', 'v1.1.12');
    await page.click('#settingsBtn');
    await expect(page.locator('#appVer')).toHaveText('1.1.12');
    await page.click('#updateBtn');
    await expect(page.locator('#toastMsg')).toHaveText('Du hast die neueste Version (1.1.12).');
  });

  test('Test-Build vom Branch erkennt das neuere Release', async ({ browser }) => {
    const { page } = await withRelease(browser, '1.1.9-dev.98ad9e0', 'v1.1.12');
    await expect(page.locator('#toast')).toContainText('Version 1.1.12 ist verfügbar', { timeout: 8000 });
  });
});
