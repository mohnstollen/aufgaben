// Bedienung: Liste, Schnelleingabe, Bearbeiten, Wischen, Filter, Design
import { test, expect } from '@playwright/test';
import { openApp, task } from './helpers/app.mjs';

const NOW = new Date('2026-10-28T10:00:00+01:00');   // Mittwoch
const DATA = { projects: ['Allgemein', 'Büro', 'Haus'], tags: ['wichtig', 'telefon'], tasks: [
  task('o1', 'Rechnung bezahlen', { due: '2026-10-26', prio: 'Hoch', project: 'Büro', tags: ['wichtig'] }),
  task('t1', 'Bier austrinken', { due: '2026-10-28', project: 'Allgemein', note: 'Kühlschrank unten' }),
  task('t2', 'Zahnarzt anrufen', { due: '2026-10-28', prio: 'Hoch', project: 'Haus', tags: ['telefon'] }),
  task('w1', 'Rasen mähen', { due: '2026-11-01', prio: 'Niedrig', project: 'Haus' }),
  task('n1', 'Buch lesen', { prio: 'Niedrig' }),
  task('d1', 'Steuer', { project: 'Büro', done: true, doneAt: 1 }),
] };
const open = (browser, o = {}) => openApp(browser, { data: DATA, now: NOW, ...o });
const taskNames = page => page.locator('.tname').allTextContents();

test('Liste nach Fälligkeit gruppiert, bei gleichem Datum wichtigere zuerst', async ({ browser }) => {
  const { page, errors } = await open(browser);
  await expect(page.locator('.group-h')).toHaveText(['Überfällig 1', 'Heute 2', 'Nächste 7 Tage 1', 'Ohne Datum 1']);
  expect(await taskNames(page)).toEqual(['Rechnung bezahlen', 'Zahnarzt anrufen', 'Bier austrinken', 'Rasen mähen', 'Buch lesen']);
  await expect(page.locator('.badge.due')).toHaveText(['📅 seit 2 Tagen', '📅 heute', '📅 heute', '📅 So., 01.11.']);
  await expect(page.locator('#cntActive')).toHaveText('5');
  await expect(page.locator('#cntArchive')).toHaveText('1');
  await expect(page.locator('.tnote')).toHaveText('Kühlschrank unten');
  expect(errors).toEqual([]);
});

test('Schnelleingabe erkennt Projekt, Tags, Priorität und Datumsangaben', async ({ browser }) => {
  const { page } = await open(browser);
  const cases = {
    'Steuer machen +Büro @wichtig freitag (A)': { name: 'Steuer machen', due: '2026-10-30', prio: 'Hoch', project: 'Büro', tags: ['wichtig'] },
    'Geschenk kaufen #familie 24.12.': { name: 'Geschenk kaufen', due: '2026-12-24', tags: ['familie'] },
    'Termin +3t': { name: 'Termin', due: '2026-10-31' },
    'Reifen wechseln +2w +Auto': { name: 'Reifen wechseln', due: '2026-11-11', project: 'Auto' },
    'Abo kündigen +1m': { name: 'Abo kündigen', due: '2026-11-28' },
    'Heute Abend kochen': { name: 'Abend kochen', due: '2026-10-28' },
    'Arzt übermorgen': { name: 'Arzt', due: '2026-10-30' },
    'Team mittwoch': { name: 'Team', due: '2026-11-04' },                  // gleicher Wochentag → nächste Woche
    'Urlaub 15.03.27': { name: 'Urlaub', due: '2027-03-15' },
    'Frühjahrsputz 01.03.': { name: 'Frühjahrsputz', due: '2027-03-01' },  // ohne Jahr: nächstes Vorkommen
    'Version 31.02. prüfen': { name: 'Version 31.02. prüfen' },            // ungültiges Datum bleibt im Namen
    'ISO 2026-12-24 (C)': { name: 'ISO', due: '2026-12-24', prio: 'Niedrig' },
  };
  for (const [input, want] of Object.entries(cases)) {
    const got = await page.evaluate(i => parseQuick(i), input);
    expect(got, input).toEqual({ name: want.name, due: want.due || null, prio: want.prio || null,
      project: want.project || null, tags: want.tags || [] });
  }
});

