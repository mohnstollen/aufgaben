# 📋 Aufgabenverwaltung (PWA)

Eine installierbare, offline-fähige Aufgaben-App. Die Daten liegen **lokal** auf dem
Gerät (Local Storage) – kein Konto, kein Tracking. Optional lassen sie sich über die
**eigene Nextcloud** zwischen mehreren Geräten synchronisieren.

## Features
- Aufgaben mit Name, Fälligkeitsdatum, Priorität, Tags und Projekt
- Sortieren nach Fälligkeit / Priorität / Name / Erstelldatum
- Filtern nach Tags & Projekten, Live-Suche
- Tags und Projekte bearbeiten/löschen
- Erledigte Aufgaben abhaken → landen im Archiv
- **Export/Import** als JSON-Backup oder todo.txt
- **Nextcloud-Sync** per WebDAV (optional)
- **PWA**: installierbar, offline nutzbar

---

## 🚀 Auf GitHub Pages veröffentlichen

### Schritt 1 – Repository anlegen
1. Auf GitHub einloggen → **New repository**.
2. Name z. B. `aufgaben`, Sichtbarkeit **Public**, **ohne** README anlegen → **Create**.

### Schritt 2 – Dateien hochladen
**Variante A – per Weboberfläche (am einfachsten):**
1. Im leeren Repo auf **„uploading an existing file"** klicken.
2. Den **kompletten Inhalt** dieses Ordners hineinziehen – wichtig: die **Ordnerstruktur
   beibehalten** (`icons/`, `.github/`) und auch die versteckte Datei **`.nojekyll`** mit hochladen.
3. Unten **Commit changes**.

**Variante B – per Git (Copy & Paste):**
```bash
# im entpackten Projektordner ausführen
git init
git add -A
git commit -m "Initial commit: Aufgaben PWA"
git branch -M main
git remote add origin https://github.com/<DEIN-USER>/aufgaben.git
git push -u origin main
```

### Schritt 3 – Pages aktivieren
Es gibt zwei Wege – **einer reicht**:

- **Automatisch (empfohlen):** Der mitgelieferte Workflow `.github/workflows/deploy.yml`
  deployt bei jedem Push automatisch.
  → Repo **Settings → Pages → Build and deployment → Source: „GitHub Actions"** auswählen.

- **Klassisch:** Repo **Settings → Pages → Source: „Deploy from a branch"** →
  Branch `main`, Ordner `/ (root)` → **Save**.

Nach ~1 Minute ist die App erreichbar unter:
```
https://<DEIN-USER>.github.io/aufgaben/
```

### Schritt 4 – Auf Android installieren
1. Die Pages-URL in **Chrome** (Android) öffnen.
2. In der App auf **„📲 Installieren"** tippen – oder Chrome-Menü (⋮) → **„App installieren"**.
3. Icon liegt auf dem Homescreen, App startet im Vollbild und funktioniert **offline**. 🎉

---

## 🔁 Änderungen / Updates ausrollen
Nach Änderungen einfach neu pushen:
```bash
git add -A && git commit -m "Update" && git push
```
Die Service-Worker-Cache-Version steht in `sw.js` (`const CACHE = 'aufgaben-v8'`).
Bei größeren Änderungen die Zahl erhöhen (z. B. `aufgaben-v2`), damit Clients frisch laden.

## ☁️ Synchronisation mit Nextcloud
Die App speichert alle Aufgaben als JSON-Datei in Deiner Nextcloud (Standard:
`Aufgaben/aufgaben.json`). Jedes Gerät lädt die Datei, führt sie mit dem lokalen Stand
zusammen und lädt das Ergebnis wieder hoch.

### Einmalig in der Nextcloud
1. **App-Passwort anlegen:** Persönliche Einstellungen → Sicherheit → „Neues App-Passwort
   erstellen". Am besten ein eigenes pro Gerät, damit es sich einzeln widerrufen lässt.
2. **CORS freischalten:** Ab Werk erlaubt Nextcloud keine WebDAV-Zugriffe von anderen
   Webseiten. Als Admin die App **„WebAppPassword"** installieren und in ihren Einstellungen
   die Adresse der Aufgaben-App als erlaubte WebDAV-Origin eintragen, z. B.
   `https://<DEIN-USER>.github.io` (nur Schema + Host, ohne Pfad).
   Alternativ kann ein Reverse-Proxy vor der Nextcloud die CORS-Header setzen
   (erlaubte Methoden: `GET, PUT, MKCOL, OPTIONS`; Header: `Authorization, Content-Type, If-Match`;
   `Access-Control-Expose-Headers: ETag`).

### In der App
**⚙️ Einstellungen → ☁️ Nextcloud-Sync einrichten**: Adresse, Benutzername, App-Passwort und
Dateipfad eintragen, **Verbindung testen**, dann **Speichern & synchronisieren**. Auf allen
Geräten denselben Dateipfad verwenden.

- Synchronisiert wird beim Start, beim Zurückkehren in die App, kurz nach jeder Änderung,
  alle 5 Minuten und per Tipp auf den Status oben rechts.
- Offline geht nichts verloren: Änderungen werden beim nächsten Sync übertragen.
- Konflikte: Pro Aufgabe gewinnt die zuletzt geänderte Version. Ändern zwei Geräte **dieselbe**
  Aufgabe, bevor sie synchronisiert haben, setzt sich die spätere Änderung vollständig durch.
- Gelöschte Aufgaben werden 180 Tage lang als „gelöscht" vermerkt, damit sie nicht von einem
  anderen Gerät wieder auftauchen.
- Optional legt die App zusätzlich eine `todo.txt` im selben Ordner ab (nur Export, wird
  nicht zurückgelesen).
- Die Datei hat dasselbe Format wie der JSON-Export und kann auch direkt importiert werden.
- Zugangsdaten liegen nur im Local Storage des jeweiligen Geräts.
- Die Nextcloud muss per **https://** erreichbar sein: Eine HTTPS-Seite darf keine
  unverschlüsselten Adressen aufrufen.

## 💾 Datensicherung
Ohne Sync liegen die Daten pro Gerät/Browser. Zum Übertragen dann den **Export/Import** nutzen.
Beim Zusammenführen werden doppelte Aufgaben übersprungen.

## 📁 Projektstruktur
```
aufgaben/
├─ index.html               # die App
├─ manifest.webmanifest     # PWA-Manifest
├─ sw.js                    # Service Worker (Offline)
├─ .nojekyll                # verhindert Jekyll-Verarbeitung (wichtig!)
├─ .gitignore
├─ README.md
├─ icons/
│  ├─ icon-192.png
│  ├─ icon-512.png
│  ├─ icon-maskable-512.png
│  ├─ apple-touch-icon.png
│  └─ favicon.png
└─ .github/workflows/deploy.yml   # Auto-Deploy
```

> **Warum `.nojekyll`?** GitHub Pages verarbeitet Seiten sonst mit Jekyll und ignoriert
> u. U. Dateien/Ordner mit führendem Unterstrich. Die leere `.nojekyll`-Datei schaltet das ab.
