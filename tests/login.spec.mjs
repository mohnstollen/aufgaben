// Nextcloud-Anmeldung: Login Flow v2, Anmelde-QR-Code (nc://login/…) als Text
import { test, expect } from '@playwright/test';
import { startDav, USER, PASS } from './helpers/mock-webdav.mjs';
import { openApp, addTask } from './helpers/app.mjs';

const openSyncDialog = async page => { await page.click('#settingsBtn'); await page.click('#syncSetupBtn'); };

test('Anmelde-QR-Code wird korrekt gelesen (URL-kodiert wie bei Nextcloud)', async ({ browser }) => {
  const { page } = await openApp(browser);
  const r = await page.evaluate(() => [
    parseNcLogin('nc://login/server:https://cloud.example.de&user:j%C3%B6rg&password:AbCd-EfGh-1234'),
    parseNcLogin('nc://login/user:max+mustermann%40example.de&password:x-y&server:cloud.example.de/nextcloud'),  // andere Reihenfolge, + = Leerzeichen
    parseNcLogin('https://example.de'),
    parseNcLogin('nc://login/server:https://a.de&user:x'),                                                    // Passwort fehlt
  ]);
  expect(r).toEqual([
    { server: 'https://cloud.example.de', user: 'jörg', pass: 'AbCd-EfGh-1234' },
    { server: 'cloud.example.de/nextcloud', user: 'max mustermann@example.de', pass: 'x-y' },
    null, null]);
  expect(await page.evaluate(() => [normServer('cloud.example.de/'), normServer('https://c.de/remote.php/dav/files/x'), normServer('http://lan:8080/index.php')]))
    .toEqual(['https://cloud.example.de', 'https://c.de', 'http://lan:8080']);
});

test('„Mit Nextcloud anmelden“ im Browser: Zugangsdaten werden übernommen, Sync startet', async ({ browser }) => {
  const dav = await startDav({ loginName: 'joerg@example.org' });   // Login per E-Mail, Benutzer-ID „jörg“
  const { page, errors } = await openApp(browser);
  await addTask(page, 'Bier austrinken');
  await page.evaluate(() => {                                         // Browserfenster abfangen
    window.__opened = [];
    window.open = () => ({ close() {}, opener: 1, location: { set href(u) { window.__opened.push(u); } } });
  });
  await openSyncDialog(page);
  await page.fill('#syncUrl', dav.url);
  await page.click('#ncLoginBtn');
  await expect(page.locator('#syncInfo')).toContainText('Zugriff gewähren');
  expect(await page.evaluate(() => window.__opened)).toEqual([dav.url + '/index.php/login/v2/flow/tok123']);
  dav.approve();
  await expect(page.locator('#syncStatus')).toHaveText(/☁️ \d/, { timeout: 10_000 });
  const cfg = await page.evaluate(() => getSyncCfg());
  expect(cfg).toMatchObject({ url: dav.url, user: 'joerg@example.org', pass: PASS, davUser: USER, path: 'Aufgaben/aufgaben.json' });
  expect(dav.names()).toEqual(['Bier austrinken']);                  // Datei liegt unter der Benutzer-ID
  expect(errors).toEqual([]);
  await dav.close();
});

test('Login Flow in der Android-App öffnet das Browser-Plugin', async ({ browser }) => {
  const dav = await startDav();
  const { page } = await openApp(browser, { native: {} });
  await openSyncDialog(page);
  await page.fill('#syncUrl', dav.url.replace('http://', 'http://'));
  await page.click('#ncLoginBtn');
  await expect.poll(() => page.evaluate(() => window.__native.log)).toContain(`browser ${dav.url}/index.php/login/v2/flow/tok123`);
  dav.approve();
  await expect.poll(() => page.evaluate(() => getSyncCfg()?.pass), { timeout: 10_000 }).toBe(PASS);
  expect(await page.evaluate(() => window.__native.log)).toContain('dav GET Aufgaben/aufgaben.json');
  await dav.close();
});

test('Nextcloud ohne CORS für die Anmeldung: verständlicher Hinweis im Browser', async ({ browser }) => {
  const dav = await startDav({ loginCors: false });
  const { page } = await openApp(browser);
  await page.evaluate(() => { window.open = () => ({ close() {}, location: {} }); });
  await openSyncDialog(page);
  await page.fill('#syncUrl', dav.url);
  await page.click('#ncLoginBtn');
  await expect(page.locator('#syncInfo')).toContainText('von Hand eintragen');
  await dav.close();
});

test('Ohne Adresse: Hinweis statt Anmeldeversuch', async ({ browser }) => {
  const { page } = await openApp(browser);
  await openSyncDialog(page);
  await page.click('#ncLoginBtn');
  await expect(page.locator('#syncInfo')).toContainText('Adresse Deiner Nextcloud eintragen');
});

test('QR-Text (nc://login/…) ins Adressfeld eingefügt wird direkt übernommen', async ({ browser }) => {
  const dav = await startDav();
  const { page } = await openApp(browser);
  await openSyncDialog(page);
  await page.fill('#syncUrl', `nc://login/server:${dav.url}&user:${encodeURIComponent(USER)}&password:${PASS}`);
  await expect(page.locator('#syncStatus')).toHaveText(/☁️ \d/);
  expect(await page.evaluate(() => getSyncCfg())).toMatchObject({ url: dav.url, user: USER, pass: PASS });
  await dav.close();
});
