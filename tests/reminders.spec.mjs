// Erinnerungen: Dialog, Planen/Abbrechen in der Android-App, Knöpfe in der Benachrichtigung, Wiederholung
import { test, expect } from '@playwright/test';
import { openApp, task } from './helpers/app.mjs';

const NOW = new Date('2026-11-12T10:00:00+01:00');   // Donnerstag
const data = tasks => ({ projects: [], tags: [], tasks });
const scheduled = page => page.evaluate(() => Object.values(window.__native.scheduled)
  .map(n => ({ task: n.extra.taskId, at: n.schedule.at.toISOString(), title: n.title, body: n.body, actions: n.actionTypeId })));
const open = (browser, tasks) => openApp(browser, { now: NOW, native: {}, data: data(tasks) });

test('Erinnerung im Dialog setzen: Vorschlag, Badge, geplante Benachrichtigung', async ({ browser }) => {
  const { page, errors } = await open(browser, [task('a', 'Zahnarzt anrufen', { due: '2026-11-14' })]);
  await page.click('text=Zahnarzt anrufen');
  await expect(page.locator('#fRemind')).toBeHidden();
  await page.check('#fRemindOn');
  await expect(page.locator('#fRemind')).toHaveValue('2026-11-14T09:00');          // Fälligkeitstag 9 Uhr
  await page.fill('#fRemind', '2026-11-13T18:30');
  await page.click('#saveTask');
  await expect(page.locator('.badge.remind')).toHaveText('🔔 morgen 18:30');
  await expect.poll(() => scheduled(page)).toEqual([{ task: 'a', at: '2026-11-13T17:30:00.000Z',
    title: 'Zahnarzt anrufen', body: 'Fällig übermorgen', actions: 'aufgabe' }]);
  expect(await page.evaluate(() => window.__native.log)).toContain('actions');
  expect(errors).toEqual([]);
});

test('Ohne Fälligkeit: nächste volle Stunde; Ändern, Abhaken und Löschen räumen auf', async ({ browser }) => {
  const { page } = await open(browser, [task('a', 'Paket', {}), task('b', 'Brief', { remind: '2026-11-12T15:00' })]);
  await expect.poll(() => scheduled(page)).toHaveLength(1);
  await page.click('text=Paket');
  await page.check('#fRemindOn');
  await expect(page.locator('#fRemind')).toHaveValue('2026-11-12T11:00');
  await page.click('#saveTask');
  await expect.poll(async () => (await scheduled(page)).map(s => s.task).sort()).toEqual(['a', 'b']);
  // Uhrzeit ändern → neu geplant
  await page.click('text=Brief'); await page.fill('#fRemind', '2026-11-12T16:00'); await page.click('#saveTask');
  await expect.poll(async () => (await scheduled(page)).find(s => s.task === 'b')?.at).toBe('2026-11-12T15:00:00.000Z');
  // Häkchen raus → abgebrochen
  await page.click('text=Brief'); await page.uncheck('#fRemindOn'); await page.click('#saveTask');
  await expect.poll(async () => (await scheduled(page)).map(s => s.task)).toEqual(['a']);
  // abhaken → abgebrochen
  await page.click('[aria-label="Als erledigt markieren: Paket"]');
  await expect.poll(() => scheduled(page)).toEqual([]);
});

test('Knöpfe in der Benachrichtigung: „Erledigt“ und „1 Std. später“', async ({ browser }) => {
  const { page } = await open(browser, [task('a', 'Müll', { remind: '2026-11-12T10:30' }), task('b', 'Blumen', { remind: '2026-11-12T10:45' })]);
  const fire = (actionId, taskId) => page.evaluate(([actionId, taskId]) =>
    window.__native.fire('ln:localNotificationActionPerformed', { actionId, notification: { extra: { taskId } } }), [actionId, taskId]);
  await expect.poll(() => scheduled(page)).toHaveLength(2);
  await fire('done', 'a');
  expect(await page.evaluate(() => data.tasks.find(t => t.id === 'a').done)).toBe(true);
  await expect(page.locator('#toastMsg')).toHaveText('„Müll" erledigt ✓');
  await fire('snooze', 'b');
  expect(await page.evaluate(() => data.tasks.find(t => t.id === 'b').remind)).toBe('2026-11-12T11:00');
  await expect.poll(async () => (await scheduled(page)).map(s => [s.task, s.at])).toEqual([['b', '2026-11-12T10:00:00.000Z']]);
  await fire('tap', 'b');
  await expect(page.locator('#taskOverlay')).toHaveClass(/show/);                   // Antippen öffnet die Aufgabe
});

test('Wiederkehrend: Erinnerung wandert mit dem Fälligkeitsdatum', async ({ browser }) => {
  const { page } = await open(browser, [task('m', 'Mülltonne raus', { due: '2026-11-12', rec: '+1w', remind: '2026-11-11T19:00' })]);
  await page.click('[aria-label="Als erledigt markieren: Mülltonne raus"]');
  const next = await page.evaluate(() => data.tasks.find(t => t.id === 'm~2026-11-19'));
  expect(next).toMatchObject({ due: '2026-11-19', remind: '2026-11-18T19:00' });     // weiterhin „am Vorabend 19 Uhr“
  await expect.poll(async () => (await scheduled(page)).map(s => s.task)).toEqual(['m~2026-11-19']);
});

test('Ausgelöste Erinnerung offener Aufgaben wird beim Start nicht weggeräumt', async ({ browser }) => {
  const { ctx, page } = await open(browser, [task('a', 'Schon erinnert', { remind: '2026-11-12T09:00' })]);
  await ctx.addInitScript(() => localStorage.setItem('taskmanager_reminders', JSON.stringify({ a: { nid: 7, at: Date.parse('2026-11-12T08:00:00Z'), name: 'Schon erinnert' } })));
  await page.reload();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__native.log.filter(l => l.startsWith('cancel')))).toEqual([]);
  await expect(page.locator('.badge.remind.past')).toHaveText('🔔 heute 09:00');
});

test('Schnellaufgaben haben keine Erinnerung', async ({ browser }) => {
  const { page } = await open(browser, [task('a', 'Rasen', { remind: '2026-11-12T15:00' })]);
  await page.click('text=Rasen'); await page.check('#fIsQuick'); await page.click('#saveTask');
  expect(await page.evaluate(() => data.tasks[0].remind)).toBeUndefined();
  await expect.poll(() => scheduled(page)).toEqual([]);
});
