// Kopiert die Web-App nach www/ – von dort übernimmt Capacitor sie in die Android-App.
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'icons'];
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of FILES) cpSync(f, `www/${f}`, { recursive: true });
console.log('www/ aktualisiert:', FILES.join(', '));
