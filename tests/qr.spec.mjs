// QR-Code scannen Ende-zu-Ende: Chrome spielt ein Videobild mit einem Nextcloud-QR-Code als Kamera ein.
import { test, expect, chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { startDav, USER, PASS } from './helpers/mock-webdav.mjs';
import { openApp } from './helpers/app.mjs';

const PORT = 4180;
const SERVER = `http://127.0.0.1:${PORT}`;
const VIDEO = join(tmpdir(), 'aufgaben-qr-test.y4m');

/** Schreibt ein Standbild (Y4M, 640×480) mit dem QR-Code – Chrome wiederholt es als Kamerabild */
function writeQrVideo(text, file) {
  const W = 640, H = 480, { size, data } = text ? QRCode.create(text, { errorCorrectionLevel: 'M' }).modules : { size: 0, data: [] };
  const scale = Math.floor(Math.min(W, H) / (size + 8)), off = (n, s) => Math.floor((n - s * scale) / 2);
  const Y = Buffer.alloc(W * H, 235);                                  // weiß
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!data[r * size + c]) continue;
    for (let y = 0; y < scale; y++) Y.fill(16, (off(H, size) + r * scale + y) * W + off(W, size) + c * scale,
      (off(H, size) + r * scale + y) * W + off(W, size) + (c + 1) * scale);     // schwarz
  }
  const UV = Buffer.alloc(W * H / 4, 128);
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\nFRAME\n`), Y, UV, UV]));
}
writeQrVideo(`nc://login/server:${SERVER}&user:${encodeURIComponent(USER)}&password:${PASS}`, VIDEO);
const EMPTY = join(tmpdir(), 'aufgaben-qr-leer.y4m');
writeQrVideo('', EMPTY);
/** Eigener Browser, dessen „Kamera“ das angegebene Standbild zeigt */
const withCamera = file => chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${file}`] });

test('QR-Code eines App-Passworts scannen: Felder ausgefüllt, gespeichert, synchronisiert, Kamera aus', async () => {
  const browser = await withCamera(VIDEO);
  const dav = await startDav({ port: PORT });
  try {
    const { page, errors } = await openApp(browser);
    await page.click('#settingsBtn'); await page.click('#syncSetupBtn');
    await page.click('#qrScanBtn');
    // Scanner muss über dem Sync-Dialog liegen (sonst sieht man die Kamera nicht)
    expect(await page.evaluate(() => +getComputedStyle($('qrOverlay')).zIndex > +getComputedStyle($('syncOverlay')).zIndex)).toBe(true);
    await expect(page.locator('#syncStatus')).toHaveText(/☁️ \d/, { timeout: 15_000 });
    await expect(page.locator('#qrOverlay')).not.toHaveClass(/show/);
    expect(await page.evaluate(() => getSyncCfg())).toMatchObject({ url: SERVER, user: USER, pass: PASS });
    expect(await page.evaluate(() => qrStream)).toBeNull();                 // Kamera wieder freigegeben
    expect(dav.log.some(l => l.method === 'PUT')).toBe(true);
    expect(errors).toEqual([]);
  } finally { await dav.close(); await browser.close(); }
});

test('Scanner schließen beendet die Kamera', async () => {
  const browser = await withCamera(EMPTY);
  try {
    const { page } = await openApp(browser);
    await page.click('#settingsBtn'); await page.click('#syncSetupBtn');
    await page.click('#qrScanBtn');
    await expect(page.locator('#qrHint')).toHaveText('Kamera auf den QR-Code halten …', { timeout: 10_000 });
    await page.click('#qrCancel');
    await expect.poll(() => page.evaluate(() => qrStream)).toBeNull();
    expect(await page.evaluate(() => getSyncCfg())).toBeNull();
  } finally { await browser.close(); }
});
