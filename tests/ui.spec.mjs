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
  await expect(page.locator('.group-h')).toHaveText([/^Überfällig 1/, 'Heute 2', 'Nächste 7 Tage 1', 'Ohne Datum 1']);
  await expect(page.locator('.group-h.overdue .gh-btn')).toHaveText('Alle auf heute');
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
    'Müll rausbringen wöchentlich freitag': { name: 'Müll rausbringen', due: '2026-10-30', rec: '+1w' },
    'Filter wechseln rec:3m': { name: 'Filter wechseln', rec: '3m' },
    'Miete monatlich 01.11.': { name: 'Miete', due: '2026-11-01', rec: '+1m' },
  };
  for (const [input, want] of Object.entries(cases)) {
    const got = await page.evaluate(i => parseQuick(i), input);
    expect(got, input).toEqual({ name: want.name, due: want.due || null, prio: want.prio || null,
      project: want.project || null, tags: want.tags || [], rec: want.rec || null });
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

test.describe('Wiederkehrende Aufgaben', () => {
  test('Abhaken legt die nächste an; Rückgängig entfernt sie wieder', async ({ browser }) => {
    const { page } = await openApp(browser, { now: NOW, data: { projects: [], tags: [], tasks: [
      task('r1', 'Müll rausbringen', { due: '2026-10-28', rec: '+1w', tags: ['haus'] })] } });
    await expect(page.locator('.badge.rec')).toHaveText('🔁 wöchentlich');
    await page.click('[aria-label="Als erledigt markieren: Müll rausbringen"]');
    await expect(page.locator('#toastMsg')).toHaveText('Erledigt ✓ – nächstes Mal 04.11.2026');
    const after = await page.evaluate(() => data.tasks.map(t => ({ id: t.id, due: t.due, done: t.done, rec: t.rec, tags: t.tags })));
    expect(after).toEqual([
      { id: 'r1', due: '2026-10-28', done: true, rec: '+1w', tags: ['haus'] },
      { id: 'r1~2026-11-04', due: '2026-11-04', done: false, rec: '+1w', tags: ['haus'] }]);
    await page.click('#toastAction');
    expect(await page.evaluate(() => data.tasks.map(t => [t.id, t.done]))).toEqual([['r1', false]]);
  });

  test('Nächster Termin: fester Rhythmus, ab Erledigung, Monatsende, verpasste Termine', async ({ browser }) => {
    const { page } = await openApp(browser, { now: NOW });
    const next = await page.evaluate(() => [
      nextDue({ due: '2026-10-28', rec: '+1w' }),     // fester Rhythmus ab Fälligkeit
      nextDue({ due: '2026-10-20', rec: '1w' }),      // ab Erledigung (heute)
      nextDue({ due: '2026-01-31', rec: '+1m' }),     // überfällig seit Januar: nächster 31. nach heute, nicht der 28.
      nextDue({ due: null, rec: '+1m' }),             // ohne Datum: ab heute
      nextDue({ due: '2026-10-05', rec: '+2w' }),     // verpasste Termine überspringen
      addInterval('2027-01-31', 1, 'm'),              // Monatsende
      addInterval('2028-02-29', 1, 'y'),              // Schaltjahr
    ]);
    expect(next).toEqual(['2026-11-04', '2026-11-04', '2026-10-31', '2026-11-28', '2026-11-02', '2027-02-28', '2029-02-28']);
  });

  test('Wiederholung im Dialog wählen und in todo.txt exportieren', async ({ browser }) => {
    const { page } = await open(browser);
    await page.click('text=Buch lesen');
    await page.selectOption('#fRec', '+1m');
    await page.click('#saveTask');
    const line = await page.evaluate(() => taskToTodoTxt(data.tasks.find(t => t.id === 'n1')));
    expect(line).toMatch(/ rec:\+1m$/);
    const back = await page.evaluate(l => todoTxtToTask(l).rec, line);
    expect(back).toBe('+1m');
  });

  test('Zwei Geräte erledigen dieselbe Aufgabe: nach dem Sync nur eine Folgeaufgabe', async ({ browser }) => {
    const { startDav } = await import('./helpers/mock-webdav.mjs');
    const { configureSync, syncNow } = await import('./helpers/app.mjs');
    const dav = await startDav();
    const A = await openApp(browser, { now: NOW, data: { projects: [], tags: [], tasks: [task('r1', 'Müll', { due: '2026-10-28', rec: '+1w' })] } });
    const B = await openApp(browser, { now: NOW });
    await configureSync(A.page, dav); await configureSync(B.page, dav);
    await syncNow(A.page); await syncNow(B.page);
    await A.page.evaluate(() => toggleDone('r1')); await B.page.evaluate(() => toggleDone('r1'));
    await syncNow(A.page); await syncNow(B.page); await syncNow(A.page);
    const open = await B.page.evaluate(() => data.tasks.filter(t => !t.done).map(t => t.id));
    expect(open).toEqual(['r1~2026-11-04']);
    await dav.close();
  });
});

test.describe('Verschieben', () => {
  test('Datum antippen und auf morgen verschieben, mit Rückgängig', async ({ browser }) => {
    const { page } = await open(browser);
    await page.locator('.task:has-text("Rechnung bezahlen") [data-act=postpone]').click();
    await expect(page.locator('#ppTitle')).toHaveText('„Rechnung bezahlen" verschieben');
    await page.click('#ppGrid button:has-text("Morgen")');
    expect(await page.evaluate(() => data.tasks.find(t => t.id === 'o1').due)).toBe('2026-10-29');
    await expect(page.locator('#toastMsg')).toHaveText('„Rechnung bezahlen" → morgen');
    await page.click('#toastAction');
    expect(await page.evaluate(() => data.tasks.find(t => t.id === 'o1').due)).toBe('2026-10-26');
  });

  test('Nächsten Montag und eigenes Datum', async ({ browser }) => {
    const { page } = await open(browser);
    await page.locator('.task:has-text("Rasen mähen") [data-act=postpone]').click();
    await page.click('#ppGrid button:has-text("Nächsten Montag")');
    expect(await page.evaluate(() => data.tasks.find(t => t.id === 'w1').due)).toBe('2026-11-02');
    await page.locator('.task:has-text("Rasen mähen") [data-act=postpone]').click();
    await page.fill('#ppDate', '2026-12-01');
    await page.locator('#ppDate').dispatchEvent('change');
    expect(await page.evaluate(() => data.tasks.find(t => t.id === 'w1').due)).toBe('2026-12-01');
    await expect(page.locator('#postponeOverlay')).not.toHaveClass(/show/);
  });

  test('„Alle auf heute“ bei überfälligen Aufgaben', async ({ browser }) => {
    const { page } = await open(browser);
    await page.click('.group-h.overdue .gh-btn');
    await expect(page.locator('.group-h.overdue')).toHaveCount(0);
    await expect(page.locator('.group-h.today')).toHaveText(/^Heute 3/);
  });

  test('Schnellauswahl im Bearbeiten-Dialog', async ({ browser }) => {
    const { page } = await open(browser);
    await page.click('text=Buch lesen');
    await page.click('#dueQuick button:has-text("+1 Woche")');
    await expect(page.locator('#fDue')).toHaveValue('2026-11-04');
    await page.click('#dueQuick button:has-text("✕")');
    await expect(page.locator('#fDue')).toHaveValue('');
  });
});
