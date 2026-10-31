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

## 🤖 Android-App (APK)
Zusätzlich zur PWA gibt es eine echte Android-App (mit [Capacitor](https://capacitorjs.com)
gebaut, Paket `io.github.mohnstollen.aufgaben`). Sie enthält dieselbe `index.html`, bringt aber
ein paar Vorteile mit:

- **Nextcloud-Sync ohne CORS-Einrichtung:** WebDAV läuft nativ, die App „WebAppPassword"
  wird nicht gebraucht. Ein App-Passwort reicht. Auch eine Nextcloud im Heimnetz unter
  `http://` funktioniert (dann allerdings unverschlüsselt).
- **Backups als echte Dateien:** Das tägliche Backup landet unter **Dokumente/Aufgaben**,
  alte Dateien werden nach Ablauf der Aufbewahrung automatisch gelöscht. Exporte laufen über
  das Android-**Teilen**-Menü (z. B. in Dateien, Nextcloud oder E-Mail).
- **Zurück-Taste** schließt offene Dialoge, statt die App zu beenden.
- Synchronisiert automatisch, sobald die App wieder in den Vordergrund kommt.

Die App-Daten sind von der Browser-/PWA-Version getrennt. Zum Umziehen den Nextcloud-Sync
auf beiden einrichten oder per Export/Import übertragen.

### APK herunterladen
Der Workflow `.github/workflows/android.yml` baut die APK automatisch:
- **Bei jedem Push** mit Änderungen an der App: im Tab **Actions** → Lauf „Android-APK" →
  unten unter **Artifacts** (als ZIP, darin die APK).
- **Als Release:** einen Tag setzen, z. B.
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```
  Dann hängt die APK am Release unter **Releases**. Mit der App
  [Obtainium](https://github.com/ImranR98/Obtainium) (Repo-URL eintragen) bekommst Du
  neue Releases automatisch aufs Handy.

Installieren: APK auf dem Handy öffnen und „Installation aus unbekannten Quellen" für den
Browser bzw. die Dateien-App erlauben.

### Signier-Schlüssel einrichten (einmalig, wichtig für Updates)
Android installiert ein Update nur, wenn es mit **demselben Schlüssel** signiert ist. Ohne
hinterlegten Schlüssel baut der Workflow eine Debug-APK mit wechselndem Schlüssel. Dann
muss die App für jedes Update deinstalliert werden, und dabei gehen die lokalen Daten verloren.

**Am einfachsten komplett im Browser (GitHub Codespace):**
1. Im Repo auf **Code → Codespaces → „Create codespace on main“** klicken.
2. Im Terminal unten ausführen:
   ```bash
   bash scripts/make-keystore.sh
   ```
   Zweimal ein neues Passwort eingeben. Das Skript erzeugt den Schlüssel und trägt die Secrets
   `ANDROID_KEYSTORE_BASE64` und `ANDROID_KEYSTORE_PASSWORD` automatisch ins Repo ein.
3. Links im Datei-Explorer `aufgaben-release.jks` mit Rechtsklick → **Download** sichern und
   zusammen mit dem Passwort aufbewahren, z. B. im Passwort-Manager. **Geht beides verloren,
   lässt sich die App nie wieder per Update aktualisieren.**
4. Den Codespace danach löschen (github.com/codespaces → „…“ → Delete).

Kann das Skript die Secrets nicht selbst setzen, legt es eine `aufgaben-release.jks.b64` an
und sagt, was Du unter **Settings → Secrets and variables → Actions** von Hand eintragen musst.
Das Skript läuft genauso auf dem eigenen Rechner, wenn Java (und optional die GitHub CLI)
installiert ist. Die `.jks`-Datei gehört **nicht** ins Repo (steht in `.gitignore`).

Danach ein Release anlegen (**Releases → Draft a new release**, Tag z. B. `v1.0.0` neu
erstellen → **Publish release**). Der Workflow hängt die signierte APK nach ein paar Minuten an.

### Selbst bauen (optional)
Mit Node.js 22, JDK 21 und Android SDK (z. B. über Android Studio):
```bash
npm ci
npm run sync          # Web-App nach www/ kopieren und ins Android-Projekt übernehmen
cd android && ./gradlew assembleDebug    # → app/build/outputs/apk/debug/app-debug.apk
```
Nach Änderungen an `index.html` immer erst `npm run sync` ausführen.

> **Hinweis zur bisherigen TWA** (`io.github.mohnstollen.twa`): Sie kann parallel installiert
> bleiben, weil sie eine andere Paket-ID hat. Ihre `assetlinks.json` muss allerdings unter
> `https://mohnstollen.github.io/.well-known/assetlinks.json` liegen, also im Repo
> `mohnstollen.github.io`. Hier unter `/aufgaben/` findet Android sie nicht, deshalb zeigt
> die TWA eine Adressleiste.

## 🔁 Änderungen / Updates ausrollen
Nach Änderungen einfach neu pushen:
```bash
git add -A && git commit -m "Update" && git push
```
Die Service-Worker-Cache-Version steht in `sw.js` (`const CACHE = 'aufgaben-v11'`).
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
├─ package.json             # Capacitor-Abhängigkeiten & Build-Skripte
├─ capacitor.config.json    # Konfiguration der Android-App
├─ scripts/build-web.mjs    # kopiert die Web-App nach www/
├─ android/                 # natives Android-Projekt (inkl. WebDAV-Plugin)
├─ .gitignore
├─ README.md
├─ icons/
│  ├─ icon-192.png
│  ├─ icon-512.png
│  ├─ icon-maskable-512.png
│  ├─ apple-touch-icon.png
│  └─ favicon.png
└─ .github/workflows/
   ├─ deploy.yml            # Auto-Deploy auf GitHub Pages
   └─ android.yml           # baut die APK
```

> **Warum `.nojekyll`?** GitHub Pages verarbeitet Seiten sonst mit Jekyll und ignoriert
> u. U. Dateien/Ordner mit führendem Unterstrich. Die leere `.nojekyll`-Datei schaltet das ab.
