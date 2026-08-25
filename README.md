# 📋 Aufgabenverwaltung (PWA)

Eine installierbare, offline-fähige Aufgaben-App. Alle Daten bleiben **lokal** auf dem
Gerät (Local Storage) – kein Server, kein Konto, kein Tracking.

## Features
- Aufgaben mit Name, Fälligkeitsdatum, Priorität, Tags und Projekt
- Sortieren nach Fälligkeit / Priorität / Name / Erstelldatum
- Filtern nach Tags & Projekten, Live-Suche
- Tags und Projekte bearbeiten/löschen
- Erledigte Aufgaben abhaken → landen im Archiv
- **Export/Import** als JSON-Backup
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
Die Service-Worker-Cache-Version steht in `sw.js` (`const CACHE = 'aufgaben-v1'`).
Bei größeren Änderungen die Zahl erhöhen (z. B. `aufgaben-v2`), damit Clients frisch laden.

## 💾 Datensicherung
Daten liegen pro Gerät/Browser. Zum Übertragen zwischen Geräten den **Export/Import** nutzen.

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
