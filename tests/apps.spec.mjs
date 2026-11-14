// App-Übersicht (apps/index.html): Liste, Detailseite, Suche – und dass zu jeder App Icon und Screenshots vorhanden sind
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

const URL = 'http://127.0.0.1:4173/apps/index.html';
const FILE = p => new globalThis.URL('../apps/' + p, import.meta.url).pathname;

test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', r => r.fulfill({
    json: { tag_name: 'v1.2.3', published_at: '2026-11-01T10:00:00Z', assets: [{ name: 'aufgaben.apk', size: 4194304 }] },
    headers: { 'access-control-allow-origin': '*' } }));
});

test('listet alle Apps; Icons und Screenshots liegen im Repo', async ({ page }) => {
  await page.goto(URL);
  const apps = await page.evaluate(() => APPS.map(a => ({ id: a.id, shots: a.shots })));
  await expect(page.locator('.list .item')).toHaveCount(apps.length);
  for (const a of apps) {
    expect(existsSync(FILE(`icons/${a.id}.png`)), `Icon für ${a.id}`).toBe(true);
    for (let i = 1; i <= a.shots; i++) expect(existsSync(FILE(`screenshots/${a.id}-${i}.webp`)), `Screenshot ${i} für ${a.id}`).toBe(true);
  }
});

test('Detailseite zeigt Beschreibung, Screenshots und Download mit Version aus dem Release', async ({ page }) => {
  await page.goto(URL);
  await page.locator('.list .item', { hasText: 'Aufgaben' }).click();
  await expect(page.locator('.head h1')).toHaveText('Aufgaben');
  await expect(page.locator('.shots img')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'APK laden' })).toHaveAttribute('href',
    'https://github.com/mohnstollen/aufgaben/releases/latest/download/aufgaben.apk');
  await expect(page.getByRole('link', { name: 'Öffnen', exact: true })).toHaveAttribute('href', 'https://mohnstollen.github.io/aufgaben/');
  await expect(page.locator('#ver')).toHaveText('1.2.3');
  await expect(page.locator('#size')).toHaveText('4,0 MB');
  await page.locator('.back').click();
  await expect(page.locator('.hero')).toBeVisible();
});

test('Suche und Kategorien filtern die Liste', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Spiele' }).click();
  await expect(page.locator('.list .item b')).toHaveText(['Spielekiste']);
  await page.getByRole('button', { name: 'Alle' }).click();
  await page.fill('#q', 'sudoku');
  await expect(page.locator('.list .item b')).toHaveText(['Spielekiste']);
  await page.fill('#q', 'gibtesnicht');
  await expect(page.locator('.empty')).toBeVisible();
});