test('Neue Aufgabe per Schnelleingabe und Enter', async ({ browser }) => {
  const { page } = await open(browser);
  await page.click('#fab');
  await page.fill('#fQuick', 'Laub rechen +Garten @draußen morgen (B)');
  await expect(page.locator('#quickPreview')).toContainText('morgen');
  await page.press('#fQuick', 'Enter');
  const t = await page.evaluate(() => data.tasks.find(x => x.name === 'Laub rechen'));
  expect(t).toMatchObject({ due: '2026-10-29', prio: 'Mittel', project: 'Garten', tags: ['draußen'] });
  await expect(page.locator('.group-h.tomorrow')).toHaveText('Morgen 1');
});

test('Antippen öffnet Bearbeiten: Notiz und „kein Projekt“', async ({ browser }) => {
  const { page } = await open(browser);
  await page.click('text=Rasen mähen');
  await expect(page.locator('#taskModalTitle')).toHaveText('Aufgabe bearbeiten');
  await page.fill('#fNote', 'Benzin kaufen');
  await page.selectOption('#fProject', '');
  await page.click('#saveTask');
  const t = await page.evaluate(() => data.tasks.find(x => x.id === 'w1'));
  expect(t).toMatchObject({ note: 'Benzin kaufen', project: null });
  await page.fill('#search', 'benzin');
  expect(await taskNames(page)).toEqual(['Rasen mähen']);
});

test('Löschen und Abhaken lassen sich rückgängig machen', async ({ browser }) => {
  const { page } = await open(browser);
  await page.click('[aria-label="Löschen: Rasen mähen"]');
  await expect(page.locator('#toastMsg')).toHaveText('„Rasen mähen" gelöscht');
  expect(await taskNames(page)).not.toContain('Rasen mähen');
  await page.click('#toastAction');
  expect(await taskNames(page)).toContain('Rasen mähen');

  await page.click('[aria-label="Als erledigt markieren: Buch lesen"]');
  expect(await page.evaluate(() => data.tasks.find(t => t.id === 'n1').done)).toBe(true);
  await page.click('#toastAction');
  expect(await page.evaluate(() => data.tasks.find(t => t.id === 'n1').done)).toBe(false);
});

test('Wischen: nach rechts erledigt, nach links gelöscht', async ({ browser }) => {
  const { page } = await open(browser);
  const swipe = (name, dir) => page.evaluate(([name, dir]) => {
    const el = [...document.querySelectorAll('.task')].find(e => e.textContent.includes(name));
    const r = el.getBoundingClientRect(), y = r.top + r.height / 2, x0 = r.left + r.width / 2;
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
    ev('pointerdown', x0);
    for (let i = 1; i <= 10; i++) ev('pointermove', x0 + dir * i * r.width * 0.05);
    ev('pointerup', x0 + dir * r.width * 0.5);
  }, [name, dir]);
  await swipe('Zahnarzt anrufen', 1);
  await expect.poll(() => page.evaluate(() => data.tasks.find(t => t.id === 't2').done)).toBe(true);
  await swipe('Bier austrinken', -1);
  await expect.poll(() => page.evaluate(() => data.tasks.some(t => t.id === 't1'))).toBe(false);
  await swipe('Rasen mähen', 0.2);                                             // zu kurz → nichts passiert
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => data.tasks.find(t => t.id === 'w1').done)).toBe(false);
});

test('Ansicht und Filter bleiben nach Neuladen erhalten', async ({ browser }) => {
  const { page } = await open(browser);
  await page.click('.chip:has-text("Haus")');
  expect(await taskNames(page)).toEqual(['Zahnarzt anrufen', 'Rasen mähen']);
  await page.selectOption('#sort', 'prio');
  await page.reload();
  await expect(page.locator('.chip.active')).toHaveText(['Haus']);
  await expect(page.locator('#sort')).toHaveValue('prio');
  await page.click('.chip.reset');
  await expect(page.locator('.chip.active')).toHaveCount(0);
  expect((await taskNames(page)).length).toBe(5);
});

test('Zurück-Taste im Browser schließt den Dialog statt die Seite zu verlassen', async ({ browser }) => {
  const { page } = await open(browser);
  await page.click('#fab');
  await expect(page.locator('#taskOverlay')).toHaveClass(/show/);
  await page.goBack();
  await expect(page.locator('#taskOverlay')).not.toHaveClass(/show/);
  expect(page.url()).toContain('/index.html');
  await page.click('#settingsBtn'); await page.click('#manageBtn');        // Wechsel von Dialog zu Dialog
  await page.goBack();
  await expect(page.locator('.overlay.show')).toHaveCount(0);
});

test('Design: folgt dem System und lässt sich fest einstellen', async ({ browser }) => {
  const { page } = await open(browser, { colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.click('#settingsBtn');
  await page.selectOption('#themeSel', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
