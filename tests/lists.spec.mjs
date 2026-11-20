// Listen: Vorlagen, Durchläufe mit Checkliste, Sync zwischen zwei Geräten
import { test, expect } from '@playwright/test';
import { startDav } from './helpers/mock-webdav.mjs';
import { openApp, configureSync, syncNow, lastError, task } from './helpers/app.mjs';

let dav;
test.afterEach(async () => { await dav?.close(); dav = null; });

const tpl = { id: 'tp1', name: 'Dienstreise', items: ['Laptop', 'Ladegerät', 'Zahnbürste'], updatedAt: 1 };

test('Vorlage anlegen, starten, abhaken – die Vorlage bleibt unverändert', async ({ browser }) => {
  const { page, errors } = await openApp(browser);
  await page.click('#tplBtn');
  await page.click('#tplNew');
  await page.fill('#tplName', 'Dienstreise');
  await page.fill('#tplItems', 'Laptop\nLadegerät\n\nZahnbürste');
  await page.click('#tplSave');
  await expect(page.locator('#tplList')).toContainText('3 Einträge');
  await page.click('#tplList >> text=Starten');
  await expect(page.locator('#fName')).toHaveValue('Dienstreise');
  await page.fill('#fName', 'Dienstreise Hamburg');
  await page.fill('#fDue', '2026-12-03');
  await page.click('#saveTask');
  const card = page.locator('.task', { hasText: 'Dienstreise Hamburg' });
  await expect(card).toContainText('☑ 0/3');
  await card.locator('.tname').click();
  await expect(page.locator('#clOverlay')).toHaveClass(/show/);
  await page.locator('#clList label', { hasText: 'Laptop' }).click();
  await page.fill('#clAddInput', 'Anzug');
  await page.press('#clAddInput', 'Enter');
  await expect(page.locator('#clMeta')).toContainText('1 von 4');
  await page.click('#clClose');
  await expect(card).toContainText('☑ 1/4');
  const t = await page.evaluate(() => ({ tpl: data.templates[0].items, cl: data.tasks[0].checklist.map(i => i.text + (i.done ? '✓' : '')) }));
  expect(t.tpl).toEqual(['Laptop', 'Ladegerät', 'Zahnbürste']);
  expect(t.cl).toEqual(['Laptop✓', 'Ladegerät', 'Zahnbürste', 'Anzug']);
  // in Vorlage übernehmen
  await card.locator('.tname').click();
  await page.click('#clToTpl');
  expect(await page.evaluate(() => data.templates[0].items)).toEqual(['Laptop', 'Ladegerät', 'Zahnbürste', 'Anzug']);
  expect(errors).toEqual([]);
});

test('Schnelleingabe !Vorlage legt einen Durchlauf mit Datum an', async ({ browser }) => {
  const { page, errors } = await openApp(browser, { now: new Date('2026-11-16T10:00:00'), data: { tasks: [], tags: [], projects: [], templates: [tpl] } });
  await page.fill('#quickAdd', '!dienst Berlin morgen');
  await page.press('#quickAdd', 'Enter');
  const t = await page.evaluate(() => data.tasks[0]);
  expect(t.name).toBe('Dienstreise Berlin');
  expect(t.due).toBe('2026-11-17');
  expect(t.quick).toBeUndefined();
  expect(t.checklist.map(i => i.text)).toEqual(tpl.items);
  expect(errors).toEqual([]);
});

test('Wiederkehrender Durchlauf: nächste Runde mit leerer Checkliste', async ({ browser }) => {
  const { page } = await openApp(browser, { data: { tags: [], projects: [], templates: [tpl], tasks: [
    task('r1', 'Wocheneinkauf', { due: '2026-11-16', rec: '+1w', tpl: 'tp1', checklist: [{ id: 'i1', text: 'Milch', done: true, ts: 1 }] }) ] } });
  await page.evaluate(() => toggleDone('r1'));
  const next = await page.evaluate(() => data.tasks.find(t => !t.done));
  expect(next.checklist.map(i => i.done)).toEqual([false]);
});

test('Sync: Vorlagen und paralleles Abhaken auf zwei Geräten werden zusammengeführt', async ({ browser }) => {
  dav = await startDav();
  const start = { tags: [], projects: [], templates: [tpl], tasks: [
    task('d1', 'Dienstreise', { tpl: 'tp1', updatedAt: 1, checklist: tpl.items.map((text, i) => ({ id: 'i' + i, text, done: false, ts: 1 })) }) ] };
  const A = await openApp(browser, { data: start });
  await configureSync(A.page, dav); await syncNow(A.page);
  expect(await lastError(A.page)).toBeNull();
  const B = await openApp(browser);
  await configureSync(B.page, dav); await syncNow(B.page);
  expect(await B.page.evaluate(() => data.templates.map(x => x.name))).toEqual(['Dienstreise']);

  // A hakt Laptop ab, B hakt Zahnbürste ab und legt eine Vorlage an
  await A.page.evaluate(() => { clTaskId = 'd1'; clToggle('i0', true); });
  await B.page.evaluate(() => { clTaskId = 'd1'; clToggle('i2', true); data.templates.push({ id: 'tp2', name: 'Urlaub', items: ['Pass'] }); save(); });
  await syncNow(A.page); await syncNow(B.page); await syncNow(A.page);
  for (const { page } of [A, B]) {
    const s = await page.evaluate(() => ({ done: data.tasks[0].checklist.filter(i => i.done).map(i => i.text).sort(), tpls: data.templates.map(x => x.name).sort() }));
    expect(s).toEqual({ done: ['Laptop', 'Zahnbürste'], tpls: ['Dienstreise', 'Urlaub'] });
  }
  // Vorlage löschen kommt auf dem anderen Gerät an
  await A.page.evaluate(() => { data.templates = data.templates.filter(x => x.name !== 'Urlaub'); save(); });
  await syncNow(A.page); await syncNow(B.page);
  expect(await B.page.evaluate(() => data.templates.map(x => x.name))).toEqual(['Dienstreise']);
});
