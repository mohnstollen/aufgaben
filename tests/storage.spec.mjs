// Speicher: Snapshots in IndexedDB, Übernahme alter Snapshots, Warnung bei vollem Speicher
import { test, expect } from '@playwright/test';
import { openApp, addTask, task } from './helpers/app.mjs';

const snapshots = page => page.evaluate(async () => (await snapAll()).map(h => ({ date: h.date, lines: h.text.trim().split('\n').length })));
// Datum wie in der App (Ortszeit des Browsers), damit der Test auch kurz nach Mitternacht stimmt
const DAY_MS = 86400000;
let todayLocal;
const daysAgo = n => { const [y, m, d] = todayLocal.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d) - n * DAY_MS); return t.toISOString().slice(0, 10); };
const setToday = async page => { todayLocal = await page.evaluate(() => toDateStr(Date.now())); };

test('Alte Snapshots aus dem Local Storage wandern nach IndexedDB', async ({ browser }) => {
  const { ctx, page, errors } = await openApp(browser, { data: { tasks: [task('a', 'Aktuell')], projects: [], tags: [] } });
  await setToday(page);
  const old = [{ date: daysAgo(2), updatedAt: '2026-01-01T10:00:00Z', text: 'Alt 1\n' },
    { date: daysAgo(1), updatedAt: '2026-01-02T10:00:00Z', text: 'Alt 1\nAlt 2\n' }];
  await ctx.addInitScript(o => { if (!sessionStorage.__snap) { sessionStorage.__snap = 1;
    localStorage.setItem('taskmanager_todotxt_history', o); localStorage.setItem('taskmanager_todotxt', '{"text":"x"}'); } }, JSON.stringify(old));
  await page.reload();
  await expect.poll(() => snapshots(page)).toEqual([
    { date: daysAgo(2), lines: 1 }, { date: daysAgo(1), lines: 2 }, { date: daysAgo(0), lines: 1 }]);
  expect(await page.evaluate(() => [localStorage.getItem('taskmanager_todotxt_history'), localStorage.getItem('taskmanager_todotxt')])).toEqual([null, null]);
  await page.click('#settingsBtn'); await page.click('#backupsBtn');
  await expect(page.locator('#backupList .manage-item')).toHaveCount(3);
  await expect(page.locator('#storageInfo')).toContainText('Aufgabenliste: 1 Aufgaben');
  expect(errors).toEqual([]);
});

test('Snapshot nur bei Änderungen, einer pro Tag; Aufbewahrung räumt alte weg', async ({ browser }) => {
  const { page } = await openApp(browser);
  await setToday(page);
  await addTask(page, 'Erste');
  await expect.poll(() => snapshots(page)).toEqual([{ date: daysAgo(0), lines: 1 }]);
  await addTask(page, 'Zweite');
  await expect.poll(() => snapshots(page)).toEqual([{ date: daysAgo(0), lines: 2 }]);     // derselbe Tag wird überschrieben
  await page.evaluate(d => snapWrite([{ date: d, updatedAt: '', text: 'uralt\n' }]), daysAgo(40));
  await page.click('#settingsBtn'); await page.click('#backupsBtn');
  await page.selectOption('#retentionSel', '14');
  await page.selectOption('#retentionSel', '30');                                          // Änderung löst Aufräumen aus
  await expect.poll(() => snapshots(page)).toEqual([{ date: daysAgo(0), lines: 2 }]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('todotxt')))).toEqual([]);
});

test('Voller Speicher: deutliche Warnung statt stillem Datenverlust', async ({ browser }) => {
  const { ctx, page } = await openApp(browser);
  await ctx.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'taskmanager_v1' && window.__full) throw new DOMException('voll', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#storageWarn')).toBeHidden();
  await page.evaluate(() => { window.__full = true; });
  await addTask(page, 'Geht nicht');
  await expect(page.locator('#storageWarn')).toBeVisible();
  await expect(page.locator('#toastMsg')).toContainText('Speicher voll');
  await page.evaluate(() => { window.__full = false; });
  await addTask(page, 'Geht wieder');
  await expect(page.locator('#storageWarn')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('taskmanager_v1')).tasks.map(t => t.name))).toEqual(['Geht nicht', 'Geht wieder']);
});
